const { initAuthCreds, BufferJSON, proto } = require("@whiskeysockets/baileys");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DB_PATH = path.join(__dirname, "../../session", "auth_info.db");

let defaultAuthState;

function prepareDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    const directory = path.dirname(databasePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }

  const database = new DatabaseSync(databasePath, { timeout: 5000 });

  if (databasePath !== ":memory:") {
    fs.chmodSync(databasePath, 0o600);
  }

  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec(
    "CREATE TABLE IF NOT EXISTS auth_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );

  return database;
}

function createSQLiteAuthState(databasePath = DEFAULT_DB_PATH) {
  const database = prepareDatabase(databasePath);
  const readStatement = database.prepare(
    "SELECT value FROM auth_store WHERE key = ?",
  );
  const readManyStatement = database.prepare(
    "SELECT key, value FROM auth_store WHERE key IN (SELECT value FROM json_each(?))",
  );
  const upsertStatement = database.prepare(
    `INSERT INTO auth_store (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const deleteStatement = database.prepare(
    "DELETE FROM auth_store WHERE key = ?",
  );
  const clearKeysStatement = database.prepare(
    "DELETE FROM auth_store WHERE key != 'creds'",
  );

  function readData(key) {
    const result = readStatement.get(key);
    return result ? JSON.parse(result.value, BufferJSON.reviver) : null;
  }

  function writeData(key, value) {
    upsertStatement.run(key, JSON.stringify(value, BufferJSON.replacer));
  }

  function runTransaction(operation) {
    database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }
  }

  const creds = readData("creds") || initAuthCreds();
  const keys = {
    get: async (type, ids) => {
      const data = Object.create(null);
      if (ids.length === 0) return data;

      const idByKey = new Map(ids.map((id) => [`${type}-${id}`, id]));
      const rows = readManyStatement.all(JSON.stringify([...idByKey.keys()]));

      for (const row of rows) {
        const id = idByKey.get(row.key);
        const value = JSON.parse(row.value, BufferJSON.reviver);

        data[id] =
          type === "app-state-sync-key"
            ? proto.Message.AppStateSyncKeyData.fromObject(value)
            : value;
      }

      return data;
    },
    set: async (data) => {
      runTransaction(() => {
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries || {})) {
            const key = `${type}-${id}`;
            if (value == null) {
              deleteStatement.run(key);
            } else {
              writeData(key, value);
            }
          }
        }
      });
    },
    clear: async () => {
      clearKeysStatement.run();
    },
  };

  let closed = false;
  return {
    state: { creds, keys },
    saveCreds: async () => writeData("creds", creds),
    close: () => {
      if (!closed) {
        database.close();
        closed = true;
      }
    },
  };
}

async function useSQLiteAuthState() {
  if (!defaultAuthState) {
    defaultAuthState = createSQLiteAuthState();
  }
  return defaultAuthState;
}

function closeSQLiteAuthState() {
  defaultAuthState?.close();
  defaultAuthState = undefined;
}

module.exports = {
  DEFAULT_DB_PATH,
  createSQLiteAuthState,
  useSQLiteAuthState,
  closeSQLiteAuthState,
};

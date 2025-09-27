// store.js
const { initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");
const sqlite3 = require("sqlite3").verbose();
const { promisify } = require("util");
const fs = require("fs"); // <--- السطر الجديد الأول
const path = require("path");

const dbPath = path.join(__dirname, "session", "auth_info.db");

// Ensure the session directory exists before connecting
const sessionDir = path.dirname(dbPath);
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

// Setup the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite database.", err);
  } else {
    console.log("Successfully connected to SQLite database.");
  }
});

// Promisify DB methods for async/await usage
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));

// Ensure the key-value table exists
const createTable = async () => {
  await dbRun(
    "CREATE TABLE IF NOT EXISTS auth_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  );
};

// Core functions to interact with the DB
const readData = async (key) => {
  const result = await dbGet("SELECT value FROM auth_store WHERE key = ?", key);
  if (result?.value) {
    return JSON.parse(result.value, BufferJSON.reviver);
  }
  return null;
};

const writeData = async (key, value) => {
  const valueStr = JSON.stringify(value, BufferJSON.replacer);
  await dbRun(
    "INSERT OR REPLACE INTO auth_store (key, value) VALUES (?, ?)",
    key,
    valueStr
  );
};

const removeData = async (key) => {
  await dbRun("DELETE FROM auth_store WHERE key = ?", key);
};

/**
 * This function creates a store that mimics the official 'useMultiFileAuthState'
 * but uses SQLite as the backend.
 */
const useSQLiteAuthState = async () => {
  await createTable(); // Ensure table exists before we start

  // 1. Read the credentials from the database
  let creds = (await readData("creds")) || initAuthCreds();

  // 2. Create the key store object with the required methods
  const keys = {
    /**
     * Gets a key from the store.
     * @param {string} type - The type of key (e.g., 'pre-key', 'session').
     * @param {string[]} ids - The IDs of the keys to retrieve.
     */
    get: async (type, ids) => {
      const data = {};
      for (const id of ids) {
        const key = `${type}-${id}`;
        const value = await readData(key);
        if (value) {
          data[id] = value;
        }
      }
      return data;
    },
    /**
     * Sets keys in the store.
     * @param {object} data - The data to set, formatted as { 'pre-key': { 1: keyData, 2: keyData } }.
     */
    set: async (data) => {
      const tasks = [];
      for (const type in data) {
        for (const id in data[type]) {
          const value = data[type][id];
          const key = `${type}-${id}`;
          tasks.push(value ? writeData(key, value) : removeData(key));
        }
      }
      await Promise.all(tasks);
    },
  };

  return {
    state: { creds, keys },
    saveCreds: () => {
      // The 'creds.update' event listener will update the creds object in memory.
      // This function is called to persist it to the database.
      return writeData("creds", creds);
    },
  };
};

module.exports = { useSQLiteAuthState };

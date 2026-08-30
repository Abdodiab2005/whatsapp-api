const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BufferJSON } = require("@whiskeysockets/baileys");
const { DatabaseSync } = require("node:sqlite");
const { createSQLiteAuthState } = require("../src/utils/store");

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wa-api-store-"));
  return {
    databasePath: path.join(directory, "auth_info.db"),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test("SQLite auth state persists existing schema data and buffers", async (t) => {
  const temporary = temporaryDatabase();
  t.after(temporary.cleanup);

  const legacy = new DatabaseSync(temporary.databasePath);
  legacy.exec(
    "CREATE TABLE auth_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  legacy
    .prepare("INSERT INTO auth_store (key, value) VALUES (?, ?)")
    .run(
      "session-existing",
      JSON.stringify({ secret: Buffer.from("legacy") }, BufferJSON.replacer),
    );
  legacy.close();

  const auth = createSQLiteAuthState(temporary.databasePath);
  const existing = await auth.state.keys.get("session", ["existing"]);
  assert.deepEqual(existing.existing.secret, Buffer.from("legacy"));

  auth.state.creds.testMarker = "persisted";
  await auth.saveCreds();
  await auth.state.keys.set({ session: { new: { value: 42 } } });
  auth.close();

  const reopened = createSQLiteAuthState(temporary.databasePath);
  assert.equal(reopened.state.creds.testMarker, "persisted");
  const stored = await reopened.state.keys.get("session", ["new"]);
  assert.deepEqual(stored.new, { value: 42 });
  reopened.close();

  assert.equal(fs.statSync(temporary.databasePath).mode & 0o777, 0o600);
});

test("SQLite auth key batches roll back completely on failure", async (t) => {
  const temporary = temporaryDatabase();
  t.after(temporary.cleanup);
  const auth = createSQLiteAuthState(temporary.databasePath);

  await assert.rejects(
    auth.state.keys.set({
      session: {
        first: { value: "would-have-written" },
        second: 1n,
      },
    }),
    /BigInt/,
  );

  const stored = await auth.state.keys.get("session", ["first", "second"]);
  assert.equal(Object.keys(stored).length, 0);
  auth.close();
});

test("clearing signal keys preserves credentials", async (t) => {
  const temporary = temporaryDatabase();
  t.after(temporary.cleanup);
  const auth = createSQLiteAuthState(temporary.databasePath);

  auth.state.creds.testMarker = "keep";
  await auth.saveCreds();
  await auth.state.keys.set({ session: { one: { value: 1 } } });
  await auth.state.keys.clear();
  auth.close();

  const reopened = createSQLiteAuthState(temporary.databasePath);
  assert.equal(reopened.state.creds.testMarker, "keep");
  const stored = await reopened.state.keys.get("session", ["one"]);
  assert.equal(Object.keys(stored).length, 0);
  reopened.close();
});

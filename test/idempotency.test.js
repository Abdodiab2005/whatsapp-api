const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const AppError = require("../src/utils/AppError");
const {
  createFingerprint,
  createIdempotencyExecutor,
  createIdempotencyStore,
  validateIdempotencyKey,
} = require("../src/utils/idempotency");

test("concurrent and completed retries execute a send exactly once", async (t) => {
  const store = createIdempotencyStore(":memory:");
  const execute = createIdempotencyExecutor(store);
  t.after(() => store.close());

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let executions = 0;
  const request = {
    key: "request-0001",
    scope: "POST /send",
    payload: { number: "+201001234567", message: "hello" },
    operation: async () => {
      executions += 1;
      await gate;
      return {
        statusCode: 200,
        body: { success: true, data: { messageId: "message-1" } },
      };
    },
  };

  const first = execute(request);
  const concurrent = execute({
    ...request,
    operation: async () => {
      executions += 1;
      throw new Error("duplicate operation must not run");
    },
  });
  release();

  const [firstResult, concurrentResult] = await Promise.all([
    first,
    concurrent,
  ]);
  const replay = await execute({
    ...request,
    operation: async () => {
      executions += 1;
      throw new Error("completed operation must not run again");
    },
  });

  assert.equal(executions, 1);
  assert.equal(firstResult.replayed, false);
  assert.equal(concurrentResult.replayed, true);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, firstResult.body);
});

test("idempotency results survive restart and raw keys are not stored", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "wa-api-idempotency-"),
  );
  const databasePath = path.join(directory, "idempotency.db");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const firstStore = createIdempotencyStore(databasePath);
  const firstExecutor = createIdempotencyExecutor(firstStore);
  await firstExecutor({
    key: "persistent-request-1",
    scope: "POST /channel/send",
    payload: { jid: "1234567890@newsletter", message: "hello" },
    operation: async () => ({
      statusCode: 200,
      body: { success: true, data: { messageId: "message-2" } },
    }),
  });
  firstStore.close();

  let executions = 0;
  const secondStore = createIdempotencyStore(databasePath);
  t.after(() => secondStore.close());
  const replay = await createIdempotencyExecutor(secondStore)({
    key: "persistent-request-1",
    scope: "POST /channel/send",
    payload: { jid: "1234567890@newsletter", message: "hello" },
    operation: async () => {
      executions += 1;
    },
  });

  assert.equal(replay.replayed, true);
  assert.equal(executions, 0);
  assert.equal(fs.statSync(databasePath).mode & 0o777, 0o600);
  assert.equal(
    fs.readFileSync(databasePath).includes(Buffer.from("persistent-request-1")),
    false,
  );
});

test("changed payloads conflict and interrupted sends remain unknown", async (t) => {
  const store = createIdempotencyStore(":memory:");
  const execute = createIdempotencyExecutor(store);
  t.after(() => store.close());

  await execute({
    key: "request-conflict-1",
    scope: "POST /send",
    payload: { message: "first" },
    operation: async () => ({ statusCode: 200, body: { success: true } }),
  });

  await assert.rejects(
    execute({
      key: "request-conflict-1",
      scope: "POST /send",
      payload: { message: "changed" },
      operation: async () => ({ statusCode: 200, body: {} }),
    }),
    (error) =>
      error.statusCode === 409 && error.idempotencyStatus === "conflict",
  );

  const interruptedKey = "request-unknown-1";
  store.claim({
    keyHash: crypto.createHash("sha256").update(interruptedKey).digest("hex"),
    scope: "POST /send",
    fingerprint: createFingerprint("POST /send", { message: "maybe sent" }),
  });

  await assert.rejects(
    execute({
      key: interruptedKey,
      scope: "POST /send",
      payload: { message: "maybe sent" },
      operation: async () => ({ statusCode: 200, body: {} }),
    }),
    (error) =>
      error.statusCode === 409 && error.idempotencyStatus === "unknown",
  );
});

test("failed outcomes are persisted and replayed without retrying", async (t) => {
  const store = createIdempotencyStore(":memory:");
  const execute = createIdempotencyExecutor(store);
  t.after(() => store.close());
  let executions = 0;

  await assert.rejects(
    execute({
      key: "request-failure-1",
      scope: "POST /send",
      payload: { message: "hello" },
      operation: async () => {
        executions += 1;
        throw new AppError("WhatsApp client is not connected yet.", 503);
      },
    }),
    (error) =>
      error.statusCode === 503 && error.idempotencyStatus === "created",
  );

  await assert.rejects(
    execute({
      key: "request-failure-1",
      scope: "POST /send",
      payload: { message: "hello" },
      operation: async () => {
        executions += 1;
      },
    }),
    (error) =>
      error.statusCode === 503 && error.idempotencyStatus === "replayed",
  );
  assert.equal(executions, 1);
});

test("pre-send transient failures release the key for a safe retry", async (t) => {
  const store = createIdempotencyStore(":memory:");
  const execute = createIdempotencyExecutor(store);
  t.after(() => store.close());
  let executions = 0;

  await assert.rejects(
    execute({
      key: "request-retryable-1",
      scope: "POST /send",
      payload: { message: "hello" },
      operation: async () => {
        executions += 1;
        const error = new AppError("WhatsApp is not connected.", 503);
        error.idempotencySafeToRetry = true;
        throw error;
      },
    }),
    (error) =>
      error.statusCode === 503 && error.idempotencyStatus === "released",
  );

  const retried = await execute({
    key: "request-retryable-1",
    scope: "POST /send",
    payload: { message: "hello" },
    operation: async () => {
      executions += 1;
      return { statusCode: 200, body: { success: true } };
    },
  });

  assert.equal(executions, 2);
  assert.equal(retried.replayed, false);
});

test("idempotency keys have a strict bounded format", () => {
  assert.equal(validateIdempotencyKey("request-1234"), true);
  assert.equal(validateIdempotencyKey("short"), false);
  assert.equal(validateIdempotencyKey("request key with spaces"), false);
  assert.equal(validateIdempotencyKey("x".repeat(129)), false);
});

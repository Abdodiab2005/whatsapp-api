const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const AppError = require("./AppError");

const DEFAULT_DB_PATH = path.join(__dirname, "../../session", "idempotency.db");
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const DEFAULT_TTL_HOURS = 168;

let defaultStore;
let defaultExecutor;

function validateIdempotencyKey(value) {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

function getIdempotencyTtlMs(environment = process.env) {
  const value = environment.IDEMPOTENCY_TTL_HOURS;
  if (value == null || value === "") {
    return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  }

  const hours = Number(value);
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 8760) {
    throw new Error(
      "IDEMPOTENCY_TTL_HOURS must be an integer between 1 and 8760.",
    );
  }
  return hours * 60 * 60 * 1000;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createFingerprint(scope, payload) {
  return sha256(`${scope}\0${stableStringify(payload)}`);
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function describeFile(file) {
  return {
    mimetype: file.mimetype,
    size: file.size,
    sha256: await hashFile(file.path),
  };
}

function prepareDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    const directory = path.dirname(databasePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }

  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  if (databasePath !== ":memory:") fs.chmodSync(databasePath, 0o600);

  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_requests (
      key_hash TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('in_progress', 'succeeded', 'failed')),
      status_code INTEGER,
      response_body TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  database.exec(
    "CREATE INDEX IF NOT EXISTS idempotency_expires_at ON idempotency_requests (expires_at)",
  );
  return database;
}

function createIdempotencyStore(
  databasePath = DEFAULT_DB_PATH,
  { ttlMs = getIdempotencyTtlMs(), clock = Date.now } = {},
) {
  const database = prepareDatabase(databasePath);
  const insertClaim = database.prepare(`
    INSERT OR IGNORE INTO idempotency_requests (
      key_hash, scope, fingerprint, state, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?)
  `);
  const readRequest = database.prepare(
    "SELECT * FROM idempotency_requests WHERE key_hash = ?",
  );
  const deleteExpiredRequest = database.prepare(
    "DELETE FROM idempotency_requests WHERE key_hash = ? AND expires_at <= ?",
  );
  const deleteExpiredRequests = database.prepare(
    "DELETE FROM idempotency_requests WHERE expires_at <= ?",
  );
  const completeRequest = database.prepare(`
    UPDATE idempotency_requests
    SET state = 'succeeded', status_code = ?, response_body = ?,
        error_message = NULL, updated_at = ?, expires_at = ?
    WHERE key_hash = ? AND state = 'in_progress'
  `);
  const failRequest = database.prepare(`
    UPDATE idempotency_requests
    SET state = 'failed', status_code = ?, response_body = NULL,
        error_message = ?, updated_at = ?, expires_at = ?
    WHERE key_hash = ? AND state = 'in_progress'
  `);
  const releaseRequest = database.prepare(
    "DELETE FROM idempotency_requests WHERE key_hash = ? AND state = 'in_progress'",
  );

  deleteExpiredRequests.run(clock());

  let claimCount = 0;
  let closed = false;

  function runTransaction(operation) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }
  }

  function claim({ keyHash, scope, fingerprint }) {
    const now = clock();
    const expiresAt = now + ttlMs;
    claimCount += 1;
    if (claimCount % 128 === 0) deleteExpiredRequests.run(now);

    return runTransaction(() => {
      deleteExpiredRequest.run(keyHash, now);
      const inserted = insertClaim.run(
        keyHash,
        scope,
        fingerprint,
        now,
        now,
        expiresAt,
      );
      const record = readRequest.get(keyHash);
      return { claimed: inserted.changes === 1, record };
    });
  }

  function succeed(keyHash, statusCode, responseBody) {
    const now = clock();
    const result = completeRequest.run(
      statusCode,
      JSON.stringify(responseBody),
      now,
      now + ttlMs,
      keyHash,
    );
    if (result.changes !== 1) {
      throw new Error("Idempotency request could not be completed atomically.");
    }
  }

  function fail(keyHash, statusCode, message) {
    const now = clock();
    const result = failRequest.run(
      statusCode,
      message,
      now,
      now + ttlMs,
      keyHash,
    );
    if (result.changes !== 1) {
      throw new Error("Idempotency request could not be failed atomically.");
    }
  }

  function release(keyHash) {
    const result = releaseRequest.run(keyHash);
    if (result.changes !== 1) {
      throw new Error("Idempotency request could not be released atomically.");
    }
  }

  return {
    claim,
    fail,
    release,
    succeed,
    close: () => {
      if (closed) return;
      database.close();
      closed = true;
    },
  };
}

function serializeError(error) {
  const statusCode =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : 500;
  const message =
    error.isOperational === true ? error.message : "Internal server error";
  return { message, statusCode };
}

function createReplayError(record, idempotencyStatus = "replayed") {
  const error = new AppError(
    record.error_message || record.message || "The original request failed.",
    record.status_code || record.statusCode || 500,
  );
  error.idempotencyStatus = idempotencyStatus;
  return error;
}

function createIdempotencyExecutor(store) {
  const inFlight = new Map();

  async function executeIdempotentOperation({
    key,
    scope,
    payload,
    operation,
  }) {
    if (!validateIdempotencyKey(key)) {
      throw new AppError(
        "Idempotency-Key must be 8-128 letters, numbers, dots, colons, underscores, or hyphens.",
        400,
      );
    }

    const keyHash = sha256(key);
    const fingerprint = createFingerprint(scope, payload);
    const { claimed, record } = store.claim({ keyHash, scope, fingerprint });

    if (!claimed) {
      if (record.scope !== scope || record.fingerprint !== fingerprint) {
        const error = new AppError(
          "This Idempotency-Key was already used for a different request.",
          409,
        );
        error.idempotencyStatus = "conflict";
        throw error;
      }

      if (record.state === "succeeded") {
        return {
          statusCode: record.status_code,
          body: JSON.parse(record.response_body),
          replayed: true,
        };
      }
      if (record.state === "failed") throw createReplayError(record);

      const activeRequest = inFlight.get(keyHash);
      if (activeRequest) {
        try {
          const result = await activeRequest;
          return { ...result, replayed: true };
        } catch (error) {
          const status =
            error.idempotencyStatus === "released" ||
            error.idempotencyStatus === "unknown"
              ? error.idempotencyStatus
              : "replayed";
          throw createReplayError(serializeError(error), status);
        }
      }

      const error = new AppError(
        "The previous request has an unknown outcome. Verify delivery before using a new Idempotency-Key.",
        409,
      );
      error.idempotencyStatus = "unknown";
      throw error;
    }

    const activeRequest = (async () => {
      try {
        const result = await operation();
        store.succeed(keyHash, result.statusCode, result.body);
        return { ...result, replayed: false };
      } catch (error) {
        const serialized = serializeError(error);
        try {
          if (error.idempotencySafeToRetry === true) {
            store.release(keyHash);
          } else {
            store.fail(keyHash, serialized.statusCode, serialized.message);
          }
        } catch (persistenceError) {
          error.idempotencyPersistenceError = persistenceError;
        }
        error.idempotencyStatus = error.idempotencyPersistenceError
          ? "unknown"
          : error.idempotencySafeToRetry === true
            ? "released"
            : "created";
        throw error;
      }
    })();

    inFlight.set(keyHash, activeRequest);
    try {
      return await activeRequest;
    } finally {
      inFlight.delete(keyHash);
    }
  }

  executeIdempotentOperation.drain = async () => {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight.values()]);
    }
  };

  return executeIdempotentOperation;
}

function getDefaultExecutor() {
  if (!defaultStore) defaultStore = createIdempotencyStore();
  if (!defaultExecutor)
    defaultExecutor = createIdempotencyExecutor(defaultStore);
  return defaultExecutor;
}

function executeIdempotentOperation(options) {
  return getDefaultExecutor()(options);
}

async function closeIdempotencyStore() {
  await defaultExecutor?.drain();
  defaultStore?.close();
  defaultStore = undefined;
  defaultExecutor = undefined;
}

module.exports = {
  DEFAULT_DB_PATH,
  closeIdempotencyStore,
  createFingerprint,
  createIdempotencyExecutor,
  createIdempotencyStore,
  describeFile,
  executeIdempotentOperation,
  getIdempotencyTtlMs,
  validateIdempotencyKey,
};

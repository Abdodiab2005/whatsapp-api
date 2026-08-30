const assert = require("node:assert/strict");
const test = require("node:test");
const { readEnum, readInteger } = require("../src/utils/env");

const RANGE = { min: 1, max: 100 };

test("integer configuration falls back only when absent", () => {
  assert.equal(readInteger({}, "SETTING", 25, RANGE), 25);
  assert.equal(readInteger({ SETTING: "" }, "SETTING", 25, RANGE), 25);
  assert.equal(readInteger({ SETTING: "50" }, "SETTING", 25, RANGE), 50);
  assert.equal(readInteger({ SETTING: "1" }, "SETTING", 25, RANGE), 1);
  assert.equal(readInteger({ SETTING: "100" }, "SETTING", 25, RANGE), 100);
});

test("a mistyped integer crashes instead of silently using the default", () => {
  // Falling back here would leave an operator with capacity they never chose
  // and no way to notice.
  for (const value of ["50s", "not-a-number", "5.5", "0", "101", "-1", "1e3"]) {
    assert.throws(
      () => readInteger({ SETTING: value }, "SETTING", 25, RANGE),
      /SETTING must be an integer between 1 and 100\./,
      `expected "${value}" to be rejected`,
    );
  }
});

test("enum configuration is normalized, and rejected when unknown", () => {
  const allowed = new Set(["info", "debug", "silent"]);

  assert.equal(readEnum({}, "LEVEL", "info", allowed), "info");
  assert.equal(readEnum({ LEVEL: "DEBUG" }, "LEVEL", "info", allowed), "debug");
  assert.equal(
    readEnum({ LEVEL: " debug " }, "LEVEL", "info", allowed),
    "debug",
  );

  assert.throws(
    () => readEnum({ LEVEL: "verbose" }, "LEVEL", "info", allowed),
    /LEVEL must be one of: debug, info, silent\./,
  );
});

test("every configured limit is validated at require time", async () => {
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  const path = require("node:path");
  const execFileAsync = promisify(execFile);
  const root = path.join(__dirname, "..");

  const variables = [
    "RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_IP_MAX",
    "RATE_LIMIT_API_MAX",
    "RATE_LIMIT_MEDIA_MAX",
    "RATE_LIMIT_MAX_KEYS",
    "IDEMPOTENCY_TTL_HOURS",
    "SEND_INTERVAL_MS",
    "MAX_PENDING_SENDS",
    "LOG_LEVEL",
  ];

  for (const variable of variables) {
    await assert.rejects(
      execFileAsync(process.execPath, ["-e", "require('./index')"], {
        cwd: root,
        env: {
          ...process.env,
          API_KEY: "env-validation-test-key",
          [variable]: "definitely-not-valid",
        },
        timeout: 30_000,
      }),
      `${variable} must be rejected at boot`,
    );
  }
});

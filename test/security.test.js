const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { authenticateApiKey } = require("../src/middleware/auth.middleware");
const { ensureApiKey } = require("../scripts/seedApiKey");

test("API key authentication handles unequal lengths without leaking secrets", () => {
  const previous = process.env.API_KEY;
  process.env.API_KEY = "expected-secret";

  let error;
  authenticateApiKey({ header: () => "short" }, {}, (value) => {
    error = value;
  });
  assert.equal(error.statusCode, 401);
  assert.equal(error.message.includes("expected-secret"), false);

  let accepted = false;
  authenticateApiKey({ header: () => "expected-secret" }, {}, (value) => {
    assert.equal(value, undefined);
    accepted = true;
  });
  assert.equal(accepted, true);

  if (previous === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = previous;
});

test("generated API keys are persistent and stored with private permissions", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wa-api-env-"));
  const envPath = path.join(directory, ".env");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = ensureApiKey(envPath);
  const second = ensureApiKey(envPath);

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(second, first);
  assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  assert.equal(
    (fs.readFileSync(envPath, "utf8").match(/^API_KEY=/gm) || []).length,
    1,
  );
});

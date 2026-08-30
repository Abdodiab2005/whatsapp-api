const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

test("documentation covers every route and configuration variable", () => {
  let output;
  try {
    output = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "checkDocs.js")],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
    );
  } catch (error) {
    assert.fail(
      `scripts/checkDocs.js reported drift:\n${error.stderr || error.message}`,
    );
  }

  assert.match(output, /Docs are in sync/);
});

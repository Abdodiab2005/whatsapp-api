const assert = require("node:assert/strict");
const test = require("node:test");

process.env.API_KEY = "rate-limit-test-key";
process.env.RATE_LIMIT_IP_MAX = "2";
process.env.RATE_LIMIT_API_MAX = "100";
const { app } = require("../index");

test("HTTP client rate limit returns 429 and Retry-After", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 200);

  const blocked = await fetch(url);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
});

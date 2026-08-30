const assert = require("node:assert/strict");
const test = require("node:test");

process.env.API_KEY = "test-api-key";
process.env.TRUST_PROXY = "1";
const { app } = require("../index");

test("HTTP boundaries enforce auth, safe errors, and security headers", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await fetch(`${baseUrl}/`, {
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-powered-by"), null);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("ratelimit-limit"), "120");
  assert.equal(
    health.headers.get("strict-transport-security"),
    "max-age=31536000",
  );

  const unauthorized = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ number: "+201001234567", message: "hello" }),
  });
  assert.equal(unauthorized.status, 401);

  const missingIdempotencyKey = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "test-api-key",
    },
    body: JSON.stringify({ number: "+201001234567", message: "hello" }),
  });
  assert.equal(missingIdempotencyKey.status, 400);
  assert.match((await missingIdempotencyKey.json()).message, /Idempotency-Key/);

  const invalidBody = await fetch(`${baseUrl}/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "test-api-key",
    },
    body: "{",
  });
  assert.equal(invalidBody.status, 400);
  assert.equal((await invalidBody.json()).message, "Invalid JSON body.");

  const unavailable = await fetch(`${baseUrl}/isOnWhatsApp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "test-api-key",
    },
    body: JSON.stringify({ number: "+201001234567" }),
  });
  assert.equal(unavailable.status, 503);
  assert.equal(
    (await unavailable.json()).message,
    "WhatsApp client is not connected yet.",
  );

  const missing = await fetch(`${baseUrl}/does-not-exist`, {
    headers: { "x-api-key": "test-api-key" },
  });
  assert.equal(missing.status, 404);
});

test("health routes are unauthenticated and report WhatsApp link state", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const banner = await fetch(`${baseUrl}/`);
  assert.equal(banner.status, 200);
  assert.match(await banner.text(), /WhatsApp API Server is running/);

  // No API key: a probe must never need the shared secret.
  const health = await fetch(`${baseUrl}/healthz`);
  const body = await health.json();

  // WhatsApp is not linked in tests, so the probe must fail closed.
  assert.equal(health.status, 503);
  assert.equal(body.data.whatsapp, "disconnected");
  assert.equal(body.data.status, "degraded");
  assert.equal(typeof body.data.uptimeSeconds, "number");

  // The probe is public, so it must not leak session or credential detail.
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /test-api-key|creds|session|auth/i);
});

test("uploaded SVG content is rejected even when declared as an image", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const form = new FormData();
  form.append(
    "file",
    new Blob(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], {
      type: "image/png",
    }),
    "image.png",
  );
  form.append("number", "+201001234567");

  const response = await fetch(`http://127.0.0.1:${port}/send-media`, {
    method: "POST",
    headers: {
      "idempotency-key": "svg-upload-test-1",
      "x-api-key": "test-api-key",
    },
    body: form,
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.message, /Unsupported file content/);
});

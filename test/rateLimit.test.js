const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildRateLimiters,
  createRateLimiter,
} = require("../src/middleware/rateLimit.middleware");

function invoke(middleware, key) {
  const headers = new Map();
  let nextValue;
  middleware(
    { ip: key, key },
    { setHeader: (name, value) => headers.set(name, value) },
    (value) => {
      nextValue = value;
    },
  );
  return { error: nextValue, headers };
}

test("rate limiter returns headers, blocks excess requests, and resets", () => {
  let now = 1000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    max: 2,
    keyGenerator: (req) => req.key,
    clock: () => now,
  });

  const first = invoke(limiter, "client-a");
  const second = invoke(limiter, "client-a");
  const blocked = invoke(limiter, "client-a");

  assert.equal(first.error, undefined);
  assert.equal(first.headers.get("RateLimit-Remaining"), 1);
  assert.equal(second.headers.get("RateLimit-Remaining"), 0);
  assert.equal(blocked.error.statusCode, 429);
  assert.equal(blocked.headers.get("Retry-After"), 10);

  now += 10_001;
  assert.equal(invoke(limiter, "client-a").error, undefined);
});

test("rate limiter bounds the number of tracked client keys", () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    maxKeys: 1,
    keyGenerator: (req) => req.key,
  });

  assert.equal(invoke(limiter, "client-a").error, undefined);
  assert.equal(invoke(limiter, "client-b").error.statusCode, 429);
});

test("media uploads receive a stricter per-IP limit", () => {
  const { mediaRateLimiter } = buildRateLimiters({
    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_IP_MAX: "100",
    RATE_LIMIT_API_MAX: "100",
    RATE_LIMIT_MEDIA_MAX: "1",
    RATE_LIMIT_MAX_KEYS: "100",
  });

  assert.equal(invoke(mediaRateLimiter, "client-a").error, undefined);
  assert.equal(invoke(mediaRateLimiter, "client-a").error.statusCode, 429);
});

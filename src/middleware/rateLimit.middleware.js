const AppError = require("../utils/AppError");
const { readInteger } = require("../utils/env");

function createRateLimiter({
  windowMs,
  max,
  keyGenerator,
  maxKeys = 10_000,
  clock = Date.now,
}) {
  const clients = new Map();
  let requestCount = 0;

  function pruneExpired(now) {
    for (const [key, entry] of clients) {
      if (entry.resetAt <= now) clients.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = clock();
    requestCount += 1;
    if (requestCount % 256 === 0 || clients.size >= maxKeys) {
      pruneExpired(now);
    }

    const key = String(keyGenerator(req));
    let entry = clients.get(key);

    if (!entry || entry.resetAt <= now) {
      if (!entry && clients.size >= maxKeys) {
        const resetSeconds = Math.ceil(windowMs / 1000);
        res.setHeader("RateLimit-Limit", max);
        res.setHeader("RateLimit-Remaining", 0);
        res.setHeader("RateLimit-Reset", resetSeconds);
        res.setHeader("Retry-After", resetSeconds);
        return next(new AppError("Too many requests. Try again later.", 429));
      }
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetSeconds);

    if (entry.count > max) {
      res.setHeader("Retry-After", resetSeconds);
      return next(new AppError("Too many requests. Try again later.", 429));
    }

    return next();
  };
}

function buildRateLimiters(environment = process.env) {
  const windowMs = readInteger(environment, "RATE_LIMIT_WINDOW_MS", 60_000, {
    min: 1000,
    max: 3_600_000,
  });
  const ipMax = readInteger(environment, "RATE_LIMIT_IP_MAX", 120, {
    min: 1,
    max: 100_000,
  });
  const apiMax = readInteger(environment, "RATE_LIMIT_API_MAX", 60, {
    min: 1,
    max: 100_000,
  });
  const mediaMax = readInteger(environment, "RATE_LIMIT_MEDIA_MAX", 10, {
    min: 1,
    max: 100_000,
  });
  const maxKeys = readInteger(environment, "RATE_LIMIT_MAX_KEYS", 10_000, {
    min: 100,
    max: 100_000,
  });

  return {
    ipRateLimiter: createRateLimiter({
      windowMs,
      max: ipMax,
      maxKeys,
      keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
    }),
    apiRateLimiter: createRateLimiter({
      windowMs,
      max: apiMax,
      maxKeys: 1,
      keyGenerator: () => "authenticated-api",
    }),
    mediaRateLimiter: createRateLimiter({
      windowMs,
      max: mediaMax,
      maxKeys,
      keyGenerator: (req) => req.ip || req.socket?.remoteAddress || "unknown",
    }),
  };
}

module.exports = { buildRateLimiters, createRateLimiter, readInteger };

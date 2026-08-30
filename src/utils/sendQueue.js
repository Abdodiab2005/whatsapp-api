const { setTimeout: delay } = require("node:timers/promises");
const AppError = require("./AppError");

function readInteger(value, fallback, { min, max }) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function createSendQueue({ sendIntervalMs, maxPendingSends }) {
  let tail = Promise.resolve();
  let nextStartAt = 0;
  let pendingSends = 0;

  function enqueueSend(operation) {
    if (pendingSends >= maxPendingSends) {
      const error = new AppError(
        "The send queue is full. Try again later.",
        429,
      );
      error.idempotencySafeToRetry = true;
      throw error;
    }

    pendingSends += 1;
    const scheduled = tail.then(async () => {
      const waitMs = Math.max(0, nextStartAt - Date.now());
      if (waitMs > 0) await delay(waitMs);

      nextStartAt = Date.now() + sendIntervalMs;
      return operation();
    });

    tail = scheduled.catch(() => undefined);
    return scheduled.finally(() => {
      pendingSends -= 1;
    });
  }

  function getSendQueueStats() {
    return { maxPendingSends, pendingSends, sendIntervalMs };
  }

  return { enqueueSend, getSendQueueStats };
}

const defaultQueue = createSendQueue({
  sendIntervalMs: readInteger(process.env.SEND_INTERVAL_MS, 1000, {
    min: 0,
    max: 60_000,
  }),
  maxPendingSends: readInteger(process.env.MAX_PENDING_SENDS, 25, {
    min: 1,
    max: 1000,
  }),
});

module.exports = { createSendQueue, ...defaultQueue };

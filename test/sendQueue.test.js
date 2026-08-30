const assert = require("node:assert/strict");
const test = require("node:test");
const { createSendQueue } = require("../src/utils/sendQueue");

test("send queue serializes operations and rejects excess work", async () => {
  const queue = createSendQueue({ sendIntervalMs: 0, maxPendingSends: 2 });
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const order = [];

  const first = queue.enqueueSend(async () => {
    order.push("first-start");
    await firstGate;
    order.push("first-end");
  });
  const second = queue.enqueueSend(async () => {
    order.push("second");
  });

  assert.throws(
    () => queue.enqueueSend(async () => undefined),
    (error) => error.statusCode === 429,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["first-start"]);

  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
  assert.equal(queue.getSendQueueStats().pendingSends, 0);
});

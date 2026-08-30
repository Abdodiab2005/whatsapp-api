const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { generateWAMessage } = require("@whiskeysockets/baileys");
const {
  attachMediaMetadata,
  describeMediaMetadata,
  toZeroOffsetBuffer,
} = require("../src/utils/mediaMetadata");
const { buildMediaMessage, getMediaType } = require("../src/utils/media");
const {
  newsletterMediaTypeAttribute,
  performAuthorizedNewsletterMediaSend,
} = require("../src/services/whatsapp.service");

const NEWSLETTER_JID = "120363123456789012@newsletter";

const fixtureDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "wa-api-media-"),
);
test.after(() => fs.rmSync(fixtureDirectory, { recursive: true, force: true }));

const fixture = (name) => path.join(fixtureDirectory, name);

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args], {
    stdio: "pipe",
  });
}

let toolingAvailable = true;
try {
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=15:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    fixture("clip.mp4"),
  ]);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:a",
    "libopus",
    fixture("voice.ogg"),
  ]);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=red:size=640x480:duration=1",
    "-frames:v",
    "1",
    fixture("photo.jpg"),
  ]);
} catch {
  toolingAvailable = false;
}

const withTooling = {
  skip: toolingAvailable ? false : "ffmpeg is unavailable",
};

/** Builds the message Baileys would put on the wire, with a stubbed upload. */
async function generate(jid, file, options) {
  const content = buildMediaMessage(file, options);
  await attachMediaMetadata(content, file, getMediaType(file.mimetype));
  const message = await generateWAMessage(jid, content, {
    userJid: "201001234567@s.whatsapp.net",
    upload: async () => ({ mediaUrl: "https://x/y", directPath: "/v/y" }),
  });
  return Object.values(message.message)[0];
}

test("pooled buffers are re-anchored so audio sniffing stays reliable", () => {
  const pool = Buffer.alloc(64);
  const view = pool.subarray(16, 32);
  const anchored = toZeroOffsetBuffer(view);

  assert.equal(anchored.byteOffset, 0);
  assert.equal(anchored.byteLength, anchored.buffer.byteLength);
  assert.deepEqual(Buffer.from(anchored), Buffer.from(view));

  const clean = Buffer.alloc(8);
  assert.equal(toZeroOffsetBuffer(clean), clean);
});

test(
  "channel images carry a thumbnail and dimensions",
  withTooling,
  async () => {
    const file = { path: fixture("photo.jpg"), mimetype: "image/jpeg" };
    const message = await generate(NEWSLETTER_JID, file, { caption: "hello" });

    assert.ok(message.jpegThumbnail?.length > 0, "expected a jpeg thumbnail");
    assert.equal(message.width, 640);
    assert.equal(message.height, 480);
    assert.equal(message.caption, "hello");
  },
);

test(
  "channel and private images receive identical preview metadata",
  withTooling,
  async () => {
    const file = { path: fixture("photo.jpg"), mimetype: "image/jpeg" };
    const channel = await generate(NEWSLETTER_JID, file, {});
    const chat = await generate("201001234567@s.whatsapp.net", file, {});

    assert.deepEqual(
      { width: channel.width, height: channel.height },
      { width: chat.width, height: chat.height },
    );
    assert.deepEqual(channel.jpegThumbnail, chat.jpegThumbnail);
  },
);

test(
  "videos carry dimensions and duration in channels and chats",
  withTooling,
  async () => {
    const file = { path: fixture("clip.mp4"), mimetype: "video/mp4" };

    for (const jid of [NEWSLETTER_JID, "201001234567@s.whatsapp.net"]) {
      const message = await generate(jid, file, {});
      assert.ok(message.jpegThumbnail?.length > 0, `thumbnail for ${jid}`);
      assert.equal(message.width, 320, `width for ${jid}`);
      assert.equal(message.height, 240, `height for ${jid}`);
      assert.equal(Number(message.seconds), 3, `duration for ${jid}`);
    }
  },
);

test("voice notes carry a duration and a waveform", withTooling, async () => {
  const file = { path: fixture("voice.ogg"), mimetype: "audio/ogg" };

  for (const jid of [NEWSLETTER_JID, "201001234567@s.whatsapp.net"]) {
    const message = await generate(jid, file, { ptt: true });
    assert.equal(message.ptt, true, `ptt for ${jid}`);
    assert.equal(Number(message.seconds), 2, `duration for ${jid}`);
    assert.equal(message.waveform?.length, 64, `waveform for ${jid}`);
  }
});

test("missing or unreadable media degrades instead of throwing", async () => {
  assert.deepEqual(
    await describeMediaMetadata("/nonexistent/file.jpg", "image"),
    {},
  );
  assert.deepEqual(
    await describeMediaMetadata("/nonexistent/file.mp4", "video"),
    {},
  );
  assert.deepEqual(
    await describeMediaMetadata("/nonexistent/file.ogg", "audio", {
      ptt: true,
    }),
    {},
  );

  const content = { image: { url: "/nonexistent/file.jpg" } };
  assert.equal(await attachMediaMetadata(content, undefined, "image"), content);
  assert.deepEqual(content, { image: { url: "/nonexistent/file.jpg" } });
});

test(
  "caller-supplied preview values are never overwritten",
  withTooling,
  async () => {
    const content = {
      image: { url: fixture("photo.jpg") },
      mimetype: "image/jpeg",
      width: 1,
      height: 2,
    };
    await attachMediaMetadata(content, { path: fixture("photo.jpg") }, "image");

    assert.equal(content.width, 1);
    assert.equal(content.height, 2);
    assert.ok(content.jpegThumbnail?.length > 0);
  },
);

test("newsletter media relays the mediatype stanza attribute", async () => {
  assert.equal(newsletterMediaTypeAttribute({ imageMessage: {} }), "image");
  assert.equal(
    newsletterMediaTypeAttribute({ videoMessage: { gifPlayback: true } }),
    "gif",
  );
  assert.equal(
    newsletterMediaTypeAttribute({ audioMessage: { ptt: true } }),
    "ptt",
  );
  assert.equal(newsletterMediaTypeAttribute({ audioMessage: {} }), "audio");
  assert.equal(newsletterMediaTypeAttribute({ conversation: "hi" }), null);

  const relayed = [];
  const socket = {
    user: { id: "201001234567@s.whatsapp.net" },
    newsletterMetadata: async () => ({
      id: NEWSLETTER_JID,
      viewer_metadata: { role: "ADMIN" },
    }),
    relayMessage: async (jid, message, options) => {
      relayed.push({ jid, options, message });
    },
  };

  const result = await performAuthorizedNewsletterMediaSend(
    socket,
    NEWSLETTER_JID,
    { image: Buffer.from("not-a-real-image"), mimetype: "image/jpeg" },
    undefined,
    async () => ({ mediaUrl: "https://cdn/x", directPath: "/v/x" }),
  );

  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].jid, NEWSLETTER_JID);
  assert.deepEqual(relayed[0].options.additionalAttributes, {
    mediatype: "image",
  });
  assert.equal(relayed[0].options.messageId, result.key.id);
  assert.ok(relayed[0].message.imageMessage);
});

test("a non-publisher role blocks the newsletter media send before upload", async () => {
  let uploaded = false;
  const socket = {
    user: { id: "201001234567@s.whatsapp.net" },
    newsletterMetadata: async () => ({
      id: NEWSLETTER_JID,
      viewer_metadata: { role: "SUBSCRIBER" },
    }),
    relayMessage: async () => {
      throw new Error("must not relay");
    },
  };

  await assert.rejects(
    performAuthorizedNewsletterMediaSend(
      socket,
      NEWSLETTER_JID,
      { image: Buffer.from("x"), mimetype: "image/jpeg" },
      undefined,
      async () => {
        uploaded = true;
        return { mediaUrl: "u", directPath: "d" };
      },
    ),
    (error) => error.statusCode === 403,
  );
  assert.equal(uploaded, false);
});

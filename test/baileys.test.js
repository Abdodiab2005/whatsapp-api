const assert = require("node:assert/strict");
const test = require("node:test");
const packageJson = require("../package.json");
const baileysPackage = require("@whiskeysockets/baileys/package.json");
const {
  createNewsletterUpload,
  performAuthorizedNewsletterSend,
  resolveUserIdentifier,
} = require("../src/services/whatsapp.service");
const {
  buildSocketOptions,
  getDisconnectStatusCode,
} = require("../src/whatsappClient");

test("runtime and Baileys versions are pinned", () => {
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal(
    packageJson.dependencies["@whiskeysockets/baileys"],
    "7.0.0-rc14",
  );
  assert.equal(packageJson.dependencies["audio-decode"], "2.2.3");
  assert.equal(baileysPackage.version, "7.0.0-rc14");
  assert.equal(packageJson.dependencies.sqlite3, undefined);
});

test("Baileys' optional voice-note waveform decoder works on Node 24", async () => {
  const { default: decode } = await import("audio-decode");
  const sampleCount = 64;
  const wav = Buffer.alloc(44 + sampleCount * 2);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24);
  wav.writeUInt32LE(16_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount * 2, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    wav.writeInt16LE(index % 2 === 0 ? 1_000 : -1_000, 44 + index * 2);
  }

  const audioBuffer = await decode(wav);
  assert.equal(audioBuffer.sampleRate, 8_000);
  assert.equal(audioBuffer.length, sampleCount);
});

test("disconnect status works across Boom package versions", () => {
  assert.equal(getDisconnectStatusCode({ output: { statusCode: 401 } }), 401);
});

test("newsletter uploader uses the rc14 streaming upload hook", async () => {
  const refreshCalls = [];
  const sock = {
    refreshMediaConn: async (force) => {
      refreshCalls.push(force);
      return {
        auth: "auth-token",
        hosts: [{ hostname: "upload.example.com" }],
      };
    },
  };
  let uploadOptions;
  const upload = createNewsletterUpload(sock, async (options) => {
    uploadOptions = options;
    return { url: "https://cdn.example/media", direct_path: "/m1/media" };
  });

  const result = await upload("/tmp/encrypted-media", {
    mediaType: "image",
    fileEncSha256B64: "ab+c/==",
    timeoutMs: 1234,
  });

  assert.deepEqual(refreshCalls, [false]);
  assert.match(uploadOptions.url, /\/newsletter\/newsletter-image\//);
  assert.equal(uploadOptions.filePath, "/tmp/encrypted-media");
  assert.equal(uploadOptions.timeoutMs, 1234);
  assert.equal(result.directPath, "/m1/media");
});

test("rc14 initial history sync remains enabled for LID mappings", () => {
  const options = buildSocketOptions({
    creds: {},
    keys: {
      get: async () => ({}),
      set: async () => undefined,
    },
  });

  assert.equal(options.syncFullHistory, false);
  assert.equal(Object.hasOwn(options, "shouldSyncHistoryMessage"), false);
});

test("username and phone recipients resolve to LIDs with rc14 USync", async () => {
  let usernameQuery;
  const usernameSocket = {
    executeUSyncQuery: async (query) => {
      usernameQuery = query;
      return {
        list: [
          {
            id: "123456789012345@lid",
            contact: true,
            username: "alice",
          },
        ],
      };
    },
    signalRepository: {
      lidMapping: {
        getPNForLID: async () => "201001234567:0@s.whatsapp.net",
      },
    },
  };

  const username = await resolveUserIdentifier(
    { type: "username", username: "alice" },
    usernameSocket,
  );
  assert.deepEqual(
    usernameQuery.protocols.map((protocol) => protocol.name),
    ["contact", "username"],
  );
  assert.equal(usernameQuery.users[0].username, "alice");
  assert.deepEqual(username, {
    jid: "123456789012345@lid",
    lid: "123456789012345@lid",
    phoneNumber: "201001234567@s.whatsapp.net",
    username: "alice",
  });

  const phoneSocket = {
    onWhatsApp: async () => [
      { exists: true, jid: "201001234567@s.whatsapp.net" },
    ],
    signalRepository: {
      lidMapping: {
        getLIDForPN: async () => "123456789012345@lid",
      },
    },
  };
  const phone = await resolveUserIdentifier(
    { type: "number", jid: "201001234567@s.whatsapp.net" },
    phoneSocket,
  );
  assert.equal(phone.jid, "123456789012345@lid");
});

test("channel role is fetched immediately before every send", async () => {
  const events = [];
  const socket = {
    newsletterMetadata: async () => {
      events.push("role");
      return {
        id: "120363123456789012@newsletter",
        viewer_metadata: { role: "ADMIN" },
      };
    },
    sendMessage: async () => {
      events.push("send");
      return { key: { id: "message-1" } };
    },
  };

  await performAuthorizedNewsletterSend(
    socket,
    "120363123456789012@newsletter",
    { text: "hello" },
  );
  assert.deepEqual(events, ["role", "send"]);

  socket.newsletterMetadata = async () => ({
    id: "120363123456789012@newsletter",
    viewer_metadata: { role: "SUBSCRIBER" },
  });
  await assert.rejects(
    performAuthorizedNewsletterSend(socket, "120363123456789012@newsletter", {
      text: "blocked",
    }),
    (error) => error.statusCode === 403,
  );
  assert.deepEqual(events, ["role", "send"]);
});

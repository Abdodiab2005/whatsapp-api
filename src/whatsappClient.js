// whatsappClient.js
const {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const { useSQLiteAuthState } = require("./utils/store"); // We will create this file for SQLite

let sock = null;

// Function to handle connection logic
const connectToWhatsApp = async () => {
  // Fetches credentials from the store
  const { state, saveCreds } = await useSQLiteAuthState();

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      // Using a cacheable signal key store with the store's key-value functions
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    browser: Browsers.windows("Chrome"),
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("📱 Scan the QR code below:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error instanceof Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log("❌ Connection closed. Reconnecting:", shouldReconnect);
      setTimeout(() => {
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      }, 3000);
    } else if (connection === "open") {
      console.log("✅ WhatsApp client connected successfully!");
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

const getClient = () => {
  if (!sock) {
    throw new Error("WhatsApp client is not initialized!");
  }
  return sock;
};

module.exports = { connectToWhatsApp, getClient };

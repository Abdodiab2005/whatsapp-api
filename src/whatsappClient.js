const {
  makeWASocket,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const AppError = require("./utils/AppError");
const logger = require("./utils/logger");
const { useSQLiteAuthState, closeSQLiteAuthState } = require("./utils/store");

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

let sock = null;
let connected = false;
let connectPromise = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let stopping = false;

function getDisconnectStatusCode(error) {
  return error?.output?.statusCode ?? error?.statusCode;
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;

  const exponentialDelay = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempt,
  );
  const jitter = Math.floor(Math.random() * Math.min(1000, exponentialDelay));
  const delay = exponentialDelay + jitter;
  reconnectAttempt += 1;

  logger.warn({ delay, reconnectAttempt }, "Scheduling WhatsApp reconnect");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp().catch((error) => {
      logger.error({ err: error }, "WhatsApp reconnect failed");
      scheduleReconnect();
    });
  }, delay);
  reconnectTimer.unref?.();
}

function buildSocketOptions(state) {
  return {
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    browser: Browsers.windows("Chrome"),
  };
}

async function createSocket() {
  const { state, saveCreds } = await useSQLiteAuthState();
  const currentSocket = makeWASocket(buildSocketOptions(state));

  sock = currentSocket;
  connected = false;

  currentSocket.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Scan the WhatsApp QR code shown in the terminal");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      if (sock !== currentSocket) return;
      connected = true;
      reconnectAttempt = 0;
      logger.info("WhatsApp client connected");
      return;
    }

    if (connection !== "close") return;

    if (sock !== currentSocket) return;
    sock = null;
    connected = false;

    const error = lastDisconnect?.error;
    const statusCode = getDisconnectStatusCode(error);
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    logger.warn(
      { statusCode, loggedOut, reason: error?.message },
      "WhatsApp connection closed",
    );

    if (loggedOut) {
      logger.error(
        "WhatsApp session was logged out; reset the saved session and restart to pair again",
      );
      return;
    }

    scheduleReconnect();
  });

  currentSocket.ev.on("creds.update", () => {
    saveCreds().catch((error) => {
      logger.error({ err: error }, "Failed to persist WhatsApp credentials");
    });
  });

  return currentSocket;
}

async function connectToWhatsApp() {
  if (connectPromise) return connectPromise;
  if (sock) return sock;

  stopping = false;
  connectPromise = createSocket();

  try {
    return await connectPromise;
  } catch (error) {
    scheduleReconnect();
    throw error;
  } finally {
    connectPromise = null;
  }
}

/**
 * Connection snapshot for health probes. Deliberately free of any credential,
 * session, or account detail so it is safe to expose unauthenticated.
 */
function getConnectionState() {
  return {
    connected,
    reconnectScheduled: reconnectTimer !== null,
    reconnectAttempt,
  };
}

function getClient() {
  if (!sock || !connected) {
    const error = new AppError("WhatsApp client is not connected yet.", 503);
    error.idempotencySafeToRetry = true;
    throw error;
  }
  return sock;
}

function disconnectFromWhatsApp() {
  stopping = true;
  connected = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const currentSocket = sock;
  sock = null;
  try {
    currentSocket?.end?.(undefined);
  } finally {
    closeSQLiteAuthState();
  }
}

module.exports = {
  buildSocketOptions,
  connectToWhatsApp,
  disconnectFromWhatsApp,
  getClient,
  getConnectionState,
  getDisconnectStatusCode,
};

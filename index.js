const fs = require("node:fs");
const path = require("node:path");
const dotenvResult = require("dotenv").config({ quiet: true });

if (dotenvResult.parsed?.API_KEY) {
  fs.chmodSync(path.join(__dirname, ".env"), 0o600);
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor !== 24) {
  throw new Error(`Node.js 24.x is required; found ${process.versions.node}.`);
}

const {
  configureOutboundProxy,
  parseTrustProxy,
} = require("./src/utils/proxy");
const outboundProxy = configureOutboundProxy();
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
const express = require("express");
const morgan = require("morgan");
const chalk = require("chalk");
const {
  connectToWhatsApp,
  disconnectFromWhatsApp,
  getConnectionState,
} = require("./src/whatsappClient");
const channelRoutes = require("./src/routes/channel.routes");
const chatRoutes = require("./src/routes/chat.routes");
const { authenticateApiKey } = require("./src/middleware/auth.middleware");
const { handleUploadError } = require("./src/middleware/upload.middleware");
const { buildRateLimiters } = require("./src/middleware/rateLimit.middleware");
const globalErrorHandler = require("./src/middleware/error.middleware");
const AppError = require("./src/utils/AppError");
const {
  closeIdempotencyStore,
  getIdempotencyTtlMs,
} = require("./src/utils/idempotency");
const logger = require("./src/utils/logger");

getIdempotencyTtlMs();

if (!process.env.API_KEY) {
  try {
    const { ensureApiKey } = require("./scripts/seedApiKey");
    process.env.API_KEY = ensureApiKey();
    console.warn(
      chalk.yellow(
        "API_KEY generated successfully. Read it from .env and send it in the x-api-key header.",
      ),
    );
  } catch (error) {
    logger.fatal({ err: error }, "Unable to configure API_KEY");
    throw error;
  }
}

const app = express();
app.disable("x-powered-by");
if (trustProxy !== false) app.set("trust proxy", trustProxy);

const { ipRateLimiter, apiRateLimiter, mediaRateLimiter } = buildRateLimiters();

app.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  if (req.secure) {
    res.set("Strict-Transport-Security", "max-age=31536000");
  }
  next();
});

app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
);
app.use(ipRateLimiter);

app.get("/", (_req, res) => {
  res.type("text/plain").send("WhatsApp API Server is running!");
});

// Unauthenticated so a container runtime, load balancer, or uptime probe can
// poll it. It reports liveness plus WhatsApp link state and nothing else.
app.get("/healthz", (_req, res) => {
  const whatsapp = getConnectionState();
  return res.status(whatsapp.connected ? 200 : 503).json({
    success: whatsapp.connected,
    data: {
      status: whatsapp.connected ? "ok" : "degraded",
      whatsapp: whatsapp.connected ? "connected" : "disconnected",
      reconnectScheduled: whatsapp.reconnectScheduled,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    statusCode: whatsapp.connected ? 200 : 503,
    message: whatsapp.connected
      ? "WhatsApp client is connected."
      : "WhatsApp client is not connected yet.",
  });
});

app.use(authenticateApiKey);
app.use(apiRateLimiter);
app.use((req, res, next) => {
  const mediaRoute =
    req.method === "POST" &&
    (req.path === "/send-media" || req.path === "/channel/send-media");
  return mediaRoute ? mediaRateLimiter(req, res, next) : next();
});
app.use(express.json({ limit: "100kb", strict: true }));
app.use(
  express.urlencoded({
    extended: false,
    limit: "100kb",
    parameterLimit: 100,
  }),
);
app.use("/channel", channelRoutes);
app.use("/", chatRoutes);

app.use((req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.path}`, 404));
});
app.use(handleUploadError);
app.use(globalErrorHandler);

function getPort(value = process.env.PORT) {
  if (value == null || value === "") return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function startServer() {
  const port = getPort();
  const server = app.listen(port, () => {
    logger.info(
      {
        port,
        outboundProxy: outboundProxy.enabled,
        trustProxy: trustProxy !== false,
      },
      "HTTP server listening",
    );
  });

  connectToWhatsApp().catch((error) => {
    logger.error({ err: error }, "Initial WhatsApp connection failed");
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");

    const forceExitTimer = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    server.close(async (error) => {
      try {
        await closeIdempotencyStore();
      } catch (closeError) {
        logger.error({ err: closeError }, "Idempotency store shutdown failed");
        process.exitCode = 1;
      } finally {
        disconnectFromWhatsApp();
        clearTimeout(forceExitTimer);
      }
      if (error) {
        logger.error({ err: error }, "HTTP server shutdown failed");
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, getPort, startServer };

const path = require("node:path");
const pino = require("pino");

const LOG_LEVELS = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);
const requestedLevel = process.env.LOG_LEVEL?.toLowerCase();
const level = LOG_LEVELS.has(requestedLevel) ? requestedLevel : "info";

let consoleStream = process.stdout;
if (process.stdout.isTTY && process.env.NODE_ENV !== "production") {
  consoleStream = require("pino-pretty")({
    colorize: true,
    translateTime: "SYS:standard",
  });
}

const streams = [{ level, stream: consoleStream }];
if (process.env.LOG_FILE) {
  streams.push({
    level,
    stream: pino.destination({
      dest: path.resolve(process.env.LOG_FILE),
      mkdir: true,
      sync: false,
    }),
  });
}

const destination =
  streams.length === 1 ? streams[0].stream : pino.multistream(streams);
const logger = pino(
  {
    level,
    redact: {
      paths: [
        "apiKey",
        "*.apiKey",
        "token",
        "*.token",
        "auth",
        "*.auth",
        "jid",
        "*.jid",
        "number",
        "*.number",
        "qr",
        "*.qr",
        "req.headers.x-api-key",
        "headers.x-api-key",
        "req.headers.authorization",
        "headers.authorization",
        "req.headers.cookie",
        "headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  },
  destination,
);

module.exports = logger;

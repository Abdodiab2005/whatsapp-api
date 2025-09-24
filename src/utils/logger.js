// utils/logger.js
const pino = require("pino");
const path = require("path");

// Define the transport with multiple targets: one for the console, one for the file.
const transport = pino.transport({
  targets: [
    // Target 1: Log everything to a file
    {
      level: "trace", // 'trace' is the most verbose level, logs everything.
      target: "pino/file",
      options: {
        // Correct path: two levels up from /utils, then into /logs
        destination: path.join(__dirname, "..", "..", "logs", "app.log"),
        mkdir: true, // Create the directory if it doesn't exist
      },
    },
    // Target 2: Log everything to the console in a pretty, colorful format
    {
      level: "trace", // Also log everything to the console during development
      target: "pino-pretty",
      options: {
        colorize: true, // Enable colors
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss", // Prettier timestamp
        ignore: "pid,hostname", // Don't show process ID and hostname
      },
    },
  ],
});

const logger = pino(transport);

module.exports = logger;

// index.js
require("dotenv").config();
const express = require("express");
const { connectToWhatsApp } = require("./src/whatsappClient");
const channelRoutes = require("./src/routes/channel.routes");
const chatRoutes = require("./src/routes/chat.routes");
const { authenticateApiKey } = require("./src/middleware/auth.middleware");
const { handleUploadError } = require("./src/middleware/upload.middleware");
const globalErrorHandler = require("./src/middleware/error.middleware");
const morgan = require("morgan");
const chalk = require("chalk");

// Don't read from process.env yet
let API_KEY = process.env.API_KEY;

if (!API_KEY) {
  try {
    // Capture the newly generated key from the script
    const newApiKey = require("./scripts/seedApiKey");

    // Assign it to the variable AND to process.env for the current process
    API_KEY = newApiKey;
    process.env.API_KEY = newApiKey; // This is the magic line ✨

    console.warn(
      chalk.yellow(
        "API_KEY generated successfully\n⚠️ Please check the .env file and copy the API_KEY value to use it in header ⚠️",
      ),
    );
  } catch (error) {
    console.error(
      chalk.red("🛑 API_KEY is not defined in the environment variables 🛑"),
    );
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger
app.use(morgan("dev"));

// Welcome route
app.get("/", (req, res) => {
  res.send("WhatsApp API Server is running!");
});

// Authentication middleware
app.use(authenticateApiKey);

// API Routes
app.use("/channel", channelRoutes);
app.use("/", chatRoutes);

// Add global error handler
app.use(handleUploadError);
app.use(globalErrorHandler);

// Start the WhatsApp client connection
connectToWhatsApp().catch((err) =>
  console.error("Failed to connect to WhatsApp:", err),
);

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Server is listening on port ${PORT}`);
});

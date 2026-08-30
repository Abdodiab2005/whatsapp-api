// routes/chatRoutes.js
const express = require("express");
const upload = require("../middleware/upload.middleware");
const { validateUploadedMedia } = upload;
const {
  requireIdempotencyKey,
} = require("../middleware/idempotency.middleware");
const {
  sendPrivateMessage,
  sendMedia,
  resolveRecipient,
  isOnWhatsApp,
} = require("../controllers/chat.controller");

const router = express.Router();

router.post("/send", requireIdempotencyKey, sendPrivateMessage);
router.post(
  "/send-media",
  requireIdempotencyKey,
  upload.single("file"),
  validateUploadedMedia,
  sendMedia,
);
router.post("/isOnWhatsApp", isOnWhatsApp);
router.post("/resolve-recipient", resolveRecipient);

module.exports = router;

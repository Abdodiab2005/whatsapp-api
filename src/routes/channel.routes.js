// routes/channelRoutes.js
const express = require("express");
const upload = require("../middleware/upload.middleware");
const { validateUploadedMedia } = upload;
const {
  requireIdempotencyKey,
} = require("../middleware/idempotency.middleware");
const {
  getJid,
  checkRole,
  fetchChannels,
  sendMessage,
  sendMedia,
} = require("../controllers/channel.controller");

const router = express.Router();

router.get("/", fetchChannels);
router.post("/get-jid", getJid);
router.post("/check-role", checkRole);
router.post("/send", requireIdempotencyKey, sendMessage);
router.post(
  "/send-media",
  requireIdempotencyKey,
  upload.single("file"),
  validateUploadedMedia,
  sendMedia,
);

module.exports = router;

// routes/chatRoutes.js
const express = require("express");
const upload = require("../middleware/upload.middleware");
const {
  sendPrivateMessage,
  sendMedia,
  isOnWhatsApp,
} = require("../controllers/chat.controller");

const router = express.Router();

router.post("/send", sendPrivateMessage);
router.post("/send-media", upload.single("file"), sendMedia);
router.post("/isOnWhatsApp", isOnWhatsApp);

module.exports = router;

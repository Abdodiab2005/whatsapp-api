// routes/chatRoutes.js
const express = require("express");
const {
  sendPrivateMessage,
  isOnWhatsApp,
} = require("../controllers/chat.controller");
const router = express.Router();

router.post("/send", sendPrivateMessage);
router.post("/isOnWhatsApp", isOnWhatsApp);

module.exports = router;

// routes/channelRoutes.js
const express = require("express");
const {
  getJid,
  checkRole,
  sendMessage,
} = require("../controllers/channel.controller");
const router = express.Router();

router.post("/get-jid", getJid);
router.post("/check-role", checkRole);
router.post("/send", sendMessage);

module.exports = router;

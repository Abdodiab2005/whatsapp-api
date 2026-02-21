// routes/channelRoutes.js
const express = require("express");
const upload = require("../middleware/upload.middleware");
const {
  getJid,
  checkRole,
  sendMessage,
  sendMedia,
} = require("../controllers/channel.controller");

const router = express.Router();

router.post("/get-jid", getJid);
router.post("/check-role", checkRole);
router.post("/send", sendMessage);
router.post("/send-media", upload.single("file"), sendMedia);

module.exports = router;

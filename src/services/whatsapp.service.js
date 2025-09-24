// services/whatsappService.js
const { getClient } = require("../whatsappClient");
const logger = require("../utils/logger");

const getJidFromInvite = async (inviteCode) => {
  const sock = getClient();
  const metadata = await sock.newsletterMetadata("invite", inviteCode);
  return metadata?.id || null;
};

const getRoleInChannel = async (jid) => {
  const sock = getClient();
  const metadata = await sock.newsletterMetadata("jid", jid);
  return metadata?.viewer_metadata?.role || null;
};

const sendChannelMessage = async (jid, message) => {
  const sock = getClient();
  await sock.sendMessage(jid, { text: message });
};

const isNumberOnWhatsApp = async (jid) => {
  const sock = getClient();
  const [result] = await sock.onWhatsApp(jid);
  return result?.exists || false;
};

const sendPrivateMessage = async (jid, message) => {
  const sock = getClient();
  await sock.sendMessage(jid, { text: message });
};

module.exports = {
  getJidFromInvite,
  getRoleInChannel,
  sendChannelMessage,
  isNumberOnWhatsApp,
  sendPrivateMessage,
};

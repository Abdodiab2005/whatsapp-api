const whatsappService = require("./whatsapp.service");
const AppError = require("../utils/AppError");

const getJidFromLink = async (link) => {
  const inviteCode = link.split("/").pop();
  return await whatsappService.getJidFromInvite(inviteCode);
};

/**
 * Helper: resolves channel JID from a link and verifies admin/owner role.
 * Throws AppError on failure or returns { jid } on success.
 */
const resolveChannelWithAdminCheck = async (link) => {
  const jid = await getJidFromLink(link);
  if (!jid) {
    throw new AppError("Channel not found for this link.", 404);
  }

  const role = await whatsappService.getRoleInChannel(jid);
  if (role !== "ADMIN" && role !== "OWNER") {
    throw new AppError("Forbidden. You are not an admin in this channel.", 403);
  }

  return jid;
};

const checkRole = async (link) => {
  const jid = await getJidFromLink(link);
  if (!jid) {
    throw new AppError("Channel not found for this link.", 404);
  }
  return await whatsappService.getRoleInChannel(jid);
};

const sendMessage = async (link, jidInput, message) => {
  let jid = jidInput;
  if (!jid) {
    jid = await resolveChannelWithAdminCheck(link);
  }
  return await whatsappService.sendMessage(jid, message);
};

const sendMedia = async (link, jidInput, file, caption, ptt) => {
  let jid = jidInput;
  if (!jid) {
    jid = await resolveChannelWithAdminCheck(link);
  }
  return await whatsappService.sendMediaMessage(jid, file, { caption, ptt });
};

module.exports = {
  getJidFromLink,
  checkRole,
  resolveChannelWithAdminCheck,
  sendMessage,
  sendMedia,
};

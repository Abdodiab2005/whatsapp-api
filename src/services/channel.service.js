const whatsappService = require("./whatsapp.service");
const AppError = require("../utils/AppError");
const { isPublisherRole, normalizeChannel } = require("../utils/channel");
const { parseChannelInviteCode } = require("../utils/validator");

/**
 * Live snapshot of every newsletter the connected account is subscribed to,
 * normalized and stripped of rows WhatsApp returned without a usable JID.
 */
const listSubscribedChannels = async () => {
  const raw = await whatsappService.fetchSubscribedChannels();
  return raw.map((entry) => normalizeChannel(entry)).filter(Boolean);
};

/**
 * Only the channels the connected account may publish to. Authorization comes
 * from WhatsApp's live viewer metadata, never from send history.
 */
const listPublishableChannels = async () => {
  const channels = await listSubscribedChannels();
  return channels.filter((channel) => isPublisherRole(channel.role));
};

const getJidFromLink = async (link) => {
  const validation = parseChannelInviteCode(link);
  if (!validation.isValid) {
    throw new AppError(validation.error, 400);
  }
  return whatsappService.getJidFromInvite(validation.inviteCode);
};

const resolveChannel = async (selector) => {
  let jid = selector.jid;
  if (selector.type === "link") {
    jid = await whatsappService.getJidFromInvite(selector.inviteCode);
  } else if (selector.type === "handle") {
    const channels = await listSubscribedChannels();
    const match = channels.find(
      (channel) => channel.handle === selector.handle,
    );
    if (!match) {
      throw new AppError(
        "No subscribed WhatsApp channel matches this handle.",
        404,
      );
    }
    jid = match.jid;
  }

  if (!jid) {
    throw new AppError("WhatsApp channel not found.", 404);
  }
  return jid;
};

const checkRole = async (selector) => {
  const jid = await resolveChannel(selector);
  const role = await whatsappService.getRoleInChannel(jid);
  return { jid, role, isAdmin: isPublisherRole(role) };
};

const sendMessage = async (selector, message) => {
  const jid = await resolveChannel(selector);
  return whatsappService.sendNewsletterMessage(jid, message, {
    expectedHandle: selector.handle,
  });
};

const sendMedia = async (selector, file, caption, ptt) => {
  const jid = await resolveChannel(selector);
  return whatsappService.sendNewsletterMediaMessage(jid, file, {
    caption,
    ptt,
    expectedHandle: selector.handle,
  });
};

/**
 * Pagination runs locally after the authorization filter so `total` reflects
 * the publishable channels only, not every subscription.
 */
const fetchChannels = async ({ limit, offset }) => {
  const channels = await listPublishableChannels();
  return {
    channels: channels.slice(offset, offset + limit),
    total: channels.length,
  };
};

module.exports = {
  fetchChannels,
  getJidFromLink,
  checkRole,
  listPublishableChannels,
  listSubscribedChannels,
  resolveChannel,
  sendMessage,
  sendMedia,
};

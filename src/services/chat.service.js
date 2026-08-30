const whatsappService = require("./whatsapp.service");
const { validatePhoneNumber } = require("../utils/validator");
const AppError = require("../utils/AppError");

const resolveRecipient = (recipient) =>
  whatsappService.resolveUserIdentifier(recipient);

/**
 * Helper: validates a phone number and checks WhatsApp registration.
 * Throws AppError on failure or returns { jid } on success.
 */
const resolveWhatsAppNumber = async (number) => {
  const validation = validatePhoneNumber(number);
  if (!validation.isValid) {
    throw new AppError(validation.error, 400);
  }
  const { jid } = validation;

  const isOnWhatsApp = await whatsappService.isNumberOnWhatsApp(jid);
  if (!isOnWhatsApp) {
    throw new AppError("This phone number is not on WhatsApp.", 404);
  }

  return jid;
};

const sendPrivateMessage = async (recipient, message) => {
  const identity = await resolveRecipient(recipient);
  const sentMessage = await whatsappService.sendMessage(identity.jid, message);
  return { identity, sentMessage };
};

const sendMedia = async (recipient, file, caption, ptt) => {
  const identity = await resolveRecipient(recipient);
  const sentMessage = await whatsappService.sendMediaMessage(
    identity.jid,
    file,
    { caption, ptt },
  );
  return { identity, sentMessage };
};

const checkIsOnWhatsApp = async (number) => {
  const validation = validatePhoneNumber(number);
  if (!validation.isValid) {
    throw new AppError(validation.error, 400);
  }
  const { jid } = validation;
  return whatsappService.isNumberOnWhatsApp(jid);
};

module.exports = {
  resolveRecipient,
  resolveWhatsAppNumber,
  sendPrivateMessage,
  sendMedia,
  checkIsOnWhatsApp,
};

const whatsappService = require("./whatsapp.service");
const { validatePhoneNumber } = require("../utils/validator");
const AppError = require("../utils/AppError");

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

const sendPrivateMessage = async (number, message) => {
  const jid = await resolveWhatsAppNumber(number);
  return await whatsappService.sendMessage(jid, message);
};

const sendMedia = async (number, file, caption, ptt) => {
  const jid = await resolveWhatsAppNumber(number);
  return await whatsappService.sendMediaMessage(jid, file, { caption, ptt });
};

const checkIsOnWhatsApp = async (number) => {
  const validation = validatePhoneNumber(number);
  if (!validation.isValid) {
    throw new AppError(validation.error, 400);
  }
  const { jid } = validation;
  return await whatsappService.isNumberOnWhatsApp(jid);
};

module.exports = {
  resolveWhatsAppNumber,
  sendPrivateMessage,
  sendMedia,
  checkIsOnWhatsApp,
};

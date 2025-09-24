// controllers/chatController.js
const whatsappService = require("../services/whatsapp.service");
const { validatePhoneNumber } = require("../utils/validator");
const logger = require("../utils/logger");
const { successResponse, errorResponse } = require("../utils/responseHandler");

const sendPrivateMessage = async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return errorResponse(
      res,
      "Phone number and message are required.",
      400,
      "Phone number and message are required."
    );
  }

  // 1. Validate phone number format
  const validation = validatePhoneNumber(number);
  if (!validation.isValid) {
    return errorResponse(res, validation.error, 400, validation.error);
  }
  const { jid } = validation;

  try {
    // 2. Check if number exists on WhatsApp
    const isOnWhatsApp = await whatsappService.isNumberOnWhatsApp(jid);
    if (!isOnWhatsApp) {
      return errorResponse(
        res,
        "This phone number is not on WhatsApp.",
        404,
        "This phone number is not on WhatsApp."
      );
    }

    // 3. Send message
    await whatsappService.sendPrivateMessage(jid, message);
    return successResponse(
      res,
      { message: "Message sent successfully." },
      200,
      "Message sent successfully."
    );
  } catch (error) {
    logger.error(error);
    return errorResponse(
      res,
      "Failed to send message.",
      500,
      "Failed to send message."
    );
  }
};

const isOnWhatsApp = async (req, res) => {
  const { number } = req.body;
  if (!number) {
    return errorResponse(
      res,
      "Phone number is required.",
      400,
      "Phone number is required."
    );
  }

  // 1. Validate phone number format
  const validation = validatePhoneNumber(number);
  if (!validation.isValid) {
    return errorResponse(res, validation.error, 400, validation.error);
  }
  const { jid } = validation;

  try {
    // 2. Check if number exists on WhatsApp
    const isOnWhatsApp = await whatsappService.isNumberOnWhatsApp(jid);
    return successResponse(
      res,
      { isOnWhatsApp },
      200,
      "Number exists on WhatsApp."
    );
  } catch (error) {
    logger.error(error);
    return errorResponse(
      res,
      "Failed to check if number exists on WhatsApp.",
      500,
      "Failed to check if number exists on WhatsApp."
    );
  }
};

module.exports = { sendPrivateMessage, isOnWhatsApp };

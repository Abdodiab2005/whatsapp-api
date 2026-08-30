// controllers/chatController.js
const chatService = require("../services/chat.service");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const {
  describeFile,
  executeIdempotentOperation,
} = require("../utils/idempotency");
const {
  MAX_CAPTION_LENGTH,
  parseOptionalBoolean,
  parseUserRecipient,
  validateOptionalText,
  validateRequiredText,
} = require("../utils/validator");

function createSendResponse(messageId, media = false, identity) {
  const message = media
    ? "Media sent successfully."
    : "Message sent successfully.";
  return {
    success: true,
    data: {
      message,
      ...(messageId ? { messageId } : {}),
      ...(identity ? { recipient: identity } : {}),
    },
    statusCode: 200,
    message,
  };
}

function sendIdempotentResult(res, result) {
  res.set("Idempotency-Status", result.replayed ? "replayed" : "created");
  return res.status(result.statusCode).json(result.body);
}

/**
 * Sends a text message to a private chat.
 */
const sendPrivateMessage = catchAsync(async (req, res, next) => {
  const { message } = req.body;
  const recipientValidation = parseUserRecipient(req.body);
  if (!recipientValidation.isValid) {
    return next(new AppError(recipientValidation.error, 400));
  }
  const messageValidation = validateRequiredText(message, "Message");
  if (!messageValidation.isValid) {
    return next(new AppError(messageValidation.error, 400));
  }

  const result = await executeIdempotentOperation({
    key: req.idempotencyKey,
    scope: "POST /send",
    payload: { recipient: recipientValidation.recipient, message },
    operation: async () => {
      const { identity, sentMessage } = await chatService.sendPrivateMessage(
        recipientValidation.recipient,
        message,
      );
      return {
        statusCode: 200,
        body: createSendResponse(sentMessage?.key?.id, false, identity),
      };
    },
  });

  return sendIdempotentResult(res, result);
});

/**
 * Sends a media file (image, video, or voice note) to a private chat.
 */
const sendMedia = catchAsync(async (req, res, next) => {
  const { caption } = req.body;
  const recipientValidation = parseUserRecipient(req.body);
  const pttValidation = parseOptionalBoolean(req.body.ptt, "ptt");
  const captionValidation = validateOptionalText(
    caption,
    "Caption",
    MAX_CAPTION_LENGTH,
  );

  if (!recipientValidation.isValid) {
    return next(new AppError(recipientValidation.error, 400));
  }
  if (!req.file) {
    return next(new AppError("A media file is required.", 400));
  }
  if (!pttValidation.isValid) {
    return next(new AppError(pttValidation.error, 400));
  }
  if (!captionValidation.isValid) {
    return next(new AppError(captionValidation.error, 400));
  }

  const file = await describeFile(req.file);
  const result = await executeIdempotentOperation({
    key: req.idempotencyKey,
    scope: "POST /send-media",
    payload: {
      recipient: recipientValidation.recipient,
      caption,
      ptt: pttValidation.value,
      file,
    },
    operation: async () => {
      const { identity, sentMessage } = await chatService.sendMedia(
        recipientValidation.recipient,
        req.file,
        caption,
        pttValidation.value,
      );
      return {
        statusCode: 200,
        body: createSendResponse(sentMessage?.key?.id, true, identity),
      };
    },
  });

  return sendIdempotentResult(res, result);
});

/**
 * Resolves a phone number, user JID, LID, or WhatsApp username.
 */
const resolveRecipient = catchAsync(async (req, res, next) => {
  const validation = parseUserRecipient(req.body);
  if (!validation.isValid) {
    return next(new AppError(validation.error, 400));
  }

  const identity = await chatService.resolveRecipient(validation.recipient);
  return res.status(200).json({
    success: true,
    data: identity,
    statusCode: 200,
    message: "Recipient resolved successfully.",
  });
});

/**
 * Checks if a phone number is registered on WhatsApp.
 */
const isOnWhatsApp = catchAsync(async (req, res, next) => {
  const { number } = req.body;
  if (!number) {
    return next(new AppError("Phone number is required.", 400));
  }

  const onWhatsApp = await chatService.checkIsOnWhatsApp(number);
  return res.status(200).json({
    success: true,
    data: { isOnWhatsApp: onWhatsApp },
    statusCode: 200,
    message: onWhatsApp
      ? "Number exists on WhatsApp."
      : "Number is not on WhatsApp.",
  });
});

module.exports = {
  sendPrivateMessage,
  sendMedia,
  resolveRecipient,
  isOnWhatsApp,
};

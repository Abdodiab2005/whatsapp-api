// controllers/chatController.js
const chatService = require("../services/chat.service");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");

/**
 * Sends a text message to a private chat.
 */
const sendPrivateMessage = catchAsync(async (req, res, next) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return next(new AppError("Phone number and message are required.", 400));
  }

  await chatService.sendPrivateMessage(number, message);

  res.status(200).json({
    success: true,
    data: { message: "Message sent successfully." },
    statusCode: 200,
    message: "Message sent successfully.",
  });
});

/**
 * Sends a media file (image, video, or voice note) to a private chat.
 */
const sendMedia = catchAsync(async (req, res, next) => {
  const { number, caption } = req.body;
  const ptt =
    req.body.ptt === "true"
      ? true
      : req.body.ptt === "false"
        ? false
        : undefined;

  if (!number) {
    return next(new AppError("Phone number is required.", 400));
  }
  if (!req.file) {
    return next(new AppError("A media file is required.", 400));
  }

  await chatService.sendMedia(number, req.file, caption, ptt);

  res.status(200).json({
    success: true,
    data: { message: "Media sent successfully." },
    statusCode: 200,
    message: "Media sent successfully.",
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
  res.status(200).json({
    success: true,
    data: { isOnWhatsApp: onWhatsApp },
    statusCode: 200,
    message: "Number exists on WhatsApp.",
  });
});

module.exports = { sendPrivateMessage, sendMedia, isOnWhatsApp };

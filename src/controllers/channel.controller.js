// controllers/channelController.js
const channelService = require("../services/channel.service");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");

/**
 * Resolves a channel JID from an invite link.
 */
const getJid = catchAsync(async (req, res, next) => {
  const { link } = req.body;
  if (!link) {
    return next(new AppError("Invite link is required.", 400));
  }

  const jid = await channelService.getJidFromLink(link);

  if (jid) {
    res.status(200).json({
      success: true,
      data: { jid },
      statusCode: 200,
      message: "JID found successfully.",
    });
  } else {
    return next(new AppError("Could not find JID for the given link.", 404));
  }
});

/**
 * Checks the authenticated user's role in a channel.
 */
const checkRole = catchAsync(async (req, res, next) => {
  const { link } = req.body;
  if (!link) {
    return next(new AppError("Invite link is required.", 400));
  }

  const role = await channelService.checkRole(link);

  res.status(200).json({
    success: true,
    data: { role },
    statusCode: 200,
    message: "Role found successfully.",
  });
});

/**
 * Sends a text message to a channel.
 */
const sendMessage = catchAsync(async (req, res, next) => {
  const { link, message } = req.body;
  let { jid } = req.body;
  if ((!link || !message) && !jid) {
    return next(new AppError("Invite link and message are required.", 400));
  }

  await channelService.sendMessage(link, jid, message);

  res.status(200).json({
    success: true,
    data: { message: "Message sent successfully." },
    statusCode: 200,
    message: "Message sent successfully.",
  });
});

/**
 * Sends a media file (image, video, or voice note) to a channel.
 */
const sendMedia = catchAsync(async (req, res, next) => {
  const { link, caption } = req.body;
  let { jid } = req.body;
  const ptt =
    req.body.ptt === "true"
      ? true
      : req.body.ptt === "false"
        ? false
        : undefined;

  if (!link) {
    return next(new AppError("Invite link is required.", 400));
  }
  if (!req.file) {
    return next(new AppError("A media file is required.", 400));
  }

  await channelService.sendMedia(link, jid, req.file, caption, ptt);

  res.status(200).json({
    success: true,
    data: { message: "Media sent successfully." },
    statusCode: 200,
    message: "Media sent successfully.",
  });
});

module.exports = { getJid, checkRole, sendMessage, sendMedia };

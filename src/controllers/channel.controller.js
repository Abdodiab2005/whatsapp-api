// controllers/channelController.js
const channelService = require("../services/channel.service");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const {
  describeFile,
  executeIdempotentOperation,
} = require("../utils/idempotency");
const {
  MAX_CAPTION_LENGTH,
  parseChannelSelector,
  parseOptionalBoolean,
  validateOptionalText,
  validateRequiredText,
} = require("../utils/validator");

function createSendResponse(messageId, media = false) {
  const message = media
    ? "Media sent successfully."
    : "Message sent successfully.";
  return {
    success: true,
    data: { message, ...(messageId ? { messageId } : {}) },
    statusCode: 200,
    message,
  };
}

function sendIdempotentResult(res, result) {
  res.set("Idempotency-Status", result.replayed ? "replayed" : "created");
  return res.status(result.statusCode).json(result.body);
}

function parsePaginationValue(value, label, fallback, minimum, maximum) {
  if (value == null || value === "") return { value: fallback };
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { error: `${label} must be a non-negative integer.` };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return {
      error: `${label} must be between ${minimum} and ${maximum}.`,
    };
  }
  return { value: parsed };
}

/**
 * Resolves a channel JID from an invite link.
 */
const getJid = catchAsync(async (req, res, next) => {
  const validation = parseChannelSelector(req.body);
  if (!validation.isValid) {
    return next(new AppError(validation.error, 400));
  }

  const jid = await channelService.resolveChannel(validation.selector);
  return res.status(200).json({
    success: true,
    data: { jid },
    statusCode: 200,
    message: "JID found successfully.",
  });
});

/**
 * Checks the authenticated user's role in a channel.
 */
const checkRole = catchAsync(async (req, res, next) => {
  const validation = parseChannelSelector(req.body);
  if (!validation.isValid) {
    return next(new AppError(validation.error, 400));
  }

  const role = await channelService.checkRole(validation.selector);

  return res.status(200).json({
    success: true,
    data: role,
    statusCode: 200,
    message: "Role found successfully.",
  });
});

/**
 * Lists the channels the connected WhatsApp account can publish to, queried
 * live from WhatsApp on every request.
 */
const fetchChannels = catchAsync(async (req, res, next) => {
  const limit = parsePaginationValue(req.query.limit, "limit", 50, 1, 100);
  const offset = parsePaginationValue(
    req.query.offset,
    "offset",
    0,
    0,
    1_000_000,
  );
  if (limit.error) return next(new AppError(limit.error, 400));
  if (offset.error) return next(new AppError(offset.error, 400));

  const result = await channelService.fetchChannels({
    limit: limit.value,
    offset: offset.value,
  });
  return res.status(200).json({
    success: true,
    data: {
      channels: result.channels,
      pagination: {
        limit: limit.value,
        offset: offset.value,
        total: result.total,
      },
    },
    statusCode: 200,
    message: "Channels fetched successfully.",
  });
});

/**
 * Sends a text message to a channel.
 */
const sendMessage = catchAsync(async (req, res, next) => {
  const { message } = req.body;
  const selectorValidation = parseChannelSelector(req.body);

  if (!selectorValidation.isValid) {
    return next(new AppError(selectorValidation.error, 400));
  }
  const messageValidation = validateRequiredText(message, "Message");
  if (!messageValidation.isValid) {
    return next(new AppError(messageValidation.error, 400));
  }

  const result = await executeIdempotentOperation({
    key: req.idempotencyKey,
    scope: "POST /channel/send",
    payload: { selector: selectorValidation.selector, message },
    operation: async () => {
      const sentMessage = await channelService.sendMessage(
        selectorValidation.selector,
        message,
      );
      return {
        statusCode: 200,
        body: createSendResponse(sentMessage?.key?.id),
      };
    },
  });

  return sendIdempotentResult(res, result);
});

/**
 * Sends a media file (image, video, or voice note) to a channel.
 */
const sendMedia = catchAsync(async (req, res, next) => {
  const { caption } = req.body;
  const selectorValidation = parseChannelSelector(req.body);
  const pttValidation = parseOptionalBoolean(req.body.ptt, "ptt");
  const captionValidation = validateOptionalText(
    caption,
    "Caption",
    MAX_CAPTION_LENGTH,
  );

  if (!selectorValidation.isValid) {
    return next(new AppError(selectorValidation.error, 400));
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
    scope: "POST /channel/send-media",
    payload: {
      selector: selectorValidation.selector,
      caption,
      ptt: pttValidation.value,
      file,
    },
    operation: async () => {
      const sentMessage = await channelService.sendMedia(
        selectorValidation.selector,
        req.file,
        caption,
        pttValidation.value,
      );
      return {
        statusCode: 200,
        body: createSendResponse(sentMessage?.key?.id, true),
      };
    },
  });

  return sendIdempotentResult(res, result);
});

module.exports = { getJid, checkRole, fetchChannels, sendMessage, sendMedia };

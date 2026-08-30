const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const multer = require("multer");
const { MAX_FILE_SIZE, ALLOWED_MIME_PREFIXES } = require("../utils/media");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const uploadDirectory = path.join(os.tmpdir(), "wa-api-uploads");
fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(uploadDirectory, 0o700);

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, _file, callback) => {
    callback(null, crypto.randomUUID());
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 5,
    parts: 6,
    fieldSize: 64 * 1024,
  },
});

function registerUploadCleanup(req, res) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned || !req.file?.path) return;
    cleaned = true;
    fs.rm(req.file.path, { force: true }, (error) => {
      if (error) {
        logger.warn(
          { err: error, path: req.file.path },
          "Failed to remove temporary upload",
        );
      }
    });
  };

  res.once("finish", cleanup);
  res.once("close", cleanup);
  return cleanup;
}

async function validateUploadedMedia(req, res, next) {
  if (!req.file) return next();

  const cleanup = registerUploadCleanup(req, res);

  try {
    fs.chmodSync(req.file.path, 0o600);
    const { fileTypeFromFile } = await import("file-type");
    const detected = await fileTypeFromFile(req.file.path);
    const allowed =
      detected &&
      ALLOWED_MIME_PREFIXES.some((prefix) => detected.mime.startsWith(prefix));

    if (!allowed) {
      cleanup();
      return next(
        new AppError(
          "Unsupported file content. Only recognized image, video, and audio files are allowed.",
          400,
        ),
      );
    }

    req.file.mimetype = detected.mime;
    req.file.detectedExtension = detected.ext;
    return next();
  } catch (error) {
    cleanup();
    return next(error);
  }
}

// Arity 4 is what marks this as an Express error handler; keep all four.
function handleUploadError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      LIMIT_FILE_COUNT: "Only one media file is allowed.",
      LIMIT_FIELD_COUNT: "Too many form fields.",
      LIMIT_FIELD_VALUE: "A form field is too large.",
      LIMIT_PART_COUNT: "Too many multipart fields.",
      LIMIT_UNEXPECTED_FILE:
        "Unexpected file field. Use 'file' as the field name.",
    };
    return next(new AppError(messages[err.code] || "Invalid upload.", 400));
  }

  return next(err);
}

module.exports = upload;
module.exports.handleUploadError = handleUploadError;
module.exports.validateUploadedMedia = validateUploadedMedia;

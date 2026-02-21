// middleware/upload.middleware.js
const multer = require("multer");
const path = require("path");
const { MAX_FILE_SIZE, ALLOWED_MIME_PREFIXES } = require("../utils/media");
const AppError = require("../utils/AppError");

/**
 * Extension-to-MIME mapping for common media types.
 * Used as a fallback when the client sends 'application/octet-stream'.
 */
const EXTENSION_MIME_MAP = {
  // Audio
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wma": "audio/x-ms-wma",
  // Image
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  // Video
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".3gp": "video/3gpp",
};

/**
 * Resolves the MIME type, falling back to extension-based detection
 * when the client sends a generic 'application/octet-stream'.
 */
function resolveMimetype(file) {
  if (
    file.mimetype &&
    file.mimetype !== "application/octet-stream" &&
    file.mimetype !== "binary/octet-stream"
  ) {
    return file.mimetype;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || file.mimetype;
}

/**
 * Multer instance configured for in-memory file handling.
 * - Uses memory storage (no temp files on disk).
 * - Enforces a 64 MB file-size limit (WhatsApp's maximum).
 * - Resolves and validates MIME types with extension fallback.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Resolve the actual MIME type (handles octet-stream fallback)
    file.mimetype = resolveMimetype(file);

    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      file.mimetype.startsWith(prefix),
    );
    if (isAllowed) {
      cb(null, true);
    } else {
      const err = new Error(
        `Unsupported file type: ${file.mimetype}. Only image, video, and audio files are allowed.`,
      );
      err.code = "UNSUPPORTED_FILE_TYPE";
      cb(err, false);
    }
  },
});

/**
 * Express error-handling middleware for multer errors.
 * Catches file-size, file-type, and other multer errors and returns
 * a consistent JSON response instead of raw HTML.
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors (file too large, too many files, etc.)
    const messages = {
      LIMIT_FILE_SIZE: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      LIMIT_UNEXPECTED_FILE:
        "Unexpected file field. Use 'file' as the field name.",
    };
    const message = messages[err.code] || err.message;
    return next(new AppError(message, 400));
  }

  if (err?.code === "UNSUPPORTED_FILE_TYPE") {
    return next(new AppError(err.message, 400));
  }

  // Pass non-multer errors to the default Express error handler
  next(err);
}

module.exports = upload;
module.exports.handleUploadError = handleUploadError;

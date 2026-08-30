// utils/media.js
const logger = require("./logger");

/**
 * Supported media type categories mapped to their baileys message keys.
 */
const MEDIA_TYPE_MAP = {
  image: "image",
  video: "video",
  audio: "audio",
};

/**
 * Maximum file size allowed (64 MB — WhatsApp's limit).
 */
const MAX_FILE_SIZE = 64 * 1024 * 1024;

/**
 * Allowed MIME type prefixes.
 */
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];

/**
 * MIME types that WhatsApp natively supports as voice notes (PTT).
 * Only these codecs should be sent with `ptt: true`.
 */
const PTT_MIMETYPES = ["audio/ogg", "audio/ogg; codecs=opus", "audio/opus"];

/**
 * Resolves the baileys media key from a MIME type string.
 * @param {string} mimetype - e.g. "image/jpeg", "video/mp4", "audio/ogg"
 * @returns {string|null} The baileys key ("image", "video", or "audio"), or null if unsupported.
 */
function getMediaType(mimetype) {
  if (!mimetype) return null;
  const prefix = mimetype.split("/")[0];
  return MEDIA_TYPE_MAP[prefix] || null;
}

/**
 * Checks whether an audio MIME type is compatible with WhatsApp's PTT (voice note) format.
 * WhatsApp voice notes require ogg/opus codec. Other audio formats (mp3, wav, etc.)
 * are sent as regular audio files without the PTT flag.
 *
 * @param {string} mimetype
 * @returns {boolean}
 */
function isPttCompatible(mimetype) {
  if (!mimetype) return false;
  const normalized = mimetype.toLowerCase().trim();
  return PTT_MIMETYPES.some((ptt) => normalized.startsWith(ptt));
}

/**
 * Builds a baileys-compatible media message payload from a multer file object.
 *
 * @param {Object} file - The multer file object (must have `path` or `buffer`, plus `mimetype`).
 * @param {Object} [options] - Additional options.
 * @param {string} [options.caption] - Optional caption (applies to image/video only).
 * @param {boolean} [options.ptt] - Force PTT on/off. If omitted, auto-detects from codec.
 * @returns {Object} A baileys message content object ready to pass to `sock.sendMessage`.
 * @throws {Error} If the file type is unsupported.
 */
function buildMediaMessage(file, { caption, ptt } = {}) {
  const mediaType = getMediaType(file.mimetype);

  if (!mediaType) {
    throw new Error(`Unsupported media type: ${file.mimetype}`);
  }

  const message = {
    [mediaType]: file.path ? { url: file.path } : file.buffer,
    mimetype: file.mimetype,
  };

  // Voice notes: use explicit flag if provided, otherwise auto-detect from codec.
  // IMPORTANT: WhatsApp PTT requires OGG Opus codec. Setting ptt=true on MP3/WAV
  // creates a voice note bubble that can't be played. Override to false if incompatible.
  if (mediaType === "audio") {
    const compatible = isPttCompatible(file.mimetype);
    if (typeof ptt === "boolean") {
      if (ptt && !compatible) {
        logger.warn(
          { mimetype: file.mimetype },
          "PTT requested for incompatible media; sending regular audio",
        );
        message.ptt = false;
      } else {
        message.ptt = ptt;
      }
    } else {
      message.ptt = compatible;
    }
  }

  // Captions only apply to image and video
  if (caption && (mediaType === "image" || mediaType === "video")) {
    message.caption = caption;
  }

  return message;
}

module.exports = {
  getMediaType,
  isPttCompatible,
  buildMediaMessage,
  MAX_FILE_SIZE,
  ALLOWED_MIME_PREFIXES,
};

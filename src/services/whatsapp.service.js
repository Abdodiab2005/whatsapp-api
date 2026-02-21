// services/whatsappService.js
const { createReadStream } = require("fs");
const { getClient } = require("../whatsappClient");
const { buildMediaMessage } = require("../utils/media");
const logger = require("../utils/logger");

/**
 * Newsletter-specific media upload path map.
 * WhatsApp uses /newsletter/newsletter-{type} for channel media,
 * which returns /m1/ directPaths. Regular /mms/{type} returns /o1/ paths.
 */
const NEWSLETTER_MEDIA_PATH_MAP = {
  image: "/newsletter/newsletter-image",
  video: "/newsletter/newsletter-video",
  document: "/newsletter/newsletter-document",
  audio: "/newsletter/newsletter-audio",
  sticker: "/newsletter/newsletter-image",
};

const REGULAR_MEDIA_PATH_MAP = {
  image: "/mms/image",
  video: "/mms/video",
  document: "/mms/document",
  audio: "/mms/audio",
  sticker: "/mms/image",
};

/**
 * Creates a newsletter-specific upload function that wraps the standard
 * upload but uses /newsletter/newsletter-{type}/ CDN paths.
 *
 * @param {Object} sock - The baileys socket instance.
 * @returns {Function} Upload function compatible with baileys' upload interface.
 */
function createNewsletterUpload(sock) {
  return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {
    const mediaConn = await sock.refreshMediaConn();
    const hosts = mediaConn.hosts;
    const auth = encodeURIComponent(mediaConn.auth);

    const {
      encodeBase64EncodedStringForUpload,
    } = require("@whiskeysockets/baileys");
    const encodedHash = encodeBase64EncodedStringForUpload(fileEncSha256B64);

    const newsletterPath =
      NEWSLETTER_MEDIA_PATH_MAP[mediaType] || REGULAR_MEDIA_PATH_MAP[mediaType];

    let urls;
    for (const { hostname } of hosts) {
      const url = `https://${hostname}${newsletterPath}/${encodedHash}?auth=${auth}&token=${encodedHash}`;
      logger.info(
        { hostname, path: newsletterPath, mediaType },
        "Uploading newsletter media",
      );

      try {
        const stream = createReadStream(filePath);
        const response = await fetch(url, {
          method: "POST",
          body: stream,
          headers: {
            "Content-Type": "application/octet-stream",
            Origin: "https://web.whatsapp.com",
          },
          duplex: "half",
          signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        });

        let result;
        try {
          result = await response.json();
        } catch {
          result = undefined;
        }

        logger.info(
          { hostname, result: JSON.stringify(result) },
          "Newsletter upload response",
        );

        if (result?.url || result?.directPath || result?.direct_path) {
          urls = {
            mediaUrl: result.url,
            directPath: result.direct_path,
            meta_hmac: result.meta_hmac,
            fbid: result.fbid,
            ts: result.ts,
          };
          break;
        } else {
          logger.warn({ hostname, result }, "Newsletter upload failed on host");
        }
      } catch (error) {
        logger.warn(
          { hostname, error: error.message },
          "Newsletter upload error",
        );
      }
    }

    if (!urls) {
      throw new Error("Newsletter media upload failed on all hosts");
    }

    return urls;
  };
}

// ─── Standard service methods ────────────────────────────────────────────────

const getJidFromInvite = async (inviteCode) => {
  const sock = getClient();
  const metadata = await sock.newsletterMetadata("invite", inviteCode);
  return metadata?.id || null;
};

const getRoleInChannel = async (jid) => {
  const sock = getClient();
  const metadata = await sock.newsletterMetadata("jid", jid);
  return metadata?.viewer_metadata?.role || null;
};

const isNumberOnWhatsApp = async (jid) => {
  const sock = getClient();
  const [result] = await sock.onWhatsApp(jid);
  return result?.exists || false;
};

const sendMessage = async (jid, text) => {
  const sock = getClient();
  const result = await sock.sendMessage(jid, { text });
  logger.info({ jid, messageId: result?.key?.id }, "Text message sent");
  return result;
};

function isNewsletterJid(jid) {
  return jid?.endsWith("@newsletter");
}

/**
 * Sends a media message to any JID.
 *
 * For newsletters: temporarily replaces sock.waUploadToServer with a
 * newsletter-specific version that uses /newsletter/ CDN paths.
 * This allows baileys' own sendMessage to handle the full pipeline
 * (generateWAMessage → relayMessage) with the correct upload path.
 *
 * @param {string} jid - The recipient JID.
 * @param {Object} file - The multer file object (buffer + mimetype).
 * @param {Object} [options] - Additional options.
 * @param {string} [options.caption] - Optional caption for image/video.
 * @param {boolean} [options.ptt] - Force PTT on/off for audio.
 */
const sendMediaMessage = async (jid, file, { caption, ptt } = {}) => {
  const sock = getClient();
  const content = buildMediaMessage(file, { caption, ptt });

  logger.info(
    {
      jid,
      mimetype: file.mimetype,
      size: file.size,
      mediaKeys: Object.keys(content),
      isNewsletter: isNewsletterJid(jid),
    },
    "Preparing media message",
  );

  if (isNewsletterJid(jid)) {
    // Monkey-patch: temporarily swap the upload function so baileys'
    // own sendMessage pipeline uses newsletter CDN paths end-to-end.
    const originalUpload = sock.waUploadToServer;
    const newsletterUpload = createNewsletterUpload(sock);

    try {
      sock.waUploadToServer = newsletterUpload;

      const result = await sock.sendMessage(jid, content);

      logger.info(
        { jid, messageId: result?.key?.id },
        "Newsletter media message sent via patched upload",
      );
      return result;
    } finally {
      // Always restore original upload function
      sock.waUploadToServer = originalUpload;
    }
  }

  // For regular chats/groups, use sock.sendMessage directly
  const result = await sock.sendMessage(jid, content);
  logger.info(
    { jid, messageId: result?.key?.id, status: result?.status },
    "Chat media message sent",
  );
  return result;
};

module.exports = {
  getJidFromInvite,
  getRoleInChannel,
  isNumberOnWhatsApp,
  sendMessage,
  sendMediaMessage,
};

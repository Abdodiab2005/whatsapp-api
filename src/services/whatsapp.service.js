const {
  encodeBase64EncodedStringForUpload,
  generateWAMessage,
  isHostedLidUser,
  isHostedPnUser,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  USyncQuery,
  USyncUser,
  uploadWithNodeHttp,
} = require("@whiskeysockets/baileys");
const {
  executeWMexQuery,
} = require("@whiskeysockets/baileys/lib/Socket/mex.js");
const { getClient } = require("../whatsappClient");
const { buildMediaMessage, getMediaType } = require("../utils/media");
const { attachMediaMetadata } = require("../utils/mediaMetadata");
const { enqueueSend } = require("../utils/sendQueue");
const AppError = require("../utils/AppError");
const {
  channelHandle,
  channelRole,
  isPublisherRole,
} = require("../utils/channel");
const { validateUserJid } = require("../utils/validator");
const logger = require("../utils/logger");

const SUBSCRIBED_NEWSLETTERS_QUERY_ID = "6388546374527196";
const SUBSCRIBED_NEWSLETTERS_DATA_PATH = "xwa2_newsletter_subscribed";

const NEWSLETTER_MEDIA_PATH_MAP = {
  image: "/newsletter/newsletter-image",
  video: "/newsletter/newsletter-video",
  document: "/newsletter/newsletter-document",
  audio: "/newsletter/newsletter-audio",
  sticker: "/newsletter/newsletter-image",
};

function createNewsletterUpload(sock, uploadFile = uploadWithNodeHttp) {
  return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {
    const newsletterPath = NEWSLETTER_MEDIA_PATH_MAP[mediaType];
    if (!newsletterPath) {
      throw new Error(`Unsupported newsletter media type: ${mediaType}`);
    }

    const encodedHash = encodeBase64EncodedStringForUpload(fileEncSha256B64);

    for (let refreshAttempt = 0; refreshAttempt < 2; refreshAttempt += 1) {
      const mediaConn = await sock.refreshMediaConn(refreshAttempt > 0);
      const auth = encodeURIComponent(mediaConn.auth);

      for (const { hostname } of mediaConn.hosts) {
        const url = `https://${hostname}${newsletterPath}/${encodedHash}?auth=${auth}&token=${encodedHash}`;
        logger.debug(
          { hostname, path: newsletterPath, mediaType },
          "Uploading newsletter media",
        );

        try {
          const result = await uploadFile({
            url,
            filePath,
            headers: {
              "Content-Type": "application/octet-stream",
              Origin: "https://web.whatsapp.com",
            },
            timeoutMs,
          });

          if (result?.url || result?.direct_path || result?.directPath) {
            logger.debug(
              { hostname, mediaType },
              "Newsletter media upload completed",
            );
            return {
              mediaUrl: result.url || result.mediaUrl,
              directPath: result.direct_path || result.directPath,
              meta_hmac: result.meta_hmac,
              fbid: result.fbid,
              ts: result.ts,
            };
          }

          logger.warn(
            { hostname, mediaType },
            "Newsletter media upload returned no media path",
          );
        } catch (error) {
          logger.warn(
            { hostname, mediaType, errorCode: error.code },
            "Newsletter media upload failed",
          );
        }
      }
    }

    throw new Error("Newsletter media upload failed on all hosts");
  };
}

function dependencyError(message, cause) {
  const error = new AppError(message, 502);
  error.cause = cause;
  error.idempotencySafeToRetry = true;
  return error;
}

async function fetchNewsletterMetadata(sock, type, key) {
  try {
    return await sock.newsletterMetadata(type, key);
  } catch (error) {
    throw dependencyError("Unable to fetch WhatsApp channel metadata.", error);
  }
}

/**
 * WhatsApp answers the subscribed-newsletters query with a bare array, but the
 * MEX payload has been seen wrapped in a container object, so accept both.
 */
function toSubscribedChannelArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.newsletters)) return response.newsletters;
  if (Array.isArray(response?.newsletter)) return response.newsletter;
  if (Array.isArray(response?.[SUBSCRIBED_NEWSLETTERS_DATA_PATH])) {
    return response[SUBSCRIBED_NEWSLETTERS_DATA_PATH];
  }
  return null;
}

/**
 * Fetches every newsletter the connected account is subscribed to straight
 * from WhatsApp. There is no local fallback on purpose: a stale catalog must
 * never stand in for live authorization data.
 */
async function fetchSubscribedChannels(sock = getClient()) {
  let response;
  try {
    response = await executeWMexQuery(
      {},
      SUBSCRIBED_NEWSLETTERS_QUERY_ID,
      SUBSCRIBED_NEWSLETTERS_DATA_PATH,
      (node) => sock.query(node),
      () => sock.generateMessageTag(),
    );
  } catch (error) {
    throw dependencyError(
      "Unable to fetch the subscribed WhatsApp channels.",
      error,
    );
  }

  const channels = toSubscribedChannelArray(response);
  if (!channels) {
    const error = new AppError(
      "WhatsApp returned a malformed subscribed channel list.",
      502,
    );
    error.idempotencySafeToRetry = true;
    throw error;
  }

  logger.debug({ count: channels.length }, "Fetched subscribed channels");
  return channels;
}

const getNewsletterMetadata = (type, key) =>
  fetchNewsletterMetadata(getClient(), type, key);

const getJidFromInvite = async (inviteCode) => {
  const metadata = await getNewsletterMetadata("invite", inviteCode);
  return metadata?.id || null;
};

const getRoleInChannel = async (jid) => {
  const metadata = await getNewsletterMetadata("jid", jid);
  if (!metadata) throw new AppError("WhatsApp channel not found.", 404);
  return channelRole(metadata);
};

const isNumberOnWhatsApp = async (jid) => {
  const sock = getClient();
  const [result] = (await sock.onWhatsApp(jid)) ?? [];
  return result?.exists || false;
};

function normalizeResolvedUserJid(jid) {
  const normalized = jidNormalizedUser(jid);
  const validation = validateUserJid(normalized);
  return validation.isValid ? validation.jid : null;
}

async function lookupUsername(sock, username) {
  const query = new USyncQuery()
    .withContactProtocol()
    .withUsernameProtocol()
    .withUser(new USyncUser().withUsername(username));

  let result;
  try {
    result = await sock.executeUSyncQuery(query);
  } catch (error) {
    throw dependencyError("WhatsApp username lookup failed.", error);
  }

  const match = result?.list?.find(
    (entry) => entry.contact === true && normalizeResolvedUserJid(entry.id),
  );
  if (!match) throw new AppError("WhatsApp username was not found.", 404);

  return {
    jid: normalizeResolvedUserJid(match.id),
    username: typeof match.username === "string" ? match.username : username,
  };
}

async function resolvePhoneJid(sock, jid) {
  let results;
  try {
    results = await sock.onWhatsApp(jid);
  } catch (error) {
    throw dependencyError("Unable to validate the WhatsApp recipient.", error);
  }

  const match = results?.find((entry) => entry.exists === true);
  if (!match) {
    throw new AppError("This recipient is not on WhatsApp.", 404);
  }
  return normalizeResolvedUserJid(match.jid) ?? jid;
}

async function enrichUserIdentity(sock, jid, username) {
  const normalizedJid = normalizeResolvedUserJid(jid);
  if (!normalizedJid) throw new AppError("Invalid WhatsApp recipient.", 400);

  let lid = null;
  let phoneNumber = null;
  if (isLidUser(normalizedJid) || isHostedLidUser(normalizedJid)) {
    lid = normalizedJid;
    try {
      phoneNumber = normalizeResolvedUserJid(
        await sock.signalRepository.lidMapping.getPNForLID(normalizedJid),
      );
    } catch (error) {
      logger.debug(
        { err: error, jid: normalizedJid },
        "LID reverse lookup failed",
      );
    }
  } else {
    phoneNumber = normalizedJid;
    try {
      lid = normalizeResolvedUserJid(
        await sock.signalRepository.lidMapping.getLIDForPN(normalizedJid),
      );
    } catch (error) {
      logger.debug({ err: error, jid: normalizedJid }, "LID lookup failed");
    }
  }

  const identity = {
    jid: lid ?? normalizedJid,
    lid,
    phoneNumber,
    username: username ?? null,
  };
  return identity;
}

async function resolveUserIdentifier(recipient, sock = getClient()) {
  if (recipient.type === "username") {
    const result = await lookupUsername(sock, recipient.username);
    return enrichUserIdentity(sock, result.jid, result.username);
  }

  const jid = recipient.jid;
  const phoneJid = isPnUser(jid) || isHostedPnUser(jid);
  const resolvedJid = phoneJid ? await resolvePhoneJid(sock, jid) : jid;
  return enrichUserIdentity(sock, resolvedJid);
}

function isNewsletterJid(jid) {
  return jid?.endsWith("@newsletter");
}

async function assertNewsletterAdmin(sock, jid, options) {
  const metadata = await fetchNewsletterMetadata(sock, "jid", jid);
  if (!metadata) throw new AppError("WhatsApp channel not found.", 404);

  if (
    options?.expectedHandle &&
    channelHandle(metadata) !== options.expectedHandle
  ) {
    throw new AppError(
      "Channel handle changed before the message could be sent.",
      409,
    );
  }

  const role = channelRole(metadata);
  if (!isPublisherRole(role)) {
    throw new AppError(
      "Forbidden. The connected WhatsApp account is not an admin or owner of this channel.",
      403,
    );
  }
  return { metadata, role };
}

/**
 * Mirrors Baileys' own stanza `mediatype` attribute. Baileys computes it for
 * every message but drops it on the newsletter branch, so channel media leaves
 * without the attribute WhatsApp uses to route and render it.
 */
function newsletterMediaTypeAttribute(message) {
  if (message?.imageMessage) return "image";
  if (message?.videoMessage) {
    return message.videoMessage.gifPlayback ? "gif" : "video";
  }
  if (message?.audioMessage) {
    return message.audioMessage.ptt ? "ptt" : "audio";
  }
  if (message?.stickerMessage) return "sticker";
  if (message?.documentMessage) return "document";
  return null;
}

async function performAuthorizedNewsletterSend(
  sock,
  jid,
  content,
  options,
  behavior,
) {
  await assertNewsletterAdmin(sock, jid, behavior);
  return sock.sendMessage(jid, content, options);
}

/**
 * Newsletter media cannot go through `sock.sendMessage`: that path relays the
 * stanza without the `mediatype` attribute. This builds the same message and
 * relays it with the attribute attached.
 */
async function performAuthorizedNewsletterMediaSend(
  sock,
  jid,
  content,
  behavior,
  upload = createNewsletterUpload(sock),
) {
  await assertNewsletterAdmin(sock, jid, behavior);

  const fullMessage = await generateWAMessage(jid, content, {
    userJid: sock.user?.id,
    upload,
    logger: sock.logger,
  });

  const mediatype = newsletterMediaTypeAttribute(fullMessage.message);
  await sock.relayMessage(jid, fullMessage.message, {
    messageId: fullMessage.key.id,
    additionalAttributes: mediatype ? { mediatype } : {},
  });

  return fullMessage;
}

const sendNewsletterMessage = (jid, text, behavior) =>
  enqueueSend(async () => {
    const sock = getClient();
    const result = await performAuthorizedNewsletterSend(
      sock,
      jid,
      { text },
      undefined,
      behavior,
    );
    logger.info(
      { jid, messageId: result?.key?.id },
      "Newsletter text message sent",
    );
    return result;
  });

const sendNewsletterMediaMessage = (
  jid,
  file,
  { caption, ptt, expectedHandle } = {},
) => {
  const content = buildMediaMessage(file, { caption, ptt });
  const mediaType = getMediaType(file.mimetype);

  return enqueueSend(async () => {
    const sock = getClient();
    await attachMediaMetadata(content, file, mediaType);
    const result = await performAuthorizedNewsletterMediaSend(
      sock,
      jid,
      content,
      { expectedHandle },
    );
    logger.info(
      {
        jid,
        messageId: result?.key?.id,
        mediaType,
        hasThumbnail: content.jpegThumbnail !== undefined,
      },
      "Newsletter media message sent",
    );
    return result;
  });
};

const sendMessage = (jid, text) => {
  if (isNewsletterJid(jid)) return sendNewsletterMessage(jid, text);

  return enqueueSend(async () => {
    const sock = getClient();
    const result = await sock.sendMessage(jid, { text });
    logger.info({ jid, messageId: result?.key?.id }, "Text message sent");
    return result;
  });
};

const sendMediaMessage = (jid, file, { caption, ptt } = {}) => {
  if (isNewsletterJid(jid)) {
    return sendNewsletterMediaMessage(jid, file, { caption, ptt });
  }
  const content = buildMediaMessage(file, { caption, ptt });
  const mediaType = getMediaType(file.mimetype);

  return enqueueSend(async () => {
    const sock = getClient();
    await attachMediaMetadata(content, file, mediaType);
    logger.info(
      {
        jid,
        mimetype: file.mimetype,
        size: file.size,
        mediaKeys: Object.keys(content),
        isNewsletter: false,
      },
      "Preparing media message",
    );

    const result = await sock.sendMessage(jid, content);

    logger.info(
      { jid, messageId: result?.key?.id, status: result?.status },
      "Media message sent",
    );
    return result;
  });
};

module.exports = {
  assertNewsletterAdmin,
  createNewsletterUpload,
  newsletterMediaTypeAttribute,
  performAuthorizedNewsletterMediaSend,
  fetchSubscribedChannels,
  getJidFromInvite,
  getNewsletterMetadata,
  getRoleInChannel,
  isNumberOnWhatsApp,
  lookupUsername,
  performAuthorizedNewsletterSend,
  resolveUserIdentifier,
  sendMessage,
  sendMediaMessage,
  sendNewsletterMediaMessage,
  sendNewsletterMessage,
};

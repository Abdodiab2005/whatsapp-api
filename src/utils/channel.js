const { normalizeUsername, validateNewsletterJid } = require("./validator");

const PUBLISHER_ROLES = new Set(["ADMIN", "OWNER"]);

function optionalText(value, maxLength = 2048) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : null;
}

/**
 * Newsletter text fields arrive either as plain strings or as
 * `{ text, id, update_time }` objects depending on the response shape.
 */
function nestedText(value, maxLength) {
  if (value && typeof value === "object") {
    return optionalText(value.text, maxLength);
  }
  return optionalText(value, maxLength);
}

function optionalInteger(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function threadMetadata(metadata) {
  const source = asObject(metadata);
  return asObject(source.thread_metadata ?? source.threadMetadata);
}

function channelRole(metadata) {
  const source = asObject(metadata);
  const viewer = asObject(source.viewer_metadata ?? source.viewerMetadata);
  const role = viewer.role ?? source.role;
  return typeof role === "string" && role.trim().length > 0
    ? role.trim().toUpperCase()
    : null;
}

function isPublisherRole(role) {
  return typeof role === "string" && PUBLISHER_ROLES.has(role.toUpperCase());
}

function channelHandle(metadata) {
  const source = asObject(metadata);
  const thread = threadMetadata(metadata);
  const raw = source.handle ?? thread.handle ?? source.username ?? "";
  const validation = normalizeUsername(
    typeof raw === "string" ? raw : "",
    "Channel handle",
  );
  return validation.isValid ? validation.username : null;
}

function channelPicture(metadata) {
  const source = asObject(metadata);
  const thread = threadMetadata(metadata);
  const picture = asObject(
    source.picture ?? thread.picture ?? thread.preview ?? source.preview,
  );
  return optionalText(
    picture.url ?? picture.directPath ?? picture.direct_path,
    2048,
  );
}

/**
 * Converts one raw newsletter object from WhatsApp into the shape the API
 * exposes. Returns `null` when the entry carries no usable newsletter JID so
 * malformed rows are skipped instead of crashing the listing.
 */
function normalizeChannel(metadata) {
  const source = asObject(metadata);
  const jidValidation = validateNewsletterJid(source.id ?? source.jid);
  if (!jidValidation.isValid) return null;

  const thread = threadMetadata(metadata);

  return {
    jid: jidValidation.jid,
    name:
      nestedText(source.name) ??
      nestedText(thread.name) ??
      nestedText(source.displayName),
    description:
      nestedText(source.description) ?? nestedText(thread.description),
    handle: channelHandle(metadata),
    invite: optionalText(source.invite ?? thread.invite, 256),
    role: channelRole(metadata),
    subscribers: optionalInteger(
      source.subscribers ?? thread.subscribers_count ?? thread.subscribersCount,
    ),
    verification: optionalText(source.verification ?? thread.verification, 32),
    picture: channelPicture(metadata),
  };
}

module.exports = {
  PUBLISHER_ROLES,
  channelHandle,
  channelPicture,
  channelRole,
  isPublisherRole,
  normalizeChannel,
};

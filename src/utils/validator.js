const { parsePhoneNumberFromString } = require("libphonenumber-js");

const MAX_MESSAGE_LENGTH = 65_536;
const MAX_CAPTION_LENGTH = 1024;
const NEWSLETTER_JID_PATTERN = /^\d{10,30}@newsletter$/;
const USER_JID_PATTERN = /^\d{5,30}@(s\.whatsapp\.net|lid|hosted|hosted\.lid)$/;
const LID_JID_PATTERN = /^\d{5,30}@(lid|hosted\.lid)$/;
const CHANNEL_INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{5,128}$/;
const CHANNEL_HOSTS = new Set(["whatsapp.com", "www.whatsapp.com"]);

function validatePhoneNumber(number) {
  if (typeof number !== "string" || number.length > 32) {
    return { isValid: false, error: "Invalid phone number format." };
  }

  try {
    const phone = parsePhoneNumberFromString(number.trim(), "EG");
    if (!phone?.isValid()) {
      return { isValid: false, error: "Invalid phone number format." };
    }

    return {
      isValid: true,
      jid: `${phone.countryCallingCode}${phone.nationalNumber}@s.whatsapp.net`,
    };
  } catch {
    return { isValid: false, error: "Invalid phone number format." };
  }
}

function validateRequiredText(value, label, maxLength = MAX_MESSAGE_LENGTH) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { isValid: false, error: `${label} is required.` };
  }
  if (value.length > maxLength) {
    return {
      isValid: false,
      error: `${label} must be at most ${maxLength} characters.`,
    };
  }
  return { isValid: true };
}

function validateOptionalText(value, label, maxLength) {
  if (value == null || value === "") return { isValid: true };
  if (typeof value !== "string") {
    return { isValid: false, error: `${label} must be a string.` };
  }
  if (value.length > maxLength) {
    return {
      isValid: false,
      error: `${label} must be at most ${maxLength} characters.`,
    };
  }
  return { isValid: true };
}

function parseOptionalBoolean(value, label) {
  if (value == null || value === "") {
    return { isValid: true, value: undefined };
  }
  if (value === true || value === "true") {
    return { isValid: true, value: true };
  }
  if (value === false || value === "false") {
    return { isValid: true, value: false };
  }
  return { isValid: false, error: `${label} must be true or false.` };
}

function validateNewsletterJid(jid) {
  const normalized = typeof jid === "string" ? jid.trim().toLowerCase() : "";
  return NEWSLETTER_JID_PATTERN.test(normalized)
    ? { isValid: true, jid: normalized }
    : { isValid: false, error: "Invalid newsletter JID." };
}

function validateUserJid(jid) {
  const normalized = typeof jid === "string" ? jid.trim().toLowerCase() : "";
  return USER_JID_PATTERN.test(normalized)
    ? { isValid: true, jid: normalized }
    : { isValid: false, error: "Invalid WhatsApp user JID." };
}

function validateLidJid(jid) {
  const validation = validateUserJid(jid);
  return validation.isValid && LID_JID_PATTERN.test(validation.jid)
    ? validation
    : { isValid: false, error: "Invalid WhatsApp LID." };
}

function normalizeUsername(username, label = "Username") {
  if (typeof username !== "string" || username.length > 65) {
    return { isValid: false, error: `${label} is invalid.` };
  }

  const normalized = username.trim().replace(/^@/, "");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters in a handle is the entire point of this check.
  const hasForbiddenCharacters = /[\u0000-\u001f\u007f\s@]/u.test(normalized);
  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    hasForbiddenCharacters
  ) {
    return { isValid: false, error: `${label} is invalid.` };
  }

  return { isValid: true, username: normalized.toLowerCase() };
}

function parseUserRecipient(input) {
  const supplied = ["number", "jid", "lid", "username"].filter(
    (key) => input?.[key] != null && input[key] !== "",
  );
  if (supplied.length !== 1) {
    return {
      isValid: false,
      error: "Provide exactly one of number, jid, lid, or username.",
    };
  }

  const type = supplied[0];
  if (type === "number") {
    const validation = validatePhoneNumber(input.number);
    return validation.isValid
      ? { isValid: true, recipient: { type, jid: validation.jid } }
      : validation;
  }

  if (type === "jid" || type === "lid") {
    const validation =
      type === "lid" ? validateLidJid(input.lid) : validateUserJid(input.jid);
    return validation.isValid
      ? { isValid: true, recipient: { type, jid: validation.jid } }
      : validation;
  }

  const validation = normalizeUsername(input.username);
  return validation.isValid
    ? {
        isValid: true,
        recipient: { type, username: validation.username },
      }
    : validation;
}

function parseChannelSelector(input) {
  const supplied = ["link", "jid", "handle"].filter(
    (key) => input?.[key] != null && input[key] !== "",
  );
  if (supplied.length !== 1) {
    return {
      isValid: false,
      error: "Provide exactly one of link, jid, or handle.",
    };
  }

  const type = supplied[0];
  if (type === "link") {
    const validation = parseChannelInviteCode(input.link);
    return validation.isValid
      ? {
          isValid: true,
          selector: { type, inviteCode: validation.inviteCode },
        }
      : validation;
  }
  if (type === "jid") {
    const validation = validateNewsletterJid(input.jid);
    return validation.isValid
      ? { isValid: true, selector: { type, jid: validation.jid } }
      : validation;
  }

  const validation = normalizeUsername(input.handle, "Channel handle");
  return validation.isValid
    ? {
        isValid: true,
        selector: { type, handle: validation.username },
      }
    : validation;
}

function parseChannelInviteCode(link) {
  if (typeof link !== "string" || link.length > 2048) {
    return { isValid: false, error: "Invalid WhatsApp channel invite link." };
  }

  try {
    const url = new URL(link);
    const segments = url.pathname.split("/").filter(Boolean);
    const code = segments[1];
    const valid =
      url.protocol === "https:" &&
      CHANNEL_HOSTS.has(url.hostname.toLowerCase()) &&
      segments.length === 2 &&
      segments[0] === "channel" &&
      CHANNEL_INVITE_CODE_PATTERN.test(code);

    return valid
      ? { isValid: true, inviteCode: code }
      : { isValid: false, error: "Invalid WhatsApp channel invite link." };
  } catch {
    return { isValid: false, error: "Invalid WhatsApp channel invite link." };
  }
}

module.exports = {
  MAX_CAPTION_LENGTH,
  MAX_MESSAGE_LENGTH,
  normalizeUsername,
  parseChannelSelector,
  parseChannelInviteCode,
  parseOptionalBoolean,
  parseUserRecipient,
  validateLidJid,
  validateNewsletterJid,
  validateOptionalText,
  validatePhoneNumber,
  validateRequiredText,
  validateUserJid,
};

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseChannelSelector,
  parseChannelInviteCode,
  parseOptionalBoolean,
  parseUserRecipient,
  validateLidJid,
  validateNewsletterJid,
  validatePhoneNumber,
  validateRequiredText,
} = require("../src/utils/validator");

test("phone number validation accepts strings and rejects non-strings", () => {
  assert.equal(validatePhoneNumber("+201001234567").isValid, true);
  assert.equal(validatePhoneNumber({ $ne: null }).isValid, false);
  assert.equal(validatePhoneNumber("x".repeat(100)).isValid, false);
});

test("channel links are restricted to WhatsApp channel invites", () => {
  const valid = parseChannelInviteCode(
    "https://whatsapp.com/channel/AbCdEf12345",
  );
  assert.deepEqual(valid, { isValid: true, inviteCode: "AbCdEf12345" });
  assert.equal(
    parseChannelInviteCode("https://example.com/channel/AbCdEf12345").isValid,
    false,
  );
  assert.equal(parseChannelInviteCode("not-a-url").isValid, false);
});

test("newsletter JIDs and request scalars are strictly validated", () => {
  assert.equal(
    validateNewsletterJid("120363123456789012@newsletter").isValid,
    true,
  );
  assert.equal(validateNewsletterJid("123@s.whatsapp.net").isValid, false);
  assert.equal(
    validateRequiredText({ text: "hello" }, "Message").isValid,
    false,
  );
  assert.deepEqual(parseOptionalBoolean("true", "ptt"), {
    isValid: true,
    value: true,
  });
  assert.equal(parseOptionalBoolean("yes", "ptt").isValid, false);
});

test("user recipients accept exactly one number, JID, LID, or username", () => {
  assert.deepEqual(parseUserRecipient({ lid: "123456789012345@lid" }), {
    isValid: true,
    recipient: { type: "lid", jid: "123456789012345@lid" },
  });
  assert.deepEqual(parseUserRecipient({ username: "@Alice.Name" }), {
    isValid: true,
    recipient: { type: "username", username: "alice.name" },
  });
  assert.equal(
    parseUserRecipient({ number: "+201001234567", username: "alice" }).isValid,
    false,
  );
  assert.equal(validateLidJid("201001234567@s.whatsapp.net").isValid, false);
});

test("channel selectors accept a link, newsletter JID, or handle", () => {
  assert.deepEqual(parseChannelSelector({ handle: "@Example.Channel" }), {
    isValid: true,
    selector: { type: "handle", handle: "example.channel" },
  });
  assert.equal(
    parseChannelSelector({
      jid: "120363123456789012@newsletter",
      handle: "example.channel",
    }).isValid,
    false,
  );
});

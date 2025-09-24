// utils/validator.js
const { parsePhoneNumberFromString } = require("libphonenumber-js");

/**
 * Validates a phone number and converts it to a JID.
 * @param {string} number The phone number to validate.
 * @returns {{isValid: boolean, jid?: string, error?: string}}
 */
function validatePhoneNumber(number) {
  try {
    // Assuming 'EG' as the default country, change if needed.
    const phone = parsePhoneNumberFromString(number, "EG");

    if (phone && phone.isValid()) {
      const jid = `${phone.countryCallingCode}${phone.nationalNumber}@s.whatsapp.net`;
      return { isValid: true, jid };
    }

    return { isValid: false, error: "Invalid phone number format." };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

module.exports = { validatePhoneNumber };

const crypto = require("node:crypto");
const AppError = require("../utils/AppError");

const digest = (value) =>
  crypto.createHash("sha256").update(String(value)).digest();

/**
 * Middleware to authenticate requests using a static API key.
 * It checks for an 'x-api-key' header and validates it against
 * the key stored in the environment variables.
 *
 * Hashes both values to a fixed width before constant-time comparison.
 */
const authenticateApiKey = (req, _res, next) => {
  const apiKey = req.header("x-api-key");
  const expectedApiKey = process.env.API_KEY;

  // Check for API_KEY header
  if (!apiKey) {
    return next(new AppError("Unauthorized: API key is missing.", 401));
  }

  const provided = digest(apiKey);
  const expected = digest(expectedApiKey ?? "");
  const isValid =
    Boolean(expectedApiKey) && crypto.timingSafeEqual(provided, expected);

  if (!isValid) {
    return next(new AppError("Unauthorized: Invalid API key.", 401));
  }

  next();
};

module.exports = { authenticateApiKey };

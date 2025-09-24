const { errorResponse } = require("../utils/responseHandler");

/**
 * Middleware to authenticate requests using a static API key.
 * It checks for an 'x-api-key' header and validates it against
 * the key stored in the environment variables.
 */
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.header("x-api-key");

  const expectedApiKey = process.env.API_KEY;

  // Check for API_KEY header
  if (!apiKey) {
    return errorResponse(res, "Unauthorized: API key is missing.", 401);
  }

  // Check if the API key is valid
  if (apiKey !== expectedApiKey) {
    console.log(`API_KEY from env:\n${expectedApiKey} amnd current: ${apiKey}`);
    return errorResponse(res, "Unauthorized: Invalid API key.", 401);
  }

  next();
};

module.exports = { authenticateApiKey };

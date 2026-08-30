const logger = require("../utils/logger");

// Arity 4 is what marks this as an Express error handler; `_next` must stay.
const globalErrorHandler = (err, req, res, _next) => {
  if (err.idempotencyStatus) {
    res.set("Idempotency-Status", err.idempotencyStatus);
  }
  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500;
  const invalidJson = err instanceof SyntaxError && err.status === 400;
  const isOperational = err.isOperational === true;

  if (statusCode >= 500 && !isOperational) {
    logger.error(
      { err, method: req.method, path: req.originalUrl },
      "Request failed",
    );
  } else if (statusCode >= 500) {
    logger.warn(
      { method: req.method, path: req.originalUrl, statusCode },
      "Request rejected",
    );
  }

  const safeMessage = invalidJson
    ? "Invalid JSON body."
    : isOperational
      ? err.message
      : "Internal server error";

  return res.status(statusCode).json({
    success: false,
    error: safeMessage,
    statusCode,
    message: safeMessage,
  });
};

module.exports = globalErrorHandler;

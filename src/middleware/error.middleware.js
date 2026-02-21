const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.statusCode === 500) {
    logger.error(err);
  }

  res.status(err.statusCode).json({
    success: false,
    error: err.message,
    statusCode: err.statusCode,
    message: err.isOperational ? err.message : "Internal server error",
  });
};

module.exports = globalErrorHandler;

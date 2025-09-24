const successResponse = (res, data, statusCode, message) => {
  return res.status(statusCode).json({
    success: true,
    data,
    statusCode,
    message,
  });
};

const errorResponse = (res, error, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    error,
    statusCode,
    message,
  });
};

module.exports = { successResponse, errorResponse };

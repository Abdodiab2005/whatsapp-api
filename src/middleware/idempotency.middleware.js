const AppError = require("../utils/AppError");
const { validateIdempotencyKey } = require("../utils/idempotency");

function requireIdempotencyKey(req, _res, next) {
  const key = req.get("idempotency-key");
  if (!validateIdempotencyKey(key)) {
    return next(
      new AppError(
        "Idempotency-Key must be 8-128 letters, numbers, dots, colons, underscores, or hyphens.",
        400,
      ),
    );
  }

  req.idempotencyKey = key;
  return next();
}

module.exports = { requireIdempotencyKey };

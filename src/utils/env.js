/**
 * Boot-time configuration parsing.
 *
 * Every reader here fails loudly. A mistyped value must stop the process at
 * startup rather than silently becoming the default: an operator who sets
 * MAX_PENDING_SENDS=50s and gets 25 has no way to discover that their capacity
 * planning is wrong, and an operator who sets LOG_LEVEL=verbose would lose the
 * debug output they asked for.
 *
 * This module must not require the logger — the logger reads its own level
 * through here.
 */

function readInteger(environment, name, fallback, { min, max }) {
  const value = environment[name];
  if (value == null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function readEnum(environment, name, fallback, allowed) {
  const value = environment[name];
  if (value == null || value === "") return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error(
      `${name} must be one of: ${[...allowed].sort().join(", ")}.`,
    );
  }
  return normalized;
}

module.exports = { readEnum, readInteger };

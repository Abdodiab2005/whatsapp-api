const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const defaultEnvPath = path.join(__dirname, "..", ".env");

function ensureApiKey(envPath = defaultEnvPath) {
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const existingApiKey = dotenv.parse(content).API_KEY;
  if (existingApiKey) {
    fs.chmodSync(envPath, 0o600);
    return existingApiKey;
  }

  const newApiKey = crypto.randomBytes(32).toString("hex");
  const lines = content
    .split(/\r?\n/)
    .filter((line) => !/^\s*API_KEY\s*=/.test(line));
  while (lines.at(-1) === "") lines.pop();
  lines.push(`API_KEY=${newApiKey}`);

  const temporaryPath = `${envPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${lines.join("\n")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, envPath);
    fs.chmodSync(envPath, 0o600);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }

  return newApiKey;
}

module.exports = { ensureApiKey };

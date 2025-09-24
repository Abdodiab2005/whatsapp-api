// scripts/seedApiKey.js (The new, better version)
const fs = require("fs");
const crypto = require("crypto");

const newApiKey = crypto.randomBytes(32).toString("hex");
fs.appendFileSync(".env", `\nAPI_KEY=${newApiKey}\n`);

// The most important change is here 👇
module.exports = newApiKey;

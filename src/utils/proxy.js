const http = require("node:http");

function parseBooleanFlag(value, name, fallback = false) {
  if (value == null || value === "") return fallback;
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function getProxyValue(environment, uppercaseName, lowercaseName) {
  return environment[lowercaseName] || environment[uppercaseName] || undefined;
}

function validateProxyUrl(value, name) {
  if (!value) return;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP or HTTPS proxy URL.`);
  }

  if (
    !url.hostname ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) {
    throw new Error(`${name} must be a valid HTTP or HTTPS proxy URL.`);
  }
}

function configureOutboundProxy(
  environment = process.env,
  setGlobalProxy = http.setGlobalProxyFromEnv,
) {
  const enabled = parseBooleanFlag(environment.USE_ENV_PROXY, "USE_ENV_PROXY");
  if (!enabled) return { enabled: false };

  if (typeof setGlobalProxy !== "function") {
    throw new Error(
      "USE_ENV_PROXY requires a Node.js 24 release with setGlobalProxyFromEnv support.",
    );
  }

  const httpProxy = getProxyValue(environment, "HTTP_PROXY", "http_proxy");
  const httpsProxy = getProxyValue(environment, "HTTPS_PROXY", "https_proxy");
  const noProxy =
    getProxyValue(environment, "NO_PROXY", "no_proxy") || "localhost,127.0.0.1";

  if (!httpProxy && !httpsProxy) {
    throw new Error("USE_ENV_PROXY=true requires HTTP_PROXY or HTTPS_PROXY.");
  }

  validateProxyUrl(httpProxy, "HTTP_PROXY");
  validateProxyUrl(httpsProxy, "HTTPS_PROXY");
  if (noProxy && (noProxy.length > 4096 || /[\r\n]/.test(noProxy))) {
    throw new Error("NO_PROXY is invalid or too long.");
  }

  setGlobalProxy({
    ...(httpProxy ? { HTTP_PROXY: httpProxy } : {}),
    ...(httpsProxy ? { HTTPS_PROXY: httpsProxy } : {}),
    ...(noProxy ? { NO_PROXY: noProxy } : {}),
  });

  return { enabled: true };
}

function parseTrustProxy(value) {
  if (value == null || value === "") return false;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  if (normalized === "true") {
    throw new Error(
      "TRUST_PROXY=true is unsafe; use an explicit hop count or trusted address list.",
    );
  }

  if (/^\d+$/.test(normalized)) {
    const hops = Number(normalized);
    if (hops < 1 || hops > 32) {
      throw new Error("TRUST_PROXY hop count must be between 1 and 32.");
    }
    return hops;
  }

  if (value.length > 2048 || /[\r\n]/.test(value)) {
    throw new Error("TRUST_PROXY is invalid or too long.");
  }

  const addresses = value.split(",").map((address) => address.trim());
  if (addresses.some((address) => address.length === 0)) {
    throw new Error("TRUST_PROXY contains an empty address.");
  }

  return addresses;
}

module.exports = {
  configureOutboundProxy,
  parseBooleanFlag,
  parseTrustProxy,
};

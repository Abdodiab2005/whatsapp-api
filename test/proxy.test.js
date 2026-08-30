const assert = require("node:assert/strict");
const test = require("node:test");
const {
  configureOutboundProxy,
  parseTrustProxy,
} = require("../src/utils/proxy");

test("trust proxy requires an explicit topology", () => {
  assert.equal(parseTrustProxy(""), false);
  assert.equal(parseTrustProxy("1"), 1);
  assert.deepEqual(parseTrustProxy("loopback, 10.0.0.0/8"), [
    "loopback",
    "10.0.0.0/8",
  ]);
  assert.throws(() => parseTrustProxy("true"), /unsafe/);
});

test("outbound proxy support is opt-in and validates proxy URLs", () => {
  let configured;
  assert.deepEqual(
    configureOutboundProxy({}, () => assert.fail()),
    {
      enabled: false,
    },
  );

  const result = configureOutboundProxy(
    {
      USE_ENV_PROXY: "true",
      HTTPS_PROXY: "http://proxy.example.com:8080",
      NO_PROXY: "localhost,127.0.0.1",
    },
    (proxyEnvironment) => {
      configured = proxyEnvironment;
    },
  );

  assert.deepEqual(result, { enabled: true });
  assert.deepEqual(configured, {
    HTTPS_PROXY: "http://proxy.example.com:8080",
    NO_PROXY: "localhost,127.0.0.1",
  });
  assert.throws(
    () =>
      configureOutboundProxy(
        { USE_ENV_PROXY: "true", HTTPS_PROXY: "socks5://proxy:1080" },
        () => assert.fail(),
      ),
    /HTTP or HTTPS proxy URL/,
  );

  configureOutboundProxy(
    { USE_ENV_PROXY: "true", HTTPS_PROXY: "http://proxy.example.com:8080" },
    (proxyEnvironment) => {
      assert.equal(proxyEnvironment.NO_PROXY, "localhost,127.0.0.1");
    },
  );
});

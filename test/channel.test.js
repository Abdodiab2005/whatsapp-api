const assert = require("node:assert/strict");
const test = require("node:test");

process.env.API_KEY = "test-api-key";

const whatsappService = require("../src/services/whatsapp.service");
const channelService = require("../src/services/channel.service");
const { normalizeChannel } = require("../src/utils/channel");
const { app } = require("../index");

const ADMIN_JID = "120363000000000001@newsletter";
const OWNER_JID = "120363000000000002@newsletter";
const SUBSCRIBER_JID = "120363000000000003@newsletter";

function subscribedChannel(jid, role, overrides = {}) {
  const suffix = jid.split("@")[0].slice(-3);
  return {
    id: jid,
    state: { type: "ACTIVE" },
    thread_metadata: {
      name: { text: `Channel ${suffix}` },
      description: { text: "Sample description" },
      handle: `channel.${suffix}`,
      invite: "InViTeCoDe",
      subscribers_count: "123",
      verification: "VERIFIED",
      picture: { direct_path: "/v/t61/picture.jpg" },
    },
    ...(role === null ? {} : { viewer_metadata: { mute: "OFF", role } }),
    ...overrides,
  };
}

/** Replaces the live WMex fetch for the duration of one test. */
function stubSubscribed(t, value) {
  const original = whatsappService.fetchSubscribedChannels;
  whatsappService.fetchSubscribedChannels =
    typeof value === "function" ? value : async () => value;
  t.after(() => {
    whatsappService.fetchSubscribedChannels = original;
  });
}

/** Minimal socket whose `query` answers with a WMex `result` node. */
function mexSocket(payload, { throwOn } = {}) {
  const tags = [];
  return {
    tags,
    generateMessageTag: () => {
      const tag = `tag-${tags.length + 1}`;
      tags.push(tag);
      return tag;
    },
    query: async (node) => {
      if (throwOn) throw throwOn;
      tags.push(node);
      return {
        tag: "iq",
        attrs: {},
        content: [
          {
            tag: "result",
            attrs: {},
            content: Buffer.from(JSON.stringify(payload), "utf-8"),
          },
        ],
      };
    },
  };
}

test("only ADMIN and OWNER subscriptions are returned", async (t) => {
  stubSubscribed(t, [
    subscribedChannel(ADMIN_JID, "ADMIN"),
    subscribedChannel(SUBSCRIBER_JID, "SUBSCRIBER"),
    subscribedChannel(OWNER_JID, "OWNER"),
  ]);

  const result = await channelService.fetchChannels({ limit: 50, offset: 0 });

  assert.equal(result.total, 2);
  assert.deepEqual(
    result.channels.map((channel) => channel.jid),
    [ADMIN_JID, OWNER_JID],
  );
  assert.deepEqual(result.channels[0], {
    jid: ADMIN_JID,
    name: "Channel 001",
    description: "Sample description",
    handle: "channel.001",
    invite: "InViTeCoDe",
    role: "ADMIN",
    subscribers: 123,
    verification: "VERIFIED",
    picture: "/v/t61/picture.jpg",
  });
});

test("channels without viewer metadata or with unknown roles are excluded", async (t) => {
  stubSubscribed(t, [
    subscribedChannel(ADMIN_JID, null),
    subscribedChannel(OWNER_JID, "GUEST"),
    { id: SUBSCRIBER_JID, viewer_metadata: {} },
    { id: "120363000000000004@newsletter", viewer_metadata: { role: "" } },
    {
      thread_metadata: { name: { text: "No JID" } },
      viewer_metadata: { role: "OWNER" },
    },
  ]);

  const result = await channelService.fetchChannels({ limit: 50, offset: 0 });

  assert.equal(result.total, 0);
  assert.deepEqual(result.channels, []);
});

test("an empty subscription list is a successful empty response", async (t) => {
  stubSubscribed(t, []);

  const result = await channelService.fetchChannels({ limit: 50, offset: 0 });

  assert.deepEqual(result, { channels: [], total: 0 });
});

test("malformed optional newsletter metadata does not crash normalization", async (t) => {
  stubSubscribed(t, [
    {
      id: ADMIN_JID,
      name: 12345,
      thread_metadata: "not-an-object",
      viewer_metadata: { role: "owner" },
      picture: [],
      subscribers: "not-a-number",
      handle: { nope: true },
      invite: 42,
    },
  ]);

  const result = await channelService.fetchChannels({ limit: 50, offset: 0 });

  assert.equal(result.total, 1);
  assert.deepEqual(result.channels[0], {
    jid: ADMIN_JID,
    name: null,
    description: null,
    handle: null,
    invite: null,
    role: "OWNER",
    subscribers: null,
    verification: null,
    picture: null,
  });

  assert.equal(normalizeChannel(undefined), null);
  assert.equal(normalizeChannel("nonsense"), null);
  assert.equal(normalizeChannel({ id: "not-a-newsletter-jid" }), null);
});

test("limit and offset paginate the authorized channels only", async (t) => {
  const publishable = [
    "120363000000000011@newsletter",
    "120363000000000012@newsletter",
    "120363000000000013@newsletter",
  ];
  stubSubscribed(t, [
    subscribedChannel(publishable[0], "ADMIN"),
    subscribedChannel(SUBSCRIBER_JID, "SUBSCRIBER"),
    subscribedChannel(publishable[1], "OWNER"),
    subscribedChannel("120363000000000014@newsletter", "SUBSCRIBER"),
    subscribedChannel(publishable[2], "ADMIN"),
  ]);

  const page = await channelService.fetchChannels({ limit: 2, offset: 1 });
  assert.equal(page.total, 3);
  assert.deepEqual(
    page.channels.map((channel) => channel.jid),
    [publishable[1], publishable[2]],
  );

  const beyondEnd = await channelService.fetchChannels({
    limit: 2,
    offset: 10,
  });
  assert.equal(beyondEnd.total, 3);
  assert.deepEqual(beyondEnd.channels, []);
});

test("the subscribed-newsletters WMex query uses the documented query id", async () => {
  const socket = mexSocket({
    data: {
      xwa2_newsletter_subscribed: [subscribedChannel(ADMIN_JID, "ADMIN")],
    },
  });

  const channels = await whatsappService.fetchSubscribedChannels(socket);

  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, ADMIN_JID);

  const node = socket.tags.find((entry) => entry?.tag === "iq");
  assert.equal(node.attrs.xmlns, "w:mex");
  assert.equal(node.attrs.type, "get");
  const query = node.content[0];
  assert.equal(query.attrs.query_id, "6388546374527196");
  assert.deepEqual(JSON.parse(query.content.toString()), { variables: {} });
});

test("a raw WMex failure surfaces an explicit API error and never falls back", async () => {
  const transportFailure = mexSocket(null, {
    throwOn: new Error("socket timed out"),
  });
  await assert.rejects(
    whatsappService.fetchSubscribedChannels(transportFailure),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(
        error.message,
        "Unable to fetch the subscribed WhatsApp channels.",
      );
      return true;
    },
  );

  const graphqlFailure = mexSocket({
    errors: [{ message: "server error", extensions: { error_code: 500 } }],
  });
  await assert.rejects(
    whatsappService.fetchSubscribedChannels(graphqlFailure),
    (error) => error.statusCode === 502,
  );

  const malformed = mexSocket({
    data: { xwa2_newsletter_subscribed: "not-a-list" },
  });
  await assert.rejects(
    whatsappService.fetchSubscribedChannels(malformed),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.equal(
        error.message,
        "WhatsApp returned a malformed subscribed channel list.",
      );
      return true;
    },
  );
});

test("channel sends re-check the live role immediately before delivery", async () => {
  const events = [];
  const socket = {
    newsletterMetadata: async (type, key) => {
      events.push(`metadata:${type}:${key}`);
      return { id: ADMIN_JID, viewer_metadata: { role: "ADMIN" } };
    },
    sendMessage: async () => {
      events.push("send");
      return { key: { id: "message-1" } };
    },
  };

  await whatsappService.performAuthorizedNewsletterSend(socket, ADMIN_JID, {
    text: "hello",
  });

  assert.deepEqual(events, [`metadata:jid:${ADMIN_JID}`, "send"]);
});

test("a role downgraded after listing rejects the send with 403", async (t) => {
  stubSubscribed(t, [subscribedChannel(ADMIN_JID, "ADMIN")]);

  const listed = await channelService.listPublishableChannels();
  assert.deepEqual(
    listed.map((channel) => channel.jid),
    [ADMIN_JID],
  );

  let sends = 0;
  const socket = {
    newsletterMetadata: async () => ({
      id: ADMIN_JID,
      viewer_metadata: { role: "SUBSCRIBER" },
    }),
    sendMessage: async () => {
      sends += 1;
      return { key: { id: "must-not-happen" } };
    },
  };

  await assert.rejects(
    whatsappService.performAuthorizedNewsletterSend(socket, ADMIN_JID, {
      text: "blocked",
    }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.match(error.message, /not an admin or owner/);
      return true;
    },
  );
  assert.equal(sends, 0);
});

test("LID resolution is unaffected by the live channel listing", async () => {
  const socket = {
    onWhatsApp: async () => [
      { exists: true, jid: "201001234567@s.whatsapp.net" },
    ],
    signalRepository: {
      lidMapping: {
        getLIDForPN: async () => "123456789012345@lid",
      },
    },
  };

  const identity = await whatsappService.resolveUserIdentifier(
    { type: "number", jid: "201001234567@s.whatsapp.net" },
    socket,
  );

  assert.deepEqual(identity, {
    jid: "123456789012345@lid",
    lid: "123456789012345@lid",
    phoneNumber: "201001234567@s.whatsapp.net",
    username: null,
  });
});

test("GET /channel reports the disconnected socket instead of stale data", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(
    `http://127.0.0.1:${port}/channel?limit=50&offset=0`,
    { headers: { "x-api-key": "test-api-key" } },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.message, "WhatsApp client is not connected yet.");
});

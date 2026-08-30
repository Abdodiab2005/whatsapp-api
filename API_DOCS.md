# WhatsApp API — Documentation

REST API for sending text messages, images, videos, and voice notes via WhatsApp.  
Built with **Node.js 24**, **Express**, and **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) 7.0.0-rc14**.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Health](#health)
  - [Private Chat](#private-chat)
  - [Channel (Newsletter)](#channel-newsletter)
- [Media Support](#media-support)
- [Error Handling](#error-handling)
- [Project Structure](#project-structure)

---

## Getting Started

### Prerequisites

- **Node.js** 24.x (uses the built-in `node:sqlite` module)
- The npm version bundled with Node.js 24

### Installation

```bash
npm ci
```

### Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

On the **first run**, a QR code will be displayed in the terminal.  
Scan it with your WhatsApp mobile app to link the server to your account.

### Environment Variables

| Variable            | Description                                  | Default                     |
| ------------------- | -------------------------------------------- | --------------------------- |
| `API_KEY`           | Static key for API authentication            | Auto-generated on first run |
| `PORT`              | Server listening port                        | `3000`                      |
| `TRUST_PROXY`       | Trusted proxy hop count or address list      | unset                       |
| `USE_ENV_PROXY`     | Enable standard outbound proxy environment   | `false`                     |
| `HTTP_PROXY`        | Outbound HTTP proxy URL                       | unset                       |
| `HTTPS_PROXY`       | Outbound HTTPS/WebSocket proxy URL            | unset                       |
| `NO_PROXY`          | Outbound proxy bypass list                    | `localhost,127.0.0.1`       |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window                         | `60000`                     |
| `RATE_LIMIT_IP_MAX` | Requests per client IP per window             | `120`                       |
| `RATE_LIMIT_API_MAX`| Authenticated requests per window             | `60`                        |
| `RATE_LIMIT_MEDIA_MAX` | Media uploads per client IP per window     | `10`                        |
| `RATE_LIMIT_MAX_KEYS` | Maximum client IP buckets retained          | `10000`                     |
| `SEND_INTERVAL_MS`  | Delay between outbound send starts           | `1000`                      |
| `MAX_PENDING_SENDS` | Maximum running/queued outbound sends        | `25`                        |
| `IDEMPOTENCY_TTL_HOURS` | Persisted send outcome retention         | `168`                       |
| `LOG_LEVEL`         | Pino log level                               | `info`                      |
| `LOG_FILE`          | Optional file destination (rotate externally)| unset                       |

A `.env` file is created automatically with the generated `API_KEY`.

Every variable is parsed and range-checked when the process starts. An invalid
value stops the server immediately with a message naming the variable — for
example `MAX_PENDING_SENDS must be an integer between 1 and 1000.` — instead of
silently falling back to the default.

---

## Authentication

All endpoints (except `GET /`) require an API key in the request header:

```
x-api-key: YOUR_API_KEY
```

Requests without a valid key receive a `401 Unauthorized` response.

---

## Idempotent Sends

`POST /send`, `POST /send-media`, `POST /channel/send`, and `POST /channel/send-media` require:

```
Idempotency-Key: 018f47d2-93c1-7d11-a7f2-acde48001122
```

- Generate a new 8-128 character key for each intended message.
- Retry the exact request with the same key. A completed response is replayed with `Idempotency-Status: replayed`.
- Reusing a key with a changed recipient, content, options, or file returns `409 Conflict`.
- The first attempt returns `Idempotency-Status: created` and includes the Baileys `messageId` when available.
- A pre-send `429` queue rejection or `503` disconnected response releases the claim (`Idempotency-Status: released`), so the exact request can safely retry with the same key.
- Claims, failures, and responses persist in `session/idempotency.db`. If a restart interrupts an in-progress send, its outcome is reported as unknown and is not automatically resent.
- Do not switch to a new key after a failed or unknown send until delivery has been checked; a late upstream acknowledgement could otherwise make the new request a duplicate.

Registration, recipient resolution, channel listing, and channel metadata endpoints are read-only and are already safe to repeat without this header.

### Proxy Deployment

For one nginx instance directly in front of the app, set `TRUST_PROXY=1`. Leave it unset when the app is directly reachable. `TRUST_PROXY=true` is rejected because clients could forge their IP and bypass IP rate limits.

To proxy outbound Baileys WebSocket, fetch, and media traffic, set `USE_ENV_PROXY=true` plus `HTTPS_PROXY` (and optionally `HTTP_PROXY` and `NO_PROXY`). Only use a proxy you trust.

---

## API Endpoints

### Health

Both health routes are unauthenticated and rate-limited per IP so a load balancer, container runtime, or uptime probe can poll them without holding the API key.

```
GET /
```

Returns the plain-text banner `WhatsApp API Server is running!` with status `200` whenever the HTTP process is alive.

```
GET /healthz
```

Returns `200` when the WhatsApp socket is connected and `503` when it is not, so a probe can distinguish "process up" from "actually able to send". The body carries no credential, session, or account detail.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "whatsapp": "connected",
    "reconnectScheduled": false,
    "uptimeSeconds": 3641
  },
  "statusCode": 200,
  "message": "WhatsApp client is connected."
}
```

---

### Private Chat

Private send and resolution endpoints accept exactly one recipient identifier:

| Field      | Description |
| ---------- | ----------- |
| `number`   | International or locally parseable phone number, such as `+201234567890` |
| `jid`      | Bare WhatsApp user JID ending in `@s.whatsapp.net`, `@lid`, `@hosted`, or `@hosted.lid` |
| `lid`      | Bare `@lid` or `@hosted.lid` identifier |
| `username` | WhatsApp username, with or without the leading `@` |

Do not send more than one identifier. Phone numbers are checked with WhatsApp before sending. Known phone-number recipients are upgraded to their current LID through Baileys' persisted LID mapping. Username lookup is performed live through rc14's USync protocol and returns `404` when WhatsApp does not expose the username to the linked account; stale username mappings are never used for delivery.

#### Resolve Recipient

```
POST /resolve-recipient
```

**Body** (`application/json`), using exactly one identifier:

```json
{ "username": "@example.user" }
```

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "jid": "123456789012345@lid",
    "lid": "123456789012345@lid",
    "phoneNumber": "201234567890@s.whatsapp.net",
    "username": "example.user"
  },
  "statusCode": 200,
  "message": "Recipient resolved successfully."
}
```

`phoneNumber` can be `null` when WhatsApp has not provided the reverse LID mapping.

#### Check WhatsApp Registration

```
POST /isOnWhatsApp
```

This legacy registration check accepts phone numbers only. Use `/resolve-recipient` for JIDs, LIDs, and usernames.

**Body** (`application/json`):

| Field    | Type   | Required | Description                         |
| -------- | ------ | -------- | ----------------------------------- |
| `number` | string | ✅       | Phone number (e.g. `+201234567890`) |

**Response** (`200`):

```json
{
  "success": true,
  "data": { "isOnWhatsApp": true },
  "statusCode": 200,
  "message": "Number exists on WhatsApp."
}
```

---

#### Send Text Message

```
POST /send
```

**Body** (`application/json`):

| Field      | Type   | Required | Description |
| ---------- | ------ | -------- | ----------- |
| `number`   | string | conditional | Phone number |
| `jid`      | string | conditional | User PN JID or LID |
| `lid`      | string | conditional | User LID |
| `username` | string | conditional | WhatsApp username |
| `message`  | string | ✅ | Text content |

Exactly one conditional recipient field is required.

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "message": "Message sent successfully.",
    "messageId": "3EB0...",
    "recipient": {
      "jid": "123456789012345@lid",
      "lid": "123456789012345@lid",
      "phoneNumber": "201234567890@s.whatsapp.net",
      "username": null
    }
  },
  "statusCode": 200,
  "message": "Message sent successfully."
}
```

---

#### Send Media (Image / Video / Audio)

```
POST /send-media
```

**Body** (`multipart/form-data`):

| Field      | Type    | Required | Description |
| ---------- | ------- | -------- | ----------- |
| `number`   | string  | conditional | Phone number |
| `jid`      | string  | conditional | User PN JID or LID |
| `lid`      | string  | conditional | User LID |
| `username` | string  | conditional | WhatsApp username |
| `file`     | file    | ✅ | Media file (image, video, or audio, max 64 MB) |
| `caption`  | string  | ❌ | Caption for image/video (ignored for audio) |
| `ptt`      | boolean | ❌ | Force voice note on/off (see [PTT Behavior](#ptt-behavior-voice-notes)) |

Exactly one conditional recipient field is required.

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "message": "Media sent successfully.",
    "messageId": "3EB0...",
    "recipient": {
      "jid": "123456789012345@lid",
      "lid": "123456789012345@lid",
      "phoneNumber": "201234567890@s.whatsapp.net",
      "username": null
    }
  },
  "statusCode": 200,
  "message": "Media sent successfully."
}
```

**Examples** (`curl`):

```bash
# Send an image with caption
curl -X POST http://localhost:3000/send-media \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Idempotency-Key: image-018f47d2-93c1-7d11" \
  -F "number=+201234567890" \
  -F "file=@/path/to/photo.jpg" \
  -F "caption=Check this out!"

# Send an OGG Opus file as a voice note
curl -X POST http://localhost:3000/send-media \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Idempotency-Key: voice-018f47d2-93c1-7d11" \
  -F "number=+201234567890" \
  -F "file=@/path/to/voice-note.ogg" \
  -F "ptt=true"
```

---

### Channel (Newsletter)

All channel endpoints are prefixed with `/channel`.

#### Fetch Publishable Channels

```
GET /channel?limit=50&offset=0
```

Returns the **live** list of channels the connected WhatsApp account can publish to. Every request queries WhatsApp directly for the account's subscribed newsletters (WMex query `6388546374527196`, response path `xwa2_newsletter_subscribed`) and keeps only the channels whose current `viewer_metadata.role` is `ADMIN` or `OWNER`.

Nothing is served from a local catalog, history sync, incoming events, or previous lookups. A freshly linked session can call this endpoint immediately and receive its ADMIN/OWNER channels. If the live query fails, the endpoint returns an error rather than stale data.

`SUBSCRIBER`, `GUEST`, missing, and unrecognized roles are excluded. `limit` and `offset` paginate the filtered list, and `total` counts the ADMIN/OWNER channels only — not every subscription.

**Query parameters**:

| Name     | Type    | Default | Range       | Description |
| -------- | ------- | ------- | ----------- | ----------- |
| `limit`  | integer | `50`    | 1-100       | Page size applied after the ADMIN/OWNER filter |
| `offset` | integer | `0`     | 0-1000000   | Number of authorized channels to skip |

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "jid": "120363XXXXXXXXXX@newsletter",
        "name": "Example channel",
        "description": "What this channel posts",
        "handle": "example.channel",
        "invite": "XXXXXXXXXXXXXXXXXXXXXX",
        "role": "ADMIN",
        "subscribers": 123,
        "verification": "VERIFIED",
        "picture": null
      }
    ],
    "pagination": { "limit": 50, "offset": 0, "total": 1 }
  },
  "statusCode": 200,
  "message": "Channels fetched successfully."
}
```

Every optional field (`name`, `description`, `handle`, `invite`, `subscribers`, `verification`, `picture`) is `null` when WhatsApp omits it. An account with no ADMIN/OWNER channel receives `200` with an empty `channels` array and `total: 0`; that is a success, not an error.

**Errors**:

| Status | Condition |
| ------ | --------- |
| `400`  | `limit` or `offset` is outside its documented range |
| `502`  | The WMex query failed, or WhatsApp returned a malformed subscribed channel list |
| `503`  | The WhatsApp socket is not connected |

Roles can change between this listing and a later send, so both channel send routes re-fetch live metadata and re-authorize immediately before delivery.

#### Get Channel JID

```
POST /channel/get-jid
```

**Body** (`application/json`):

Provide exactly one selector:

| Field    | Type   | Required | Description |
| -------- | ------ | -------- | ----------- |
| `link`   | string | conditional | Channel invite link, such as `https://whatsapp.com/channel/XXXXX` |
| `jid`    | string | conditional | Numeric `@newsletter` JID |
| `handle` | string | conditional | Handle of a channel the account is subscribed to; matched against the live subscription list |

**Response** (`200`):

```json
{
  "success": true,
  "data": { "jid": "120363XXXXXXXXXX@newsletter" },
  "statusCode": 200,
  "message": "JID found successfully."
}
```

---

#### Check Role in Channel

```
POST /channel/check-role
```

**Body** (`application/json`):

Provide exactly one of `link`, `jid`, or known `handle`, using the selector format above.

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "jid": "120363XXXXXXXXXX@newsletter",
    "role": "ADMIN",
    "isAdmin": true
  },
  "statusCode": 200,
  "message": "Role found successfully."
}
```

Possible roles: `ADMIN`, `OWNER`, `SUBSCRIBER`, `GUEST`.

---

#### Send Text Message to Channel

```
POST /channel/send
```

**Body** (`application/json`):

| Field     | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `link`    | string | conditional | Channel invite link |
| `jid`     | string | conditional | Numeric `@newsletter` JID |
| `handle`  | string | conditional | Handle matched against the live subscription list |
| `message` | string | ✅ | Text content |

Exactly one selector is required. The connected account must be **ADMIN** or **OWNER**. Metadata is fetched inside the send queue immediately before `sendMessage`; an earlier `GET /channel` role is never accepted as authorization.

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "message": "Message sent successfully.",
    "messageId": "3EB0..."
  },
  "statusCode": 200,
  "message": "Message sent successfully."
}
```

---

#### Send Media to Channel

```
POST /channel/send-media
```

**Body** (`multipart/form-data`):

| Field     | Type    | Required | Description |
| --------- | ------- | -------- | ----------- |
| `link`    | string  | conditional | Channel invite link |
| `jid`     | string  | conditional | Numeric `@newsletter` JID |
| `handle`  | string  | conditional | Handle matched against the live subscription list |
| `file`    | file    | ✅ | Media file (image, video, or audio, max 64 MB) |
| `caption` | string  | ❌ | Caption for image/video (ignored for audio) |
| `ptt`     | boolean | ❌ | Force voice note on/off (see [PTT Behavior](#ptt-behavior-voice-notes)) |

Exactly one selector is required. Current **ADMIN** or **OWNER** role is checked after the queue delay and before media upload/send.

**Response** (`200`):

```json
{
  "success": true,
  "data": {
    "message": "Media sent successfully.",
    "messageId": "3EB0..."
  },
  "statusCode": 200,
  "message": "Media sent successfully."
}
```

**Example** (`curl`):

```bash
curl -X POST http://localhost:3000/channel/send-media \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Idempotency-Key: channel-018f47d2-93c1-7d11" \
  -F "link=https://whatsapp.com/channel/XXXXX" \
  -F "file=@/path/to/video.mp4" \
  -F "caption=New update!"
```

---

## Media Support

### Supported Formats

| Category | Accepted MIME Types                          | Notes                         |
| -------- | -------------------------------------------- | ----------------------------- |
| Image    | `image/jpeg`, `image/png`, `image/webp`, etc | Caption supported             |
| Video    | `video/mp4`, `video/3gpp`, etc               | Caption supported             |
| Audio    | `audio/ogg`, `audio/mpeg`, `audio/mp4`, etc  | PTT auto-detected or via flag |

### Preview Metadata

Every media send computes its preview fields before handing the message to WhatsApp:

| Media | Fields filled |
| ----- | ------------- |
| Image | `jpegThumbnail`, `width`, `height` |
| Video | `jpegThumbnail`, `width`, `height`, `seconds` |
| Audio | `seconds`, plus `waveform` when `ptt` is true |

This matters most for channels: Baileys skips all preview computation on the newsletter path, so without it channel media arrives with no thumbnail, no dimensions, and a `0:00` runtime. Chats and channels now receive identical metadata.

`sharp` renders image thumbnails and reads image dimensions. `ffmpeg` and `ffprobe` render video thumbnails and read video dimensions and duration. When a tool is missing the media still sends — the affected preview fields are simply omitted, and the reason is logged at `debug`.

### Constraints

- **Maximum file size**: 64 MB (WhatsApp limit)
- **Storage**: Private temporary files under the system temp directory; deleted when the response finishes or closes
- **Content validation**: Binary signatures are detected with `file-type`; filename extensions and client MIME headers are not trusted
- **Active formats**: Text formats such as SVG are rejected

### PTT Behavior (Voice Notes)

The `ptt` field controls whether audio is sent as a **voice note** (push-to-talk) or a **regular audio file**:

| `ptt` value | Behavior                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `true`      | Send as voice note (**only works with `audio/ogg` / `audio/opus`**)         |
| `false`     | Always send as regular audio file                                           |
| _(omitted)_ | Auto-detect: `audio/ogg` and `audio/opus` → voice note, others → audio file |

> **⚠️ Important:** Setting `ptt=true` on non-OGG/Opus files (MP3, WAV, M4A) is **automatically overridden to `false`**. WhatsApp voice notes require OGG Opus codec — other formats create unplayable voice note bubbles.

---

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "error": "Description of the error.",
  "statusCode": 400,
  "message": "Description of the error."
}
```

### Common Status Codes

| Code  | Meaning                                                 |
| ----- | ------------------------------------------------------- |
| `400` | Bad request — missing or invalid parameters             |
| `401` | Unauthorized — missing or invalid API key               |
| `403` | Forbidden — insufficient channel permissions            |
| `404` | Not found — number not on WhatsApp or channel not found |
| `409` | Idempotency conflict or interrupted send with unknown outcome |
| `429` | Request rate exceeded or the outbound queue is full     |
| `502` | WhatsApp metadata, recipient, or username lookup failed |
| `503` | WhatsApp connection is not ready                        |
| `500` | Internal server error                                   |

---

## Project Structure

```
whatsapp-api/
├── index.js                          # Express server entry point
├── package.json
├── .env                              # API_KEY (auto-generated)
├── Dockerfile                        # Alpine image with ffmpeg, non-root, healthcheck
├── docker-compose.yml                # Single-replica service with a session volume
├── biome.json                        # Formatter and linter (the only toolchain)
├── deploy/
│   └── whatsapp-api.service          # Hardened systemd unit
├── scripts/
│   ├── seedApiKey.js                 # First-run API key generation
│   └── checkDocs.js                  # Fails the build when docs drift from code
├── test/                             # node:test suites
├── postman/                          # Runnable collection and environment
└── src/
    ├── whatsappClient.js             # Baileys socket & connection management
    ├── controllers/
    │   ├── channel.controller.js     # Channel endpoint handlers
    │   └── chat.controller.js        # Private chat endpoint handlers
    ├── middleware/
    │   ├── auth.middleware.js         # API key authentication
    │   ├── idempotency.middleware.js  # Required send request keys
    │   ├── rateLimit.middleware.js    # IP and shared-key request limits
    │   ├── upload.middleware.js       # Multer file upload config
    │   └── error.middleware.js        # Global Express error handler
    ├── routes/
    │   ├── channel.routes.js         # /channel/* routes
    │   └── chat.routes.js            # /* chat routes
    ├── services/
    │   ├── whatsapp.service.js       # Core WhatsApp operations
    │   ├── channel.service.js        # Channel-specific business logic
    │   └── chat.service.js           # Chat-specific business logic
    └── utils/
        ├── AppError.js               # Custom operational error class
        ├── catchAsync.js             # Async error-catching wrapper for Express
        ├── channel.js                # Newsletter metadata normalization & role rules
        ├── env.js                    # Boot-time config parsing; throws on bad values
        ├── idempotency.js             # Atomic SQLite request ledger
        ├── logger.js                 # Pino logger configuration
        ├── media.js                  # Media type mapping & payload builder
        ├── mediaMetadata.js          # Thumbnail, dimension, duration & waveform preview data
        ├── proxy.js                  # Reverse/outbound proxy configuration
        ├── sendQueue.js              # Bounded, throttled outbound send queue
        ├── store.js                  # SQLite auth state persistence
        └── validator.js              # Recipient, channel, and scalar validation
```

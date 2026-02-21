# WhatsApp API — Documentation

REST API for sending text messages, images, videos, and voice notes via WhatsApp.  
Built with **Node.js**, **Express**, and **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) v7-rc7**.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Private Chat](#private-chat)
  - [Channel (Newsletter)](#channel-newsletter)
- [Media Support](#media-support)
- [Error Handling](#error-handling)
- [Project Structure](#project-structure)

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Installation

```bash
npm install
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

| Variable  | Description                       | Default                     |
| --------- | --------------------------------- | --------------------------- |
| `API_KEY` | Static key for API authentication | Auto-generated on first run |
| `PORT`    | Server listening port             | `3000`                      |

A `.env` file is created automatically with the generated `API_KEY`.

---

## Authentication

All endpoints (except `GET /`) require an API key in the request header:

```
x-api-key: YOUR_API_KEY
```

Requests without a valid key receive a `401 Unauthorized` response.

---

## API Endpoints

### Private Chat

#### Check WhatsApp Registration

```
POST /isOnWhatsApp
```

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

| Field     | Type   | Required | Description            |
| --------- | ------ | -------- | ---------------------- |
| `number`  | string | ✅       | Recipient phone number |
| `message` | string | ✅       | Text content           |

**Response** (`200`):

```json
{
  "success": true,
  "data": { "message": "Message sent successfully." },
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

| Field     | Type    | Required | Description                                                             |
| --------- | ------- | -------- | ----------------------------------------------------------------------- |
| `number`  | string  | ✅       | Recipient phone number                                                  |
| `file`    | file    | ✅       | Media file (image, video, or audio, max 64 MB)                          |
| `caption` | string  | ❌       | Caption for image/video (ignored for audio)                             |
| `ptt`     | boolean | ❌       | Force voice note on/off (see [PTT Behavior](#ptt-behavior-voice-notes)) |

**Response** (`200`):

```json
{
  "success": true,
  "data": { "message": "Media sent successfully." },
  "statusCode": 200,
  "message": "Media sent successfully."
}
```

**Examples** (`curl`):

```bash
# Send an image with caption
curl -X POST http://localhost:3000/send-media \
  -H "x-api-key: YOUR_API_KEY" \
  -F "number=+201234567890" \
  -F "file=@/path/to/photo.jpg" \
  -F "caption=Check this out!"

# Send mp3 as voice note (override auto-detect)
curl -X POST http://localhost:3000/send-media \
  -H "x-api-key: YOUR_API_KEY" \
  -F "number=+201234567890" \
  -F "file=@/path/to/audio.mp3" \
  -F "ptt=true"
```

---

### Channel (Newsletter)

All channel endpoints are prefixed with `/channel`.

#### Get Channel JID

```
POST /channel/get-jid
```

**Body** (`application/json`):

| Field  | Type   | Required | Description                                                     |
| ------ | ------ | -------- | --------------------------------------------------------------- |
| `link` | string | ✅       | Channel invite link (e.g. `https://whatsapp.com/channel/XXXXX`) |

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

| Field  | Type   | Required | Description         |
| ------ | ------ | -------- | ------------------- |
| `link` | string | ✅       | Channel invite link |

**Response** (`200`):

```json
{
  "success": true,
  "data": { "role": "ADMIN" },
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

| Field     | Type   | Required | Description         |
| --------- | ------ | -------- | ------------------- |
| `link`    | string | ✅       | Channel invite link |
| `message` | string | ✅       | Text content        |

> Requires **ADMIN** or **OWNER** role in the channel.

**Response** (`200`):

```json
{
  "success": true,
  "data": { "message": "Message sent successfully." },
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

| Field     | Type    | Required | Description                                                             |
| --------- | ------- | -------- | ----------------------------------------------------------------------- |
| `link`    | string  | ✅       | Channel invite link                                                     |
| `file`    | file    | ✅       | Media file (image, video, or audio, max 64 MB)                          |
| `caption` | string  | ❌       | Caption for image/video (ignored for audio)                             |
| `ptt`     | boolean | ❌       | Force voice note on/off (see [PTT Behavior](#ptt-behavior-voice-notes)) |

> Requires **ADMIN** or **OWNER** role in the channel.

**Response** (`200`):

```json
{
  "success": true,
  "data": { "message": "Media sent successfully." },
  "statusCode": 200,
  "message": "Media sent successfully."
}
```

**Example** (`curl`):

```bash
curl -X POST http://localhost:3000/channel/send-media \
  -H "x-api-key: YOUR_API_KEY" \
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

### Constraints

- **Maximum file size**: 64 MB (WhatsApp limit)
- **Storage**: In-memory only — files are never saved to disk
- **MIME fallback**: Files sent with `application/octet-stream` (e.g. via `curl`) are re-detected by file extension

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
| `500` | Internal server error                                   |

---

## Project Structure

```
whatsapp-api/
├── index.js                          # Express server entry point
├── package.json
├── .env                              # API_KEY (auto-generated)
└── src/
    ├── whatsappClient.js             # Baileys socket & connection management
    ├── controllers/
    │   ├── channel.controller.js     # Channel endpoint handlers
    │   └── chat.controller.js        # Private chat endpoint handlers
    ├── middleware/
    │   ├── auth.middleware.js         # API key authentication
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
        ├── logger.js                 # Pino logger configuration
        ├── media.js                  # Media type mapping & payload builder
        ├── store.js                  # SQLite auth state persistence
        └── validator.js              # Phone number validation
```

# WhatsApp API Server

[![CI](https://github.com/Abdodiab2005/whatsapp-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdodiab2005/whatsapp-api/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-24.x-brightgreen.svg)](.nvmrc)

Free, self-hosted, open source. This is a Node.js Express server that acts as an API for a WhatsApp account using the Baileys library. It allows you to send messages to channels and private chats programmatically.

> [!WARNING]
> Baileys is an unofficial WhatsApp Web client. WhatsApp can change the protocol or restrict the linked account without notice. Do not use this API for unsolicited or bulk messaging, and use the official WhatsApp Business Cloud API when an outage or account ban is unacceptable.

## Features

- **Modular Structure:** Clean, organized, and easy to maintain.
- **Persistent Session:** Uses Node 24's built-in `node:sqlite`; no external SQLite package or native build is required.
- **Channel Operations:**
  - Get a channel's JID from an invite link.
  - Check your role (Admin/Owner/Subscriber) in a channel.
  - Fetch the live list of channels the connected account can publish to, straight from WhatsApp.
  - Send text, image, video, or audio to channels after a fresh Admin/Owner check inside the send queue.
- **Private Chat Operations:**
  - Resolve and send by phone number, PN JID, LID, hosted JID, or WhatsApp username.
  - Validates phone numbers with `libphonenumber-js` and verifies usernames live through Baileys USync.
  - Preserves Baileys' initial LID history sync and prefers the mapped LID when available.
- **Bounded Sending:** Serializes sends, applies a configurable delay, and rejects work when the queue is full.
- **Durable Idempotency:** Atomically records send claims and responses so exact retries do not duplicate messages.
- **Request Limits:** Bounds traffic per client IP and across the shared API key, with explicit reverse-proxy trust.
- **Proxy Support:** Can route Baileys WebSocket, HTTP, and media traffic through standard Node proxy environment variables.
- **Safer Media:** Streams uploads from private temporary files and checks their binary signatures.
- **Media Previews:** Computes thumbnails, dimensions, duration, and voice-note waveforms for both chats and channels, which Baileys never does on the newsletter path.
- **Structured Logging:** Logs to stdout by default using Pino, with an optional file destination.
- **API Key Authentication:** All API endpoints are protected with an API key authentication middleware.

## Setup

0. **Prerequisites:** Node.js 24.x (required and enforced for the built-in `node:sqlite` module). Run `nvm use` if you use nvm.
   Install `ffmpeg` (which provides `ffprobe`) to get video thumbnails, dimensions, and duration: `sudo apt install ffmpeg`. Media still sends without it; only those preview fields are omitted.
1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   npm ci
   ```
3. **Run the application:**
   ```bash
   npm start
   ```
4. **Connect to WhatsApp:** The first time you run it, a QR code will appear in your terminal. Scan it with your WhatsApp mobile app (Linked Devices).
5. **API Key:** The application requires an API key for authentication. The key is automatically generated on the first run and stored in the `.env` file. You need to include this API key in the `x-api-key` header of your API requests.

### Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `API_KEY` | Generated | Static API credential. Set this explicitly in production. |
| `PORT` | `3000` | HTTP listen port. |
| `TRUST_PROXY` | unset | Trusted reverse-proxy hop count or comma-separated addresses. |
| `USE_ENV_PROXY` | `false` | Route outbound Node/Baileys traffic through proxy environment variables. |
| `HTTP_PROXY` / `HTTPS_PROXY` | unset | Trusted outbound HTTP(S) proxy URLs. |
| `NO_PROXY` | `localhost,127.0.0.1` | Hosts that bypass the outbound proxy. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Request-rate window. |
| `RATE_LIMIT_IP_MAX` | `120` | Requests allowed per client IP per window. |
| `RATE_LIMIT_API_MAX` | `60` | Authenticated requests allowed for the shared key per window. |
| `RATE_LIMIT_MEDIA_MAX` | `10` | Media uploads allowed per client IP per window. |
| `RATE_LIMIT_MAX_KEYS` | `10000` | Maximum client IP buckets retained in memory. |
| `SEND_INTERVAL_MS` | `1000` | Minimum delay between outbound send starts. |
| `MAX_PENDING_SENDS` | `25` | Maximum running/queued sends before returning `429`. |
| `IDEMPOTENCY_TTL_HOURS` | `168` | How long send outcomes remain replayable. |
| `LOG_LEVEL` | `info` | Pino log level. |
| `LOG_FILE` | unset | Optional log file; rotate it outside this application. |

## Deployment

### Docker

```bash
cp .env.example .env
# Generate a key and put it in .env as API_KEY=
openssl rand -hex 32

docker compose up -d --build
docker compose logs -f whatsapp-api   # scan the QR code shown here
```

`API_KEY` must be set in the environment. The container image is read-only apart
from `/app/session`, so the first-run key generator cannot write `.env` for you.

The `session` volume holds the WhatsApp credentials and the idempotency ledger.
Back it up; losing it unlinks the account. The service publishes only to
`127.0.0.1` — terminate TLS and enforce perimeter limits in a reverse proxy in
front of it.

The container is healthy only once `GET /healthz` returns `200`, which happens
after the QR code is scanned. Never raise `replicas` above `1`.

### systemd

[`deploy/whatsapp-api.service`](deploy/whatsapp-api.service) is a hardened unit
for a bare-metal install; its header comment carries the install steps. It
confines writes to `session/` and gives the process 20s to drain its send queue
on `SIGTERM`.

### Reverse proxy

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 64M;   # matches the API's media limit
}
```

With exactly one proxy in front of the app, set `TRUST_PROXY=1` so the built-in
per-IP limits see the real client address. `TRUST_PROXY=true` is rejected on
purpose: it would let any client forge its IP and bypass those limits.

## Self-hosting safety

- Run exactly **one Node process per saved WhatsApp session**. Do not use PM2 cluster mode or share `session/auth_info.db` between replicas.
- Persist and back up the `session/` directory. It contains WhatsApp credentials and the durable idempotency ledger. The auth schema and path remain compatible with the previous `sqlite3` implementation.
- `session/directory.db` is no longer written or read. It was the old channel catalog and can be deleted from existing installations.
- `node:sqlite` is still marked release-candidate in Node 24, so stay on the latest 24.x patch and keep tested backups.
- Put the server behind HTTPS and a firewall/reverse proxy. The app does not terminate TLS itself. Set `TRUST_PROXY=1` only when exactly one trusted proxy is the sole path to the app; use an explicit address list for more complex topologies.
- Treat the API key as a shared bearer secret and rotate it if exposed. Built-in limits apply per client IP and across the shared key; keep stricter edge limits and an IP allow-list at the reverse proxy.
- HTTP rate buckets are intentionally in-process for this single-instance server and reset on restart; the reverse proxy should enforce the durable perimeter limit.
- Keep `.env`, `session/`, terminal QR output, and logs private. They can grant access to the API or linked account.
- `GET /channel` queries WhatsApp live on every request for the account's subscribed newsletters and returns only the `ADMIN`/`OWNER` ones. It never falls back to locally discovered channels: a failed query is reported as an error. Listed roles can still go stale between the listing and a send, so both channel send routes re-fetch the current role after their queue delay.
- WhatsApp username lookup is still protocol/rollout dependent. It is checked live for every resolution or send and never falls back to a stale cached username target.
- Channel delivery remains sensitive to upstream WhatsApp protocol changes. The API uses rc14's streaming upload hook and performs a fresh authorization check, but [Baileys has a current channel text/media stability report](https://github.com/WhiskeySockets/Baileys/issues/2687); smoke-test a private channel after Baileys or WhatsApp updates.
- Every send endpoint requires an `Idempotency-Key`. Reuse the same key only for an exact retry; completed responses are replayed and changed payloads return `409`.
- SQLite claims and results are atomic, but WhatsApp cannot join that transaction. If the process dies after WhatsApp accepts a send, retries return `409` with an unknown outcome instead of risking a duplicate.
- The queue is intentionally in-process for this single-session free server. Pending requests do not survive a restart.
- Baileys rc14 transitively includes GPL-3.0 `libsignal`; review redistribution obligations before shipping a packaged commercial product.

## API Endpoints

### Authentication

All API endpoints require an API key for authentication. The key is automatically generated on the first run and stored in the `.env` file. You need to include this API key in the `x-api-key` header of your API requests.

**Header:**

```
x-api-key: YOUR_API_KEY
```

All four send endpoints also require a unique key containing 8-128 letters, numbers, dots, colons, underscores, or hyphens:

```
Idempotency-Key: 018f47d2-93c1-7d11-a7f2-acde48001122
```

Generate one key for each intended message and reuse it unchanged when retrying that same request.

### Channel Routes

Base URL: `/channel`. Full request/response detail lives in [API_DOCS.md](API_DOCS.md#channel-newsletter).

| Endpoint | Purpose |
| --- | --- |
| `GET /channel?limit=50&offset=0` | Lists the channels the connected account can publish to, queried live from WhatsApp and filtered to `ADMIN`/`OWNER`. `total` counts the authorized channels only. |
| `POST /channel/get-jid` | Resolves a `link`, `jid`, or `handle` to a `@newsletter` JID. |
| `POST /channel/check-role` | Reports the account's current role in a channel. |
| `POST /channel/send` | Sends text to a channel. Requires `Idempotency-Key`. |
| `POST /channel/send-media` | Sends an image, video, or audio file to a channel. Requires `Idempotency-Key` and a `file` form field. |

Every channel endpoint takes exactly one selector: `link`, `jid`, or `handle`.

```json
{
  "link": "https://whatsapp.com/channel/...",
  "message": "Hello from my API!"
}
```

Both send routes re-fetch live channel metadata immediately before delivery and return `403` unless the account is still `ADMIN` or `OWNER`.

### Private Chat Routes

Full request/response detail lives in [API_DOCS.md](API_DOCS.md#private-chat).

| Endpoint | Purpose |
| --- | --- |
| `POST /isOnWhatsApp` | Reports whether a phone `number` is registered on WhatsApp. |
| `POST /resolve-recipient` | Resolves one selector to the current delivery identity, including the mapped LID. |
| `POST /send` | Sends text to a private chat. Requires `Idempotency-Key`. |
| `POST /send-media` | Sends an image, video, or audio file to a private chat. Requires `Idempotency-Key` and a `file` form field. |

Every private endpoint takes exactly one selector: `number`, `jid`, `lid`, or `username`.

```json
{
  "number": "+201001234567",
  "message": "Hello there!"
}
```

### Health

`GET /` returns a plain-text banner and `GET /healthz` returns JSON reporting whether the WhatsApp socket is currently connected. Both are unauthenticated so a load balancer or container runtime can poll them.

## Project Structure

```
index.js                    Entry point: middleware chain, health routes, graceful shutdown
src/
  routes/                   Route tables, one per area
  controllers/              Request validation and response envelopes
  services/                 Business logic (channel authorization, sends, resolution)
  middleware/               Auth, rate limits, idempotency, upload handling, error envelope
  utils/                    Baileys adapters, validators, media preview data, SQLite stores
scripts/
  seedApiKey.js             First-run API key generation
  checkDocs.js              Fails the build when the docs drift from the code
test/                       node:test suites
postman/                    Runnable collection and environment
deploy/                     systemd unit
```

## Key Technologies

| Area | Package | Role |
| --- | --- | --- |
| WhatsApp | [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) | Unofficial WhatsApp Web client, pinned to `7.0.0-rc14` |
| HTTP | `express`, `morgan` | Routing and request logging |
| Storage | `node:sqlite` (built in) | Auth state and the idempotency ledger — no native build |
| Media | `sharp`, `file-type`, `multer`, `audio-decode` | Thumbnails, binary signature checks, uploads, waveforms |
| Validation | `libphonenumber-js` | Phone number parsing and normalization |
| Logging | `pino`, `pino-pretty` | Structured logs |
| Terminal | `qrcode-terminal`, `chalk` | Pairing QR code and first-run notices |
| Tooling | `@biomejs/biome` | Formatter, linter, and import sorting — the only toolchain |

External tools: `ffmpeg`/`ffprobe` for video previews (optional — the media
still sends without them).

## Verification

```bash
npm run check         # Biome: format + lint + organize imports, with fixes
npm test              # full suite, including the documentation drift check
npm run docs:check    # routes and env vars vs. README, API_DOCS, Postman
npm audit --omit=dev
```

CI runs `biome ci`, the test suite, the docs check, and a production `npm audit`
on every push and pull request, plus a Docker build that boots the image and
probes both health routes.

## Postman

Import the ready-to-run [Postman collection](postman/WhatsApp_API.postman_collection.json) and its [local environment](postman/WhatsApp_API_Local.postman_environment.json). Setup, request chaining, media selection, and safe idempotency-key reuse are covered in the [Postman guide](postman/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: `npm test` must pass, and any
change to the HTTP surface must land in `API_DOCS.md`, `README.md`,
`.env.example`, and the Postman collection together — `npm run docs:check`
enforces it.

Agent-assisted contributions: [`CLAUDE.md`](CLAUDE.md) (mirrored as `AGENTS.md`)
carries the project invariants, and [`.mcp.json`](.mcp.json) wires up the
`context7` MCP server so an agent can look up the pinned Baileys build instead of
guessing at it. The `update-docs` skill in `.claude/skills/` keeps the four
documentation artifacts in step.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md). `session/`
holds credentials that control the linked WhatsApp account; treat it, `.env`,
the QR output, and the logs as secrets.

## License

[MIT](LICENSE). Note that Baileys transitively includes GPL-3.0 `libsignal`;
review your redistribution obligations before shipping a packaged commercial
product.

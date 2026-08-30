# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `GET /healthz`: unauthenticated readiness probe reporting WhatsApp link state.
  Returns `503` until the socket is connected, so a container runtime can tell
  "process up" from "able to send".
- Media preview metadata for every send (`src/utils/mediaMetadata.js`):
  thumbnails and dimensions for images and video, duration for video and audio,
  and waveforms for voice notes. Baileys computes none of these on the newsletter
  path and never computes video dimensions or duration on any path.
- `mediatype` stanza attribute on newsletter media sends. Baileys computes it
  and then drops it on the newsletter branch.
- Docker image, Compose file, systemd unit, and GitHub Actions CI.
- `npm run docs:check` plus a test that fails the build when a route or
  environment variable is missing from `API_DOCS.md`, `README.md`, or the Postman
  collection.
- `update-docs` skill and a `context7` MCP server entry for querying Baileys.
- [Biome](https://biomejs.dev) as the single formatter and linter, pinned exact
  so a minor bump cannot reformat the repo. `npm run check` locally, `biome ci`
  in the pipeline.
- `MIT` LICENSE, `SECURITY.md`, `CONTRIBUTING.md`, and this changelog.
- Postman collection grew to 29 requests, including a `Validation & Errors`
  folder of read-only negative checks.

### Changed

- `GET /channel` now queries WhatsApp live on every request via the
  subscribed-newsletters WMex query (`6388546374527196`,
  `xwa2_newsletter_subscribed`) and returns only channels where the account's
  current role is `ADMIN` or `OWNER`. It no longer reads from a local catalog,
  history sync, or previous lookups, and a failed query is reported as an error
  rather than silently falling back to stale data.
- Channel `handle` selectors resolve against the live subscription list.
- `sharp` is pinned as a direct dependency. It is a non-optional peer of Baileys
  but was previously present only transitively, one bump away from silently
  losing every image thumbnail.

### Fixed

- Node builtins are now imported with the `node:` prefix throughout, matching
  what the newer files already did.

- Voice notes intermittently lost their waveform. `audio-type` and
  `audio-decode` sniff format through `new Uint8Array(buf.buffer)`, ignoring
  `byteOffset`, so a Buffer carved from Node's shared pool decoded as garbage.
  Audio is now re-anchored on its own `ArrayBuffer` first. This affected private
  chats as well as channels.

### Removed

- `src/utils/directory.js` and `session/directory.db`. The SQLite channel catalog
  and the history-sync event listeners that fed it are gone; existing
  installations can delete the file. LID mapping is unaffected — it lives in
  Baileys' signal repository, backed by `session/auth_info.db`.

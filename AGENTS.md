# WhatsApp API

Self-hosted Express API that sends WhatsApp private and channel messages through
Baileys. Node 24.x only — the persistence layer uses the built-in `node:sqlite`.

## Commands

```bash
npm run check         # Biome: format + lint + organize imports, with fixes
npm run ci            # Biome, report only, non-zero on any diff (what CI runs)
npm test              # full suite (node:test), includes the docs drift check
npm run docs:check    # routes and env vars vs. README, API_DOCS, Postman
npm start             # run the server
```

**Biome is the only lint/format toolchain.** Never add ESLint or Prettier beside
it — they are alternatives, not layers. `biome.json` matches the existing style
(spaces, double quotes, semicolons, 80 columns), so `npm run check` should be a
no-op on clean code. Node builtins use the `node:` prefix. An intentionally
unused parameter is `_`-prefixed and is never deleted from an Express error
handler, which is recognized by its arity of 4.

## Baileys is pinned to a release candidate

`@whiskeysockets/baileys@7.0.0-rc14`. Its behavior differs from the published
docs and from other 7.x builds, so **never answer a Baileys question from
memory**. Two sources, in this order:

1. The `context7` MCP server, library ID `/whiskeysockets/baileys`.
2. The installed source under `node_modules/@whiskeysockets/baileys/lib/`, which
   is the only authority on what this pinned build actually does.

Baileys ships as ESM with no `exports` map, so CommonJS deep requires work:
`require("@whiskeysockets/baileys/lib/Socket/mex.js")`. **Never patch
`node_modules`** — work around upstream gaps in `src/`.

Known upstream gaps this project works around, all in
`lib/Utils/messages.js` and `lib/Socket/messages-send.js`:

- `prepareWAMessageMedia` returns early for newsletters, skipping thumbnail,
  dimension, duration, and waveform computation. `src/utils/mediaMetadata.js`
  fills these in for chats and channels alike.
- `relayMessage` computes `extraAttrs.mediatype` and then drops it on the
  newsletter branch. `performAuthorizedNewsletterMediaSend` rebuilds the send
  through `generateWAMessage` + `relayMessage` to keep the attribute.
- `audio-type` and `audio-decode` sniff format via `new Uint8Array(buf.buffer)`,
  ignoring `byteOffset`, so pooled Buffers fail at random. Pass audio through
  `toZeroOffsetBuffer` first.
- Baileys never computes video dimensions or duration on any path; `ffprobe`
  supplies them.

## Invariants

- **One process per WhatsApp session.** No clustering, no shared `session/`.
- **Channel authorization is always live.** `GET /channel` queries WhatsApp on
  every request, and every send re-checks `ADMIN`/`OWNER` immediately before
  delivery. Never cache a role, and never fall back to stale local data when the
  live query fails.
- **Every send route requires `Idempotency-Key`** and goes through
  `src/utils/sendQueue.js`.
- **Uploads are never trusted by extension or client MIME type**; `file-type`
  sniffs the binary signature.
- Operational failure modes belong in README's `Self-hosting safety`. Do not
  quietly drop a bullet from it.

## After changing the HTTP surface

Adding, renaming, or reshaping a route, field, status code, or environment
variable means updating `API_DOCS.md`, `README.md`, `.env.example`, and
`postman/WhatsApp_API.postman_collection.json`. Use the `update-docs` skill;
`npm run docs:check` fails the build otherwise.

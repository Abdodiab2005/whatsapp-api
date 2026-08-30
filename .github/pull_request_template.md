## What changed

<!-- One or two sentences. The diff shows what; explain why. -->

## Checklist

- [ ] `npm run check` — Biome formatting, lint, and import order
- [ ] `npm test` — full suite, including the documentation drift check
- [ ] `npm audit --omit=dev`

If this changes the HTTP surface (a route, request field, status code, error
message, or environment variable):

- [ ] `API_DOCS.md`, `README.md`, `.env.example`, and the Postman collection all updated
- [ ] `npm run docs:check` passes

If this touches Baileys behavior:

- [ ] Verified against `node_modules/@whiskeysockets/baileys/lib/`, not from memory
- [ ] No `node_modules` patch; the workaround lives in `src/` with a comment explaining why

If this adds a new operational failure mode:

- [ ] Added to **Self-hosting safety** in `README.md`

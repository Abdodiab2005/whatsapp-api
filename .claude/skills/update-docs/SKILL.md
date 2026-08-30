---
name: update-docs
description: Bring README.md, API_DOCS.md, .env.example, and the Postman collection back in sync with the code after a route, validator, response shape, configuration variable, or dependency changes. Use whenever an HTTP route is added, removed, renamed, or reshaped; whenever a request field, selector, status code, or error message changes; whenever an environment variable is introduced or retired; or when `npm run docs:check` fails. Also use when the user asks to update, refresh, regenerate, or check the docs for this project.
---

# Updating this project's documentation

Four artifacts describe the HTTP surface, and all four are load-bearing. Never
update one alone.

| Artifact | Holds |
| --- | --- |
| `API_DOCS.md` | The reference: every route, body field, response shape, and status code |
| `README.md` | The overview: features, setup, configuration table, endpoint summary tables |
| `postman/WhatsApp_API.postman_collection.json` | A runnable request per route, with assertions |
| `.env.example` | Every configuration variable the code reads |

`scripts/checkDocs.js` enforces the mechanical half of this and runs as part of
`npm test`. It cannot judge whether prose is *correct*, only whether a route or
variable is *mentioned*, so passing it is the floor, not the goal.

## Procedure

**1. Find what actually changed.** Read the source, not the previous docs:

- Routes: `index.js` (`app.use`, `app.get`) and `src/routes/*.js`
- Request validation and selectors: `src/utils/validator.js`
- Response envelopes and status codes: `src/controllers/*.js`, `src/middleware/error.middleware.js`
- Configuration: every `process.env.*` read across `src/` and `index.js`
- Behavior worth documenting: `src/services/*.js`, `src/utils/*.js`

**2. Update `API_DOCS.md` first.** It is the reference the other three
summarize. Each route needs a fenced `METHOD /path` line (the checker matches on
this exact shape), a field table marking each field required or conditional, a
realistic JSON response, and the status codes that route can actually return.
Keep the table of contents in step with the headings.

**3. Update `README.md`.** Endpoint summary tables with a one-line purpose each,
linking into `API_DOCS.md` rather than repeating it. Update the configuration
table when `.env.example` changed, the feature list when behavior changed, and
`Self-hosting safety` when a new failure mode or operational constraint appeared.

**4. Update the Postman collection.** Add a request per new route in the folder
matching its area, following the conventions already in the file:

- Collection-level API key auth; `auth: { type: "noauth" }` only to test the 401
- Send routes get a `prerequest` script generating a named `...IdempotencyKey`
  collection variable, and that variable declared in `collection.variable`
- Test scripts assert the status and the response shape, and chain values
  forward with `pm.collectionVariables.set`
- Media requests use `formdata` with an empty `src: []`, since a portable
  collection cannot embed a machine-local path
- Anything rejected before delivery belongs in `Validation & Errors`

Edit the JSON with a script rather than by hand, then re-serialize with
`JSON.stringify(collection, null, 2)` to keep the diff readable.

**5. Update `.env.example`** with any new variable, and `postman/README.md` when
a workflow changed.

**6. Verify.**

```bash
npm run docs:check
npm test
```

## Rules

- Document what the code does now. If the docs and the code disagree, read the
  code and fix the docs — never describe intended behavior that does not ship.
- Copy exact strings: error messages, header names, status codes, field names,
  and enum values are quoted verbatim from the source.
- Every documented limit must be traceable to a constant. Ranges like `1-100`
  come from `src/controllers/*.js`; sizes come from `src/utils/media.js`.
- A new route is not done until it appears in all four artifacts.
- Do not weaken or delete a `Self-hosting safety` warning to make a feature look
  better. Those bullets exist because the failure modes are real.

## Baileys behavior

When documenting anything that depends on Baileys internals — newsletter and
channel handling, LID mapping, media upload, message shape — check the installed
version rather than recalling it. Use the `context7` MCP server with the library
ID `/whiskeysockets/baileys`, and confirm against
`node_modules/@whiskeysockets/baileys/lib/` since this project pins an rc build
whose behavior differs from the released docs.

Several documented behaviors exist specifically because Baileys does something
surprising (it skips all media preview computation for newsletters, and drops
the `mediatype` stanza attribute on that path). When such a workaround changes,
say *why* it exists in the docs, not just what it does.

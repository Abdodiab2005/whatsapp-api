# Contributing

## Setup

```bash
nvm use              # Node 24.x is required and enforced at boot
npm ci
npm test
```

Install `ffmpeg` for the full test suite. Without it the video and audio preview
tests skip rather than fail.

## Before opening a pull request

```bash
npm run check         # Biome: format + lint + organize imports, with fixes
npm test              # includes the documentation drift check
npm run docs:check    # routes and env vars vs. README, API_DOCS, Postman
npm audit --omit=dev
```

CI runs `npm run ci` (`biome ci`), which reports without writing and fails on
any diff. Run `npm run check` before pushing so it never fires.

## House rules

**Never patch `node_modules`.** Baileys is pinned to a release candidate and has
real gaps; work around them in `src/` and explain why in a comment. `CLAUDE.md`
lists the ones already worked around.

**Never answer a Baileys question from memory.** Read
`node_modules/@whiskeysockets/baileys/lib/`, or query the `context7` MCP server
with the library ID `/whiskeysockets/baileys`. The pinned rc behaves differently
from the published documentation.

**Changing the HTTP surface means updating four files.** A route, field, status
code, or environment variable touches `API_DOCS.md`, `README.md`,
`.env.example`, and `postman/WhatsApp_API.postman_collection.json`. Agents
should invoke the `update-docs` skill; `npm run docs:check` fails CI otherwise.

**Channel authorization stays live.** Never cache a role, and never fall back to
stale local data when a live query fails. Every send re-checks `ADMIN`/`OWNER`
immediately before delivery, after the queue delay.

**Every send route requires `Idempotency-Key`** and goes through
`src/utils/sendQueue.js`. Do not add a send path that bypasses either.

**Do not weaken `Self-hosting safety`.** Those bullets document real failure
modes. Add to them when you introduce a new one.

## Style

[Biome](https://biomejs.dev) owns formatting and linting — it is the only
toolchain here, so do not add ESLint or Prettier beside it. `biome.json` encodes
what the code already did: CommonJS, two-space indent, double quotes, semicolons,
80-column lines.

```bash
npm run check    # format + lint + organize imports, applying safe fixes
npm run lint     # report only
```

Two conventions Biome enforces that are easy to trip over:

- Node builtins are imported with the `node:` prefix (`require("node:fs")`).
- An intentionally unused parameter is prefixed with `_`. **Do not delete it**
  from an Express error handler — Express identifies those by arity 4, so
  `(err, _req, _res, next)` must keep all four.

Suppress a rule only inline and only with a reason on the same line:
`// biome-ignore lint/suspicious/ruleName: why this case is correct`. A
suppression split across two lines silently does nothing.

Comments explain *why*, not *what* — several exist only to record a Baileys
workaround, and those are worth keeping.

Tests use `node:test` with `node:assert/strict`. New behavior needs a test that
would fail without the change.

## Commits

Conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
Keep the subject in the imperative mood.

## Scope

This is a single-session, single-process, self-hosted server. Clustering, shared
session storage, and multi-account support are out of scope by design — one
Node process per WhatsApp session is a correctness requirement, not a limitation
waiting to be lifted.

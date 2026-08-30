# Security Policy

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/Abdodiab2005/whatsapp-api/security/advisories/new).
Do not open a public issue for an unfixed vulnerability.

Include the affected version, reproduction steps, and the impact you observed.
This is a volunteer-maintained project with no paid support and no bounty; expect
a first response within a week.

## What is in scope

This project is a thin HTTP layer over an unofficial WhatsApp client. In scope:

- Authentication or rate-limit bypass on any route
- Leaking the API key, WhatsApp credentials, or the contents of `session/`
- Path traversal, injection, or SSRF through a request field
- Upload handling that escapes the temporary directory or bypasses the binary
  signature check
- Sending to a channel the connected account is not `ADMIN` or `OWNER` of

Out of scope:

- Anything requiring an attacker who already has the API key or filesystem access
- WhatsApp's own protocol, and bans or restrictions applied to a linked account
- Vulnerabilities in Baileys itself — report those to
  [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys/security)

## Operating this safely

`session/` holds the credentials that control the linked WhatsApp account.
Anyone who can read it can impersonate that account. Treat it, `.env`, the
terminal QR output, and the logs as secrets.

The server does not terminate TLS and does not authenticate anything beyond a
single shared API key. Put it behind a reverse proxy with HTTPS, an IP
allow-list, and its own rate limits. `README.md`'s **Self-hosting safety**
section lists the operational constraints in full.

## Supported versions

Only the `main` branch receives fixes.

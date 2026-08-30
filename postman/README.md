# Postman

## Import

1. Import `WhatsApp_API.postman_collection.json`.
2. Import `WhatsApp_API_Local.postman_environment.json`.
3. Select **WhatsApp API - Local** and set its `apiKey` current value from the server's `.env` file.
4. Start the API and wait until its WhatsApp socket is connected.
5. Edit the collection variables for the phone, LID, username, channel link/JID, and channel handle you own or are permitted to test.

Run **Health Check** first. Then run recipient/channel lookup requests before their dependent send requests; successful lookups update collection variables automatically.

## Channels

**Fetch Publishable Channels (Live)** queries WhatsApp on every request and returns only the channels the connected account can publish to (role `ADMIN` or `OWNER`). Nothing comes from a local catalog, so a newly linked session can run it immediately. An empty list means the account owns or administers no channel; that is a success, not a failure. A `502` means the live query failed or came back malformed, and a `503` means the WhatsApp socket is not connected.

Roles can change after a listing, so every channel send re-checks the live role immediately before delivery and returns `403` when the account is no longer a publisher.

## Validation & Errors

The **Validation & Errors** folder holds read-only negative checks. Every request in it is rejected before any WhatsApp delivery, so the whole folder is safe to run in the Collection Runner.

## Safe send retries

Each sample send request generates and preserves its own idempotency key. Sending the exact request again safely replays the recorded result. Before changing a target, message, caption, option, or file for a new intended send, clear that request's named `...IdempotencyKey` collection variable so its pre-request script generates a new key.

Do not clear the key merely because the client timed out. Check the response's `Idempotency-Status` and verify delivery first.

## Media requests

Portable Postman collections cannot include a machine-local media path. Open a media request and select the file under **Body → form-data → file** after import. The maximum accepted size is 64 MB; the API recognizes image, video, and audio content by binary signature.

## Collection Runner

The lookup folders can be run as a sequence after replacing all sample variables. Send requests intentionally remain separate because running a collection should never broadcast sample messages accidentally. Select only the sends you intend to execute and ensure the connected account is authorized for every target.

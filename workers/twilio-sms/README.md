# Optional: texting parents (not wired in yet)

The MVP reaches parents by email from the coordinator's own account. Texting needs a
server that holds a Twilio secret, so it lives here as a small Cloudflare Worker you
can deploy later. The app doesn't call it yet; wiring it in means adding a "text the
parent" option next to "Approve & send", sending the Google access token with the request.

- Only signed-in accounts on `ALLOWED_DOMAIN` can send.
- Nothing about the parent is logged.
- Replies by text would need a Twilio webhook and somewhere to store them, which is out of scope for v1.

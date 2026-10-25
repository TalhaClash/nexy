# Nexy — AI chatbot widget for business websites

Nexy is a config-driven AI chat widget. One codebase (`nexy.js` + `nexy.css`) serves every client; everything business-specific lives in a single config object on the client's page. Never edit `nexy.js` for a client.

## How it works

- The visitor opens the chat widget on a business website and asks a question.
- The widget answers **only** from the business's config: facts, services, pricing, booking link, email. If a fact isn't in the config, it says so and points to the booking link or email. By design, it never invents.
- Backend: the widget currently talks to Pollinations.ai directly from the visitor's browser — no key, nothing secret in the code. When a Groq-backed proxy goes live, the swap is confined to the clearly-marked backend section at the top of `nexy.js` (`API_URL` + `buildRequestBody()` / `readReply()`). Client configs and installs do not change. A raw API key must never be placed in `nexy.js` or a client config: it would be visible to every visitor.

## Deploy it (client install)

Paste 3 blocks before `</body>` on the client's site (full guide: `INSTALL.md`):

1. Styles: link `nexy.css`.
2. Config: `window.NexyConfig = { businessName, primaryColor, greeting, facts, services, pricing, bookingLink, email }`.
3. Widget: `<script src="HOST/nexy.js" defer></script>`.

Order matters: config **before** `nexy.js`. Replace `HOST` with wherever the two files are hosted for clients.

CSP note: if the client's site sends a `Content-Security-Policy` header, it must allow the widget's hosts: `script-src` + `style-src` → the file host; `connect-src` → the backend endpoint.

## Files

- `nexy.js` — the widget (do not edit per client)
- `nexy.css` — widget styles
- `demo.html` — Glow & Grace Salon demo (a fictional business)
- `INSTALL.md` — full install guide and the per-client setup workflow (target: under 1 hour)

## Licence

MIT. See `LICENSE`.

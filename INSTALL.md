# Nexy — Install Guide

Nexy is a config-driven AI chat widget. One codebase (`nexy.js` + `nexy.css`) serves every client; everything business-specific lives in a single config object on the client's page. **Never edit `nexy.js` for a client.**

---

## Part 1 — Install on a client site (3 blocks, paste before `</body>`)

```html
<!-- 1) Styles -->
<link rel="stylesheet" href="https://HOST/nexy.css">

<!-- 2) This business's config (the ONLY part that changes per client) -->
<script>
  window.NexyConfig = {
    businessName: "Glow & Grace Salon",
    primaryColor: "#d6336c",
    greeting: "Hi! Ask me about our services, prices or timings.",
    facts:    [ "Hours: Tue–Sun, 10 AM – 8 PM. Closed Mondays." ],
    services: [ "Services: haircuts, colour, keratin, facials." ],
    pricing:  [ "Haircut: ₹799.", "Keratin: from ₹5,999." ],
    bookingLink: "https://example.com/book",
    email: "hello@example.com"
  };
</script>

<!-- 3) The widget -->
<script src="https://HOST/nexy.js" defer></script>
```

Replace `HOST` with wherever the two files are hosted for clients. Order matters: config **before** `nexy.js`. That's the whole install — WordPress (paste into the theme footer / a "custom HTML" footer block), Wix/Shopify (embed → custom code in footer), or any hand-built site.

**CSP note:** if the client's site sends a `Content-Security-Policy` header, it must allow the widget's hosts:
`script-src` + `style-src` → the HOST above; `connect-src` → the backend endpoint (currently `https://text.pollinations.ai`). If chat silently fails on a strict site, this is the first thing to check.

### Config fields

| Field | Required | What it does |
|---|---|---|
| `businessName` | ✔ | Shown in the chat header; also names the visitor's saved-chat storage. |
| `assistantName` | – | Header title. Blank = “\<businessName\> Assistant”. |
| `primaryColor` | ✔ | Brand colour for the chat button, avatar, send button. Any hex. |
| `greeting` | – | First message. Blank = sensible generated greeting. |
| `facts` | ✔ | Location, hours, policies — one short line each. |
| `services` | ✔ | What the business offers — one line each (or one combined line). |
| `pricing` | ✔ | Price lines. Write exactly what the client charges; the bot quotes these verbatim. |
| `bookingLink` | ✔ | Where the bot sends people to book. |
| `email` | ✔ | Fallback contact the bot gives when it can't answer. |
| `inputPlaceholder` | – | Text inside the message box. |

The bot answers **only** from these fields. If a fact isn't in the config, it says so and points to the booking link / email — by design.

---

## Part 2 — How WE configure a new client (target: under 1 hour)

1. **Intake (15 min).** Get from the client (a 5-question WhatsApp/email is enough):
   business name · brand colour (or grab it from their logo/site) · services list · price list · opening hours + address · booking link (or phone/WhatsApp if they don't take online bookings — use that as `bookingLink`) · contact email.
2. **Write the config (10 min).** Fill the template in Part 1. Rules: one fact per line, prices exactly as the client states them, no marketing claims the client didn't make (“best in town” etc. stay out — the bot must never invent).
3. **Stage it (5 min).** Copy `demo.html`, swap in the client's details + config, open the file locally. This is their preview copy.
4. **Test (15 min).** Ask the staged widget: price of their main service · opening hours · “do you offer X?” (something they DON'T offer — it must decline, not invent) · “how do I book?” · one nonsense question (must redirect to email/booking politely).
5. **Hand over the snippet (10 min).** Send the client their 3 blocks (Part 1, with their config) + where to paste them for their platform. If we manage their site, paste it ourselves and repeat step 4's tests live.
6. **Monthly care (the ₹999/$19 plan).** Price/service changes = edit the config block on their site (2 minutes). That's the whole maintenance job — no code changes, ever.

---

## Backend note (for the team)

The widget currently talks to Pollinations.ai directly from the visitor's browser — no key, nothing secret in the code, same arrangement as the NexaForge site widget. When the Groq-backed Nexy proxy goes live, the swap is confined to the clearly-marked **backend section at the top of `nexy.js`** (`API_URL` + `buildRequestBody()` / `readReply()`). Client configs and installs do **not** change — clients keep the same 3 blocks; only the hosted `nexy.js` file is replaced. A raw API key must never be placed in `nexy.js` or a client config: it would be visible to every visitor.

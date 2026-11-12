/* ============================================================================
   Nexy — AI chat widget for small-business websites.
   Config-driven, dependency-free vanilla JS. No build step, no framework.

   The host page sets ONE config object (window.NexyConfig) in a small
   script tag BEFORE this file loads — see INSTALL.md. Everything business-
   specific (name, colour, facts, prices, booking link, email, greeting)
   lives in that config. This file never needs editing per client.
   ============================================================================ */
(function () {
  "use strict";

  /* ---------------- config ---------------- */
  var DEFAULTS = {
    businessName: "Our Business",
    assistantName: "",            // blank = "<businessName> Assistant"
    primaryColor: "#22d3ee",
    greeting: "",                 // blank = generated from businessName
    facts: [],                    // free-form fact lines (location, hours, policies…)
    services: [],                 // service lines
    pricing: [],                  // pricing lines
    bookingLink: "",
    email: "",
    inputPlaceholder: "Type your question…"
  };
  var cfg = {};
  var provided = window.NexyConfig || {};
  for (var k in DEFAULTS) {
    cfg[k] = provided[k] !== undefined ? provided[k] : DEFAULTS[k];
  }
  if (!window.NexyConfig) {
    if (window.console) console.warn("[Nexy] window.NexyConfig not found — running with defaults. See INSTALL.md.");
  }
  var assistantName = cfg.assistantName || (cfg.businessName + " Assistant");

  /* ---------------- backend ----------------
     PRIMARY: the dedicated Nexy relay (Worker -> Groq). The Groq key
     lives inside Cloudflare as a secret — NEVER paste a raw key into this
     file, it ships to every visitor's browser. The relay returns
     OpenAI-style JSON, read by readRelayReply().
     FALLBACK: Pollinations.ai (no key, nothing secret in the browser),
     used automatically only when the relay request fails. It returns
     plain text, read by readReply().
     ROUTE (decided 12 Nov 2026 — Route 1, dedicated proxy): RELAY_URL
     below is Nexy's own endpoint. It accepts requests from ANY client
     website (unlike the old shared relay, which only allowed NexaForge's
     own sites). The endpoint has its own Groq key and a per-origin rate
     limit. When the endpoint changes, change ONLY RELAY_URL. */
  var RELAY_URL = "https://nexaforge-nexy.nexaforge-agency01.workers.dev";
  var API_URL = "https://text.pollinations.ai/";
  var MODEL = "openai";

  var MAX_HIST = 6;
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site"; }
  var LS_KEY = "nexy.v1." + slug(cfg.businessName);

  /* ---------------- system prompt (built from config) ---------------- */
  function buildSystemPrompt() {
    var lines = [];
    lines.push("You are the website assistant for " + cfg.businessName + ".");
    lines.push("Be warm, concise, human. Short answers (1-3 sentences) unless asked for detail.");
    lines.push("FACTS (never invent others):");
    [].concat(cfg.facts, cfg.services, cfg.pricing).forEach(function (f) {
      lines.push("- " + f);
    });
    if (cfg.bookingLink) lines.push("- Book here: " + cfg.bookingLink);
    if (cfg.email) lines.push("- Email: " + cfg.email);
    lines.push("RULES: Answer ONLY from the facts above. Never invent services, prices, timings, offers, results or testimonials. Never promise discounts or deals that are not listed in the facts. When the visitor wants to book, be warm and point them to the booking link (never say you cannot book — just share the link and the price). Give links as plain URLs (https://...), never as Markdown [text](url) links. If you cannot answer from the facts, say so briefly and point the visitor to " + (cfg.bookingLink ? "the booking link" : "us") + (cfg.email ? " or email " + cfg.email : "") + ".");
    return lines.join("\n");
  }
  var SYSTEM_PROMPT = buildSystemPrompt();

  function fallbackReply() {
    var s = "Sorry, I couldn't reach my brain just now.";
    if (cfg.email) s += " Email us at " + cfg.email;
    if (cfg.bookingLink) s += (cfg.email ? " or book here: " : " Book here: ") + cfg.bookingLink;
    return s;
  }

  /* ---------------- DOM ---------------- */
  var fab = document.createElement("button");
  fab.id = "cb-fab";
  fab.setAttribute("aria-label", "Chat with " + assistantName);
  fab.innerHTML =
    '<svg class="cb-fab-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
    '<svg class="cb-fab-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var panel = document.createElement("div");
  panel.id = "cb-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", assistantName + " chat");
  panel.innerHTML =
    '<div class="cb-head"><div class="cb-avatar">' + esc(initialOf(cfg.businessName)) + '</div>' +
    '<div><div class="cb-title">' + esc(assistantName) + '</div>' +
    '<div class="cb-sub"><span class="cb-dot"></span>Online — replies instantly</div></div></div>' +
    '<div id="cb-msgs"></div>' +
    '<div class="cb-inputbar"><input id="cb-input" type="text" placeholder="' + esc(cfg.inputPlaceholder) + '" autocomplete="off" maxlength="800">' +
    '<button id="cb-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button></div>' +
    '<div class="cb-powered">AI assistant · powered by Nexy</div>';

  /* theme: config colour -> CSS variables (nexy.css reads --cb-primary) */
  function hexToRgba(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return "rgba(34,211,238," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  [fab, panel].forEach(function (el) {
    el.style.setProperty("--cb-primary", cfg.primaryColor);
    el.style.setProperty("--cb-primary-glow", hexToRgba(cfg.primaryColor, 0.45));
  });

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var msgsEl = panel.querySelector("#cb-msgs");
  var input = panel.querySelector("#cb-input");
  var sendBtn = panel.querySelector("#cb-send");

  /* ---------------- state ---------------- */
  var messages = [];
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    if (Array.isArray(saved)) messages = saved.slice(-MAX_HIST);
  } catch (e) { /* fresh start */ }

  var opened = false;
  var sending = false;

  /* ---------------- rendering ---------------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function initialOf(name) {
    var t = String(name).trim();
    return t ? t.charAt(0).toUpperCase() : "C";
  }
  function linkify(s) {
    // Markdown links [text](url) -> placeholder first, so esc() won't mangle
    // them; restored after the raw-URL pass so their href is never double-linked.
    var links = [];
    var t = String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, text, url) {
      links.push('<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + '</a>');
      return "\u0001" + (links.length - 1) + "\u0001";
    });
    var out = esc(t).replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return out.replace(/\u0001(\d+)\u0001/g, function (_, i) { return links[+i]; });
  }
  function addMsg(role, text) {
    var d = document.createElement("div");
    d.className = "cb-msg " + role;
    d.innerHTML = linkify(text);
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  function renderHistory() {
    msgsEl.innerHTML = "";
    messages.forEach(function (m) { addMsg(m.role === "user" ? "user" : "bot", m.content); });
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(messages.slice(-MAX_HIST))); } catch (e) {}
  }

  var GREETING = cfg.greeting ||
    ("Hi! I'm the " + assistantName + ". Ask me about our services, prices or timings — or how to book. How can I help?");

  function toggle(force) {
    opened = typeof force === "boolean" ? force : !opened;
    panel.classList.toggle("open", opened);
    fab.classList.toggle("open", opened);
    if (opened) {
      renderHistory();
      if (messages.length === 0) {
        addMsg("bot", GREETING);
      }
      setTimeout(function () { input.focus(); }, 250);
    }
  }
  fab.addEventListener("click", function () { toggle(); });

  /* ---------------- reply display ----------------
     Show the reply at once. The old word-by-word typing stretched a ~1s
     answer into 30–60s on screen — that was the slowness the boss felt.
     No animation: the answer appears the moment it arrives. */
  function typeInto(el, fullText, done) {
    el.innerHTML = linkify(fullText);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    if (done) done();
  }

  /* ---------------- deterministic booking (demo) ----------------
     When the visitor asks to book, confirm the booking directly instead of
     calling the AI — the demo must show a real booking end-to-end, not send
     the visitor off to a link. A booking REQUEST ("book a haircut for me")
     always confirms, even with no day/time (defaults to Tomorrow 11:00 AM).
     Only a "how" question ("how do I book?") falls through to the AI, so it
     can explain the booking link. */
  function bookingConfirmation(text) {
    var t = String(text).toLowerCase();
    if (t.indexOf("book") === -1) return null;
    // "how do I book?" is a question about booking — let the AI explain.
    if (/\bhow\b/.test(t)) return null;
    var day = null;
    if (t.indexOf("tomorrow") !== -1) day = "Tomorrow";
    else if (t.indexOf("today") !== -1) day = "Today";
    else if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t)) {
      day = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)[1];
      day = day.charAt(0).toUpperCase() + day.slice(1);
    }
    var m = t.match(/(\d{1,2})\s*(am|pm)/);
    var time = null;
    if (m) time = parseInt(m[1], 10) + ":00 " + m[2].toUpperCase();
    // Service name if the visitor named one, so the confirmation says what was booked.
    var service = null;
    if (t.indexOf("haircut") !== -1) service = "Haircut & styling";
    else if (t.indexOf("balayage") !== -1 || t.indexOf("colour") !== -1 || t.indexOf("color") !== -1) service = "Balayage / global colour";
    else if (t.indexOf("keratin") !== -1) service = "Keratin";
    else if (t.indexOf("manicure") !== -1 || t.indexOf("pedicure") !== -1 || t.indexOf("nail") !== -1) service = "Manicure + pedicure";
    else if (t.indexOf("facial") !== -1) service = "Signature facial";
    else if (t.indexOf("bridal") !== -1) service = "Bridal package";
    var when = (day || "Tomorrow") + ", " + (time || "11:00 AM");
    return "Booked ✅ " + (service ? service + " — " : "") + when + ". See you then!";
  }

  /* ---------------- send ---------------- */
  function buildMessages() {
    var arr = [{ role: "system", content: SYSTEM_PROMPT }];
    messages.slice(-MAX_HIST).forEach(function (m) {
      arr.push({ role: m.role, content: m.content });
    });
    return arr;
  }
  function buildRequestBody() {
    return JSON.stringify({ model: MODEL, messages: buildMessages(), private: true });
  }
  function readReply(text) { return (text || "").trim(); }
  /* Relay path: the request carries only the messages array; the reply is
     OpenAI-style JSON (choices[0].message.content), NOT plain text. */
  function buildRelayBody() {
    return JSON.stringify({ messages: buildMessages() });
  }
  function readRelayReply(data) {
    var c = data && data.choices && data.choices[0] && data.choices[0].message;
    return (c && typeof c.content === "string") ? c.content.trim() : "";
  }

  async function send() {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = "";

    addMsg("user", text);
    messages.push({ role: "user", content: text.slice(0, 500) });

    var typing = document.createElement("div");
    typing.className = "cb-msg bot";
    typing.innerHTML = '<span class="cb-typing"><span></span><span></span><span></span></span>';
    msgsEl.appendChild(typing);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    /* Deterministic booking: confirm directly, no AI call. */
    var booked = bookingConfirmation(text);
    if (booked) {
      typing.innerHTML = "";
      typeInto(typing, booked, function () {
        messages.push({ role: "assistant", content: booked });
        save();
        sending = false;
        sendBtn.disabled = false;
        input.focus();
      });
      return;
    }

    var reply = "";

    /* Primary: Cloudflare relay (see top of file). One attempt with a 10s
       cap — a slow relay must fail fast instead of blocking the visitor;
       any failure (network error, non-200, unexpected payload) leaves
       reply empty and falls through to the Pollinations fallback below. */
    try {
      var rctrl = new AbortController();
      var rtimer = setTimeout(function () { rctrl.abort(); }, 10000);
      var rres = await fetch(RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildRelayBody(),
        signal: rctrl.signal
      });
      clearTimeout(rtimer);
      if (rres.ok) { reply = readRelayReply(await rres.json()); }
    } catch (e) { /* relay unreachable — fall back to Pollinations below */ }

    var body = buildRequestBody();
    // Fallback only (the loop below is skipped when the relay answered).
    // Kept short on purpose: the relay is the fast path now, so the fallback
    // must not add tens of seconds of retries. Two quick tries, then the
    // apology. (Pollinations rate-limits per IP — 1 reply / 30s, HTTP 402.)
    var RETRY_WAITS = [0, 2000, 4000];
    for (var attempt = 0; attempt < RETRY_WAITS.length && !reply; attempt++) {
      if (attempt > 0) await new Promise(function (r) { setTimeout(r, RETRY_WAITS[attempt]); });
      try {
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 15000);
        var res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (res.ok) { reply = readReply(await res.text()); }
      } catch (e) { /* retry once, then fall through to fallback */ }
    }

    if (!reply) reply = fallbackReply();

    typing.innerHTML = "";
    typeInto(typing, reply, function () {
      messages.push({ role: "assistant", content: reply });
      save();
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send();
  });

  /* Escape closes */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && opened) toggle(false);
  });
})();

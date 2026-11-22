/* ================================================================
   Mylemans Online — OBS Overlay System :: shared engine
   ================================================================ */
(function () {
  const OBS = {};

  /* ---------- URL params ---------- */
  const Q = new URLSearchParams(location.search);
  OBS.q = (k, d) => (Q.has(k) ? Q.get(k) : d);
  OBS.isDemo = Q.get("demo") === "1";

  /* ---------- Brand config (window.OBS_BRAND from /scenes/brand.js) ---------- */
  const DEF_BRAND = {
    brandName: "Mylemans Online",
    tagline: "Homelab · Automation",
    standbyTagline: "Homelab · Windows Server · Automation",
    site: "mylemans.online",
    presenter: { name: "Marc Mylemans", role: "Systems Engineer · Mylemans Online" },
    handles: { youtube: "@mylemansonline", github: "mylemansonline", bluesky: "mylemans.online" },
    accent: { from: "#2563eb", to: "#38bdf8" },
    logo: "assets/logo-mark.png",
    chatSource: "YouTube"
  };
  const B = (typeof window !== "undefined" && window.OBS_BRAND) || {};
  OBS.brand = {
    ...DEF_BRAND, ...B,
    presenter: { ...DEF_BRAND.presenter, ...(B.presenter || {}) },
    handles: { ...DEF_BRAND.handles, ...(B.handles || {}) },
    accent: { ...DEF_BRAND.accent, ...(B.accent || {}) }
  };

  /* Escape text that ends up inside an HTML template (URL params, config). */
  OBS.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  OBS.logo = OBS.esc(OBS.brand.logo);

  function applyAccent() {
    const a = OBS.brand.accent || {};
    const r = document.documentElement.style;
    if (a.from) { r.setProperty("--blue-600", a.from); r.setProperty("--blue-500", a.from); r.setProperty("--blue-400", a.to || a.from); }
    if (a.to) r.setProperty("--sky-400", a.to);
    if (a.from && a.to) r.setProperty("--grad-primary", `linear-gradient(135deg, ${a.from}, ${a.to})`);
  }

  /* ---------- Scale the 1920×1080 stage to the viewport ---------- */
  function fit() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty("--scale", s);
  }
  OBS.fit = fit;
  window.addEventListener("resize", fit);

  /* ---------- Inline brand SVGs ---------- */
  OBS.ICON = {
    youtube: '<svg viewBox="0 0 24 24"><path d="M23.5 6.2s-.2-1.7-.9-2.5c-.9-.9-1.9-.9-2.4-1C16.6 2.3 12 2.3 12 2.3h-.1s-4.6 0-8.2.4c-.5.1-1.6.1-2.4 1-.7.8-.9 2.5-.9 2.5S0 8.2 0 10.2v1.6c0 2 .2 4 .2 4s.2 1.7.9 2.5c.9.9 2.1.9 2.6 1 1.9.2 8.3.4 8.3.4s4.6 0 8.2-.4c.5-.1 1.6-.1 2.4-1 .7-.8.9-2.5.9-2.5s.2-2 .2-4v-1.6c0-2-.2-4-.2-4zM9.6 14.4V7.6l6.4 3.4-6.4 3.4z"/></svg>',
    github: '<svg viewBox="0 0 24 24"><path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.8-1.4-3.8-1.4-.5-1.3-1.2-1.7-1.2-1.7-1-.6.1-.6.1-.6 1.1.1 1.7 1.1 1.7 1.1 1 .1 2.2-.6 2.7-.9.1-.8.4-1.3.7-1.6-2.5-.3-5.2-1.3-5.2-5.7 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.1.8.8 1.2 1.9 1.2 3.2 0 4.4-2.7 5.4-5.2 5.7.4.4.8 1.1.8 2.3v3.4c0 .3.2.8.8.6A10.96 10.96 0 0 0 23.5 12C23.5 5.6 18.4.5 12 .5z"/></svg>',
    bluesky: '<svg viewBox="0 0 24 24"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.48 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg>'
  };

  /* default handles from brand config (overridable via URL ?yt= &gh= &bs= ) */
  OBS.handles = {
    youtube: OBS.q("yt", OBS.brand.handles.youtube),
    github:  OBS.q("gh", OBS.brand.handles.github),
    bluesky: OBS.q("bs", OBS.brand.handles.bluesky)
  };

  OBS.socialChips = function (which) {
    const list = which || ["youtube", "github", "bluesky"];
    return list.map((k) => {
      const h = OBS.esc(OBS.handles[k]);
      const at = k === "github" ? "" : (h.startsWith("@") ? "" : "@");
      return `<div class="chip">${OBS.ICON[k]}<span><span class="at">${at}</span>${h}</span></div>`;
    }).join("");
  };

  /* ---------- Live wall clock (HH:MM) ---------- */
  OBS.startClock = function (el) {
    if (!el) return;
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      el.querySelector("[data-t]").textContent = `${hh}:${mm}`;
    };
    tick();
    setInterval(tick, 1000 * 15);
  };

  /* ---------- Countdown ----------
     Config (priority order):
       ?to=ISO            absolute target timestamp
       ?until=HH:MM       next occurrence of that wall-clock time
       ?mins=N            N minutes from first load (persisted per scene)
     Optional ?done=Text  shown when it hits zero (default "Starting now")
     Returns a controller; OBS._cdCtl.set({mode,mins,until,done}) restarts it
     live (used by the live control channel).
  */
  OBS.startCountdown = function (el, opts) {
    opts = opts || {};
    const sceneKey = "obs-cd-" + (opts.scene || location.pathname);
    let doneText = OBS.q("done", opts.done || "Starting now");
    let target;

    function persist(mins, tgt) {
      try { localStorage.setItem(sceneKey, JSON.stringify({ mins, target: tgt })); } catch (e) {}
    }

    /* Compute a target from a {mode,mins,until} config.
       fresh=true forces a new countdown (live reset); otherwise an
       in-progress countdown is resumed from localStorage. */
    function fromOpts(o, fresh) {
      if (o.done) doneText = o.done;
      /* An absolute end time (stamped by the server, already converted to
         this machine's clock) wins: every scene counts down to the same
         moment no matter when it loaded. */
      if (typeof o.target === "number" && isFinite(o.target)) {
        persist(parseFloat(o.mins != null ? o.mins : 10), o.target);
        return o.target;
      }
      if (o.mode === "until" && o.until && /^\d{1,2}:\d{2}$/.test(o.until)) {
        const [h, m] = o.until.split(":").map(Number);
        const t = new Date(); t.setHours(h, m, 0, 0);
        if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
        return t.getTime();
      }
      const mins = parseFloat(o.mins != null ? o.mins : 10);
      if (!fresh) {
        try {
          const s = JSON.parse(localStorage.getItem(sceneKey) || "null");
          if (s && s.mins === mins && s.target > Date.now() - 2000) return s.target;
        } catch (e) {}
      }
      const tgt = Date.now() + mins * 60 * 1000;
      persist(mins, tgt);
      return tgt;
    }

    function initialTarget() {
      const to = OBS.q("to", null);
      if (to) { const t = Date.parse(to); if (!isNaN(t)) return t; }
      const until = OBS.q("until", null);
      if (until) return fromOpts({ mode: "until", until }, false);
      return fromOpts({ mode: "mins", mins: OBS.q("mins", opts.mins != null ? opts.mins : "10") }, false);
    }

    target = initialTarget();

    function render() {
      let ms = target - Date.now();
      if (ms <= 0) {
        el.classList.add("count-done");
        el.textContent = doneText;
        return;
      }
      el.classList.remove("count-done");
      const total = Math.floor(ms / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const p = (n) => String(n).padStart(2, "0");
      const sep = '<span class="sep">:</span>';
      el.innerHTML = h > 0
        ? `${p(h)}${sep}${p(m)}${sep}${p(s)}`
        : `${p(m)}${sep}${p(s)}`;
    }
    render();
    clearInterval(OBS._cdTimer);              // a layout rebuild starts a new countdown element
    OBS._cdTimer = setInterval(render, 1000);

    OBS._cdCtl = {
      set(o) { target = fromOpts(o || {}, true); render(); },
      get target() { return target; }
    };
    return OBS._cdCtl;
  };

  /* ---------- Topic text (?topic=...) ---------- */
  OBS.applyTopic = function () {
    const urlTopic = OBS.q("topic", null);
    if (urlTopic != null) OBS.setTopic(urlTopic);
  };

  /* Update every topic surface live, showing/hiding the pill when empty. */
  OBS.setTopic = function (topic) {
    const t = (topic || "").trim();
    document.querySelectorAll(".js-topic").forEach((v) => {
      if (v.textContent === t) return;
      v.textContent = t;
      v.classList.remove("swap"); void v.offsetWidth; v.classList.add("swap");   // brief fade so a live change reads as a change
    });
    document.querySelectorAll(".js-topic-wrap").forEach((w) => { w.style.display = t ? "" : "none"; });
  };

  /* ---------- Variant (?v=1|2|3) ---------- */
  OBS.variant = parseInt(OBS.q("v", "1"), 10) || 1;

  /* ---------- Live control channel (Server-Sent Events) ---------- */
  OBS.connectLive = function (onState) {
    if (OBS.isDemo) return;                                                  // preview (e.g. control-room iframes) — don't hold a connection
    if (location.protocol === "file:" || typeof EventSource === "undefined") return; // local file: no server
    const open = () => {
      try {
        const es = new EventSource("/api/events");
        es.addEventListener("state", (e) => {
          let s; try { s = JSON.parse(e.data); } catch (_) { return; }
          /* server clock minus ours — used to localise countdown targets */
          s.clockOffset = typeof s.now === "number" ? s.now - Date.now() : 0;
          try { onState(s); } catch (_) {}
        });
        OBS._es = es;
      } catch (e) { /* not served by our server — stay static */ }
    };
    /* Open after `load` so the SSE connection doesn't pin the browser/OBS
       tab in a perpetual "loading" state. */
    if (document.readyState === "complete") setTimeout(open, 0);
    else window.addEventListener("load", () => setTimeout(open, 0));
  };

  /* ---------- Boot ---------- */
  OBS.boot = function () {
    applyAccent();
    fit();
    const stage = document.querySelector(".stage");
    if (stage && OBS.isDemo) stage.dataset.demo = "1";
    OBS.applyTopic();
    document.querySelectorAll(".clock").forEach(OBS.startClock);
  };

  window.OBS = OBS;
})();

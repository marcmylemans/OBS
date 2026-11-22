/* ================================================================
   Control room — configure the scenes, copy OBS URLs, and (with Live
   push on) steer already-open sources over the server's live channel.
   ================================================================ */
(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- scene catalogue ---------- */
  const GROUPS = [
    { id: "standby", title: "Standby", note: "Full-screen. Shown before, between and after the stream.", cols: 3, scenes: [
      { f: "Starting Soon.html", t: "Starting Soon", s: "Counts down to the start of the stream.", tag: "standby" },
      { f: "Be Right Back.html", t: "Be Right Back", s: "Counts down to when you are back.", tag: "standby" },
      { f: "Ending Stream.html", t: "Ending Stream", s: "Thanks, your site and your socials.", tag: "standby" }
    ] },
    { id: "live", title: "Streaming", note: "Transparent overlays with chat frame, now playing, LIVE badge and clock.", cols: 2, scenes: [
      { f: "Just Chatting (Stream).html", t: "Just Chatting", s: "Camera full screen with a chat dock and your nameplate.", tag: "live" },
      { f: "Screenshare + Webcam (Stream).html", t: "Screensharing + Webcam", s: "Screen on the left, chat and camera in a rail on the right.", tag: "live" }
    ] },
    { id: "rec", title: "Recording", note: "Transparent overlays, deliberately minimal so footage stays reusable.", cols: 3, scenes: [
      { f: "Just Chatting (Record).html", t: "Just Chatting", s: "Camera full screen with brand mark and nameplate.", tag: "rec" },
      { f: "Screenshare + Webcam (Record).html", t: "Screensharing + Webcam", s: "Screen on the left, camera bottom right.", tag: "rec" },
      { f: "Screenshare (Record).html", t: "Screensharing", s: "Screen only, with a small brand chip.", tag: "rec" }
    ] }
  ];
  const TAG = { standby: "Standby", live: "Live", rec: "Record" };

  /* Where the user's own OBS sources go (1920×1080 units; scaled by canvas). */
  const PLACEMENT = [
    ["Just Chatting (both)", "Camera", 0, 0, 1920, 1080],
    ["Just Chatting (Stream)", "Chat widget", 1458, 352, 396, 528],
    ["Screensharing + Webcam (both)", "Screen capture", 36, 84, 1392, 960],
    ["Screensharing + Webcam (both)", "Camera", 1452, 801, 432, 243],
    ["Screensharing + Webcam (Stream)", "Chat widget", 1470, 136, 396, 635],
    ["Screensharing (Record)", "Screen capture", 0, 0, 1920, 1080]
  ];

  /* ---------- settings (remembered in this browser) ---------- */
  const STORE = "obs-control-room";
  const cfg = { mode: "mins", mins: 10, until: "20:30", topic: "", track: "", v: 1, live: false, canvas: "1" };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (e) {}
  cfg.v = [1, 2, 3].includes(+cfg.v) ? +cfg.v : 1;
  cfg.mins = Math.min(180, Math.max(1, parseInt(cfg.mins, 10) || 10));
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) {} };

  /* ---------- brand ---------- */
  const brand = window.OBS_BRAND || {};
  if (brand.brandName) $("brandName").textContent = brand.brandName;
  if (brand.logo) $("brandLogo").src = brand.logo;
  const acc = brand.accent || {};
  if (acc.from && acc.to) {
    const r = document.documentElement.style;
    r.setProperty("--blue-600", acc.from); r.setProperty("--blue-500", acc.from);
    r.setProperty("--blue-400", acc.to); r.setProperty("--sky-400", acc.to);
    r.setProperty("--grad-primary", `linear-gradient(135deg, ${acc.from}, ${acc.to})`);
  }

  /* ---------- URLs ---------- */
  const isStandby = (sc) => sc.tag === "standby";
  function query(sc) {
    const p = new URLSearchParams();
    if (isStandby(sc)) {
      p.set("v", cfg.v);
      if (sc.f !== "Ending Stream.html") {
        if (cfg.mode === "until" && cfg.until) p.set("until", cfg.until);
        else p.set("mins", cfg.mins);
      }
    } else {
      if (cfg.topic) p.set("topic", cfg.topic);
      if (cfg.track && sc.tag === "live") p.set("track", cfg.track);
    }
    return p.toString();
  }
  const file = (sc) => encodeURI(sc.f);
  function obsUrl(sc) {                       // absolute, paste-ready
    const q = query(sc);
    return new URL(file(sc), location.href).href + (q ? "?" + q : "");
  }
  function previewUrl(sc) {                   // adds the demo backdrop on transparent scenes
    const q = query(sc);
    /* demo=1 also keeps previews off the live channel, so they are not
       counted as open sources and never react to a push meant for OBS. */
    return file(sc) + "?demo=1" + (q ? "&" + q : "");
  }

  /* ---------- copy (works on plain-http LAN addresses too) ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fall through to the legacy path */ }
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    return ok;
  }

  /* ---------- scene cards ---------- */
  const cards = [];
  function build() {
    const host = $("scenes");
    for (const g of GROUPS) {
      const sec = document.createElement("section");
      sec.className = "group";
      sec.innerHTML = `
        <div class="grouphead"><h2>${g.title}</h2><p>${g.note}</p></div>
        <div class="grid cols-${g.cols}"></div>`;
      const grid = sec.querySelector(".grid");
      for (const sc of g.scenes) {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
          <a class="thumb" target="_blank" rel="noopener" aria-label="Open ${sc.t} (${TAG[sc.tag]}) in a new tab">
            <iframe title="${sc.t} preview" scrolling="no" tabindex="-1" loading="lazy"></iframe>
          </a>
          <div class="meta">
            <div class="titlerow"><h3>${sc.t}</h3><span class="tag ${sc.tag}">${TAG[sc.tag]}</span></div>
            <p class="sub">${sc.s}</p>
            <div class="actions">
              <button type="button" class="btn primary" data-copy>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <span data-copy-label>Copy URL</span>
              </button>
              <input class="urlout" readonly aria-label="${sc.t} URL for OBS" spellcheck="false"/>
            </div>
          </div>`;
        const c = {
          sc, el: card, iframe: card.querySelector("iframe"), link: card.querySelector(".thumb"),
          url: card.querySelector(".urlout"), copy: card.querySelector("[data-copy]"),
          label: card.querySelector("[data-copy-label]"), src: null
        };
        c.url.addEventListener("focus", () => c.url.select());
        c.copy.addEventListener("click", async () => {
          const ok = await copyText(obsUrl(sc));
          c.label.textContent = ok ? "Copied" : "Select the URL and copy it";
          c.copy.classList.toggle("done", ok);
          if (!ok) { c.url.focus(); c.url.select(); }
          clearTimeout(c.t);
          c.t = setTimeout(() => { c.label.textContent = "Copy URL"; c.copy.classList.remove("done"); }, 1800);
        });
        cards.push(c);
        grid.appendChild(card);
      }
      host.appendChild(sec);
    }
  }

  /* Reload a preview only when its own URL changed, so typing a topic
     doesn't restart the countdown previews (and vice versa). */
  function refresh() {
    for (const c of cards) {
      const src = previewUrl(c.sc);
      c.url.value = obsUrl(c.sc);
      c.link.href = src;
      if (src !== c.src) { c.src = src; c.iframe.src = src; }
    }
  }

  /* ---------- placement table + canvas-specific copy ---------- */
  function renderCanvas() {
    const k = parseFloat(cfg.canvas) || 1;
    const px = (n) => Math.round(n * k);
    const w = px(1920), h = px(1080);
    document.querySelectorAll(".js-w").forEach((e) => { e.textContent = w; });
    document.querySelectorAll(".js-h").forEach((e) => { e.textContent = h; });
    document.querySelectorAll(".js-canvas").forEach((e) => { e.textContent = `${w} × ${h}`; });
    $("placement").innerHTML = PLACEMENT.map(([scene, src, x, y, pw, ph]) =>
      `<tr><th scope="row">${scene}</th><td>${src}</td><td class="n">${px(x)}</td><td class="n">${px(y)}</td><td class="n">${px(pw)}</td><td class="n">${px(ph)}</td></tr>`
    ).join("");
  }

  /* ---------- live push ---------- */
  let scenesOpen = null;
  function push(extra) {
    if (!cfg.live) return;
    fetch("/api/state", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: cfg.topic, variant: cfg.v,
        countdown: { mode: cfg.mode, mins: cfg.mins, until: cfg.until, ...(extra || {}) }
      })
    }).then((r) => { if (!r.ok) throw new Error(); setStatus(); })
      .catch(() => setStatus("offline"));
  }

  function setStatus(force) {
    const el = $("status"), txt = $("statusText");
    if (force === "offline" || scenesOpen === null) {
      el.dataset.state = force === "offline" ? "offline" : "idle";
      txt.textContent = force === "offline" ? "Server not reachable" : "Checking for open scenes…";
    } else {
      el.dataset.state = scenesOpen > 0 ? "on" : "idle";
      txt.textContent = scenesOpen === 0 ? "No scenes open in OBS yet"
        : `${scenesOpen} scene ${scenesOpen === 1 ? "source" : "sources"} connected`;
    }
    $("console").classList.toggle("is-live", cfg.live);
    $("cdRestart").disabled = !cfg.live || cfg.mode !== "mins";
    $("liveHint").textContent = cfg.live
      ? (scenesOpen ? `On. Topic, layout and countdown go straight to ${scenesOpen} open ${scenesOpen === 1 ? "source" : "sources"}.`
                    : "On. Changes reach scenes as soon as they are open in OBS.")
      : "Off. Changes only affect the previews and the URLs you copy.";
  }
  async function poll() {
    try {
      const d = await (await fetch("/healthz", { cache: "no-store" })).json();
      scenesOpen = typeof d.scenes === "number" ? d.scenes : d.clients;
      setStatus();
    } catch (e) { setStatus("offline"); }
  }

  /* ---------- wiring ---------- */
  let t;
  const changed = (delay) => {
    save();
    clearTimeout(t);
    t = setTimeout(() => { refresh(); push(); }, delay || 0);
  };
  const pressed = (group, attr, val) =>
    group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === String(val))));

  function syncControls() {
    $("topic").value = cfg.topic; $("track").value = cfg.track;
    $("mins").value = cfg.mins; $("until").value = cfg.until;
    $("canvas").value = cfg.canvas; $("livePush").checked = !!cfg.live;
    $("topicClear").hidden = !cfg.topic;
    $("mins").hidden = cfg.mode !== "mins"; $("until").hidden = cfg.mode !== "until";
    pressed($("segMode"), "mode", cfg.mode); pressed($("segV"), "v", cfg.v);
  }

  $("topic").addEventListener("input", (e) => { cfg.topic = e.target.value; $("topicClear").hidden = !cfg.topic; changed(350); });
  $("topicClear").addEventListener("click", () => { cfg.topic = ""; syncControls(); $("topic").focus(); changed(); });
  $("track").addEventListener("input", (e) => { cfg.track = e.target.value; changed(350); });
  $("mins").addEventListener("input", (e) => {
    const n = parseInt(e.target.value, 10);
    if (n >= 1 && n <= 180) { cfg.mins = n; changed(350); }
  });
  $("mins").addEventListener("blur", () => { $("mins").value = cfg.mins; });
  $("until").addEventListener("input", (e) => { if (e.target.value) { cfg.until = e.target.value; changed(350); } });
  $("segMode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.mode = b.dataset.mode; syncControls(); setStatus(); changed();
  });
  $("segV").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    cfg.v = +b.dataset.v; syncControls(); changed();
  });
  $("cdRestart").addEventListener("click", () => {
    push({ restart: true });
    const b = $("cdRestart"); b.textContent = "Restarted";
    setTimeout(() => { b.textContent = "Restart"; }, 1500);
  });
  $("livePush").addEventListener("change", (e) => { cfg.live = e.target.checked; save(); setStatus(); push(); });
  $("canvas").addEventListener("change", (e) => { cfg.canvas = e.target.value; save(); renderCanvas(); });

  build();
  syncControls();
  refresh();
  renderCanvas();
  setStatus();
  poll(); setInterval(poll, 3000);
  push();
})();

/* ================================================================
   Live / Record scene renderer.
   renderScene({ scene, mode:'talk'|'share', layout, cam, live, record,
                 chat, nowplaying, topic, name, role })
   ================================================================ */

/* ---- sample chat (preview only) ---- */
const DEMO_CHAT = [
  { u: "k3vin_homelab", c: "#60a5fa", t: "that proxmox tip just saved my cluster" },
  { u: "NoraOps",       c: "#38bdf8", t: "which NIC are you passing through?" },
  { u: "Marc",          c: "#ffffff", badge: "host", bt: "HOST", t: "VirtIO - config coming up in a sec" },
  { u: "switch_kid",    c: "#a78bfa", t: "VLAN 30 represent" },
  { u: "ModBot",        c: "#56d364", badge: "mod",  bt: "MOD",  t: "Welcome in - keep it friendly!" }
];

function chatPanel(extraClass) {
  const icon = '<span class="ci"><svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z"/></svg></span>';
  const body = OBS.isDemo
    ? DEMO_CHAT.map((d) =>
        `<div class="msg">${d.badge ? `<span class="badge ${d.badge}">${d.bt}</span>` : ""}` +
        `<span class="u" style="color:${d.c}">${d.u}</span><span class="t">${d.t}</span></div>`
      ).join("")
    : "";
  return `<div class="chat ${extraClass || ""}">
      <div class="chat-head">${icon}<b>Live chat</b><span class="src">YouTube</span></div>
      <div class="chat-body">${body}</div>
    </div>`;
}

function nowPlayingChip() {
  return `<div class="nowplaying" data-np style="display:none">
      <div class="np-eq"><i></i><i></i><i></i><i></i></div>
      <div class="np-text"><span class="np-k">Now playing</span><span class="np-track"></span></div>
    </div>`;
}

/* recording rail: clean info card where chat would sit on a stream.
   The "Now covering" block stays in the DOM (hidden when no topic) so the
   live channel can show/update it. */
function railInfo(topic) {
  const hide = topic ? "" : ' style="display:none"';
  return `<div class="rail-info">
      <div class="ri-topic js-topic-wrap"${hide}>
        <span class="k">Now covering</span>
        <span class="v js-topic">${topic}</span>
      </div>
      <div class="ri-div js-topic-wrap"${hide}></div>
      <div class="ri-socials">${OBS.socialChips()}</div>
      <div class="ri-brand">
        <div class="brandmark">
          <img src="assets/logo-dark.png" alt=""/>
          <div class="wm"><b>${OBS.brand.brandName}</b><span>${OBS.brand.site}</span></div>
        </div>
      </div>
    </div>`;
}

/* reads ?track=, else polls a sibling now-playing.txt every 5s. Hides when
   empty. Returns { set, locked }; the live channel drives set() unless a
   fixed ?track was supplied. */
function setupNowPlaying() {
  const el = document.querySelector("[data-np]");
  if (!el) return null;
  const track = el.querySelector(".np-track");
  const set = (txt) => {
    txt = (txt || "").trim();
    if (txt) { track.textContent = txt; el.style.display = ""; }
    else { el.style.display = "none"; }
  };
  if (OBS.isDemo) { set(OBS.q("track", "Tycho - Awake")); return { set, locked: true }; }
  const param = OBS.q("track", null);
  if (param != null) { set(param); return { set, locked: true }; }
  async function poll() {
    try {
      const r = await fetch("now-playing.txt?_=" + Date.now(), { cache: "no-store" });
      if (r.ok) set(await r.text());
    } catch (e) { /* no file yet - stay hidden */ }
  }
  poll();
  setInterval(poll, 5000);
  return { set, locked: false };
}

function renderScene(cfg) {
  const stage = document.querySelector(".stage");
  const live = !!cfg.live;
  const isShare = cfg.mode === "share";
  const isRail = cfg.layout === "rail";
  cfg.demo = OBS.isDemo;
  const brand = OBS.brand;

  /* Recording scenes are deliberately minimal: same visual style as the
     streaming scenes, but no REC badge, clock, now-playing or socials - the
     screen + webcam are source-recorded separately. */
  const rec = !live;
  const showNow = live && cfg.nowplaying;

  /* Effective topic: ?topic= URL param overrides the scene default. When a
     topic is set via URL it is "locked" (live updates won't clear it). */
  const topicLocked = OBS.q("topic", null) != null;
  const topic = (OBS.q("topic", cfg.topic || "") || "").trim();

  const clock = `<div class="clock"><span class="dot"></span><span data-t>00:00</span></div>`;
  /* LIVE only on the top bar; nothing on recording. */
  const statusBadge = live
    ? `<div class="live"><span class="pulse"></span><b>LIVE</b></div>`
    : "";

  const brandSmall = `
    <div class="brandmark">
      <img src="assets/logo-dark.png" alt="${brand.brandName}"/>
      <div class="wm"><b>${brand.brandName}</b><span>${brand.tagline}</span></div>
    </div>`;

  /* Topic pill always rendered (hidden when empty) so the live channel can
     show/hide/update it. */
  const topicPill = `
    <div class="topic js-topic-wrap"${topic ? "" : ' style="display:none"'}>
      <span class="k">On screen</span><span class="div"></span>
      <span class="v js-topic">${topic}</span>
    </div>`;

  const nameplate = `
    <div class="nameplate">
      <div class="bar"></div>
      <div class="np-body">
        <span class="np-name">${cfg.name || brand.presenter.name}</span>
        <span class="np-role">${cfg.role || brand.presenter.role}</span>
      </div>
    </div>`;

  const socialChips = `<div class="socials">${OBS.socialChips()}</div>`;
  const socialPills = `<div class="socials">${
    ["youtube","github","bluesky"].map((k)=>{
      const h = OBS.handles[k]; const at = k==="github"||h.startsWith("@") ? "" : "@";
      return `<div class="pill">${OBS.ICON[k]}<span>${at}${h}</span></div>`;
    }).join("")
  }</div>`;

  const camFrame = (pos) => `
    <div class="cam ${pos}">
      <div class="cam-hole"></div>
      <div class="tick tl"></div><div class="tick tr"></div>
      <div class="cam-tab">
        <img class="m" src="assets/logo-dark.png" alt=""/>
        <b>${cfg.name || brand.presenter.name}</b><span>${brand.brandName}</span>
      </div>
    </div>`;

  const deskInner = `
    <div class="scr-desk">
      <div class="tb"><i></i><i></i><i></i></div>
      <div class="code"><span class="p">PS</span> C:\\&gt; <span class="b">Get-Cluster</span> | <span class="b">Get-ClusterNode</span><br/>
      Name         State   Type<br/>
      <span class="g">pve-node-01</span>   Up      Member<br/>
      <span class="g">pve-node-02</span>   Up      Member<br/>
      <span class="g">pve-node-03</span>   Up      Member<br/><br/>
      <span class="p">PS</span> C:\\&gt; <span class="b">New-ADUser</span> -Name <span class="g">"svc-backup"</span> -Enabled $true<br/>
      <span class="p">PS</span> C:\\&gt; _</div>
    </div>`;

  const wordchip = `
    <div class="wordchip">
      <img src="assets/logo-dark.png" alt=""/>
      <b>${cfg.name || brand.brandName}</b><span>${brand.site}</span>
    </div>`;

  let html = "";

  if (isShare && cfg.layout === "minimal") {
    /* ---------- FULL-SCREEN SHARE (no cam) ----------
       Recording: capture fills the whole frame; only a small brand chip
       (and a topic pill that stays hidden unless one is pushed live). */
    html = `
      ${cfg.demo ? '<div class="demo desk"></div>' : ""}
      <div class="mini tl">${topicPill}</div>
      <div class="mini bl">
        <div class="wordchip"><img src="assets/logo-dark.png" alt=""/><b>${brand.brandName}</b><span>${brand.site}</span></div>
      </div>
      ${showNow ? `<div class="mini br">${nowPlayingChip()}</div>` : ""}`;
  } else if (isShare && isRail) {
    /* ---------- OPTIMIZED RAIL SCREENSHARE ----------
       Recording keeps the screen + webcam frames and a minimal brand bar
       (no now-playing / status / clock / info card). */
    html = `
      <div class="brandbar">
        <div class="bb-mark"><img src="assets/logo-dark.png" alt=""/><b>${brand.brandName}</b></div>
        ${topicPill}
        <div class="spacer"></div>
        ${showNow ? nowPlayingChip() : ""}
        ${statusBadge}
        ${live ? clock : ""}
      </div>
      <div class="screen-frame rail-screen">
        ${cfg.demo ? deskInner : ""}
      </div>
      <div class="rail-col">
        ${cfg.chat ? chatPanel() : (rec ? "" : railInfo(topic))}
        ${cfg.cam ? camFrame("") : ""}
      </div>`;
  } else if (isShare) {
    /* ---------- FULL-BLEED SCREENSHARE ---------- */
    html = `
      ${cfg.demo ? `<div class="demo desk"><div class="win main">${deskInner}</div></div>` : ""}
      <div class="brandbar">
        <div class="bb-mark"><img src="assets/logo-dark.png" alt=""/><b>${brand.brandName}</b></div>
        ${topicPill}
        <div class="spacer"></div>
        ${showNow ? nowPlayingChip() : (live ? socialPills : "")}
        ${statusBadge}
        ${live ? clock : ""}
      </div>
      ${cfg.cam ? camFrame("br") : wordchip}`;
  } else {
    /* ---------- TALKING HEAD ----------
       Recording: brand mark + nameplate only (no clock / now-playing / socials). */
    const blStack = `<div class="scene-bl"><div class="stackcol">${showNow ? nowPlayingChip() : ""}${nameplate}</div></div>`;
    const chatDock = cfg.chat ? `<div class="jc-chat">${chatPanel()}</div>` : "";
    const bottomRight = (cfg.chat || rec) ? "" : `<div class="scene-br">${socialChips}</div>`;
    html = `
      ${cfg.demo ? '<div class="demo face"><div class="silhouette"></div></div>' : ''}
      <div class="vignette"></div>
      <div class="scene-top">
        <div>${live ? statusBadge : brandSmall}</div>
        <div class="center">${topicPill}</div>
        ${live ? clock : ""}
      </div>
      ${blStack}
      ${chatDock}
      ${bottomRight}`;
  }

  /* QR overlay: streaming scenes only (never on recording). Sits bottom-left
     on the rail screenshare (clear of the webcam), bottom-right otherwise. */
  const qrCard = live
    ? `<div class="qr-card ${isShare && isRail ? "bl" : "br"}"><div class="qr-img-wrap"><img class="qr-img" alt=""/></div><div class="qr-label"></div></div>`
    : "";

  stage.insertAdjacentHTML("beforeend", html + qrCard +
    `<div class="confighint">URL options: ?topic=… · ?track=Artist - Title (or edit now-playing.txt) · ?qr=URL · ?demo=1</div>`);

  OBS.boot();
  let np = null;
  if (showNow) np = setupNowPlaying();

  /* Live control channel: update topic + now-playing + QR as the control room /
     player push changes (no source refresh needed). topic is an override -
     only applied when non-null, and never when pinned via ?topic=. */
  OBS.connectLive((s) => {
    if (!topicLocked && s.topic != null) OBS.setTopic(s.topic);
    if (np && !np.locked && s.track != null) np.set(s.track);
    if (typeof s.qr !== "undefined") OBS.setQR(s.qr);
  });
}

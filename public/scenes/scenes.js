/* ================================================================
   Live / Record scene renderer.
   renderScene({ scene, mode:'talk'|'share', layout, cam, live, record,
                 chat, nowplaying, topic, name, role })
   ================================================================ */

/* ---- sample chat (preview only) ---- */
const DEMO_CHAT = [
  { u: "k3vin_homelab", c: "#60a5fa", t: "that proxmox tip just saved my cluster" },
  { u: "NoraOps",       c: "#38bdf8", t: "which NIC are you passing through?" },
  { u: "Marc",          c: "#ffffff", badge: "host", bt: "HOST", t: "VirtIO — config coming up in a sec" },
  { u: "switch_kid",    c: "#a78bfa", t: "VLAN 30 represent" },
  { u: "ModBot",        c: "#56d364", badge: "mod",  bt: "MOD",  t: "Welcome in — keep it friendly!" }
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

/* recording rail: clean info card where chat would sit on a stream */
function railInfo(cfg) {
  return `<div class="rail-info">
      <div class="ri-topic">
        <span class="k">Now covering</span>
        <span class="v" data-topic="${cfg.topic || ""}">${cfg.topic || "This session"}</span>
      </div>
      <div class="ri-div"></div>
      <div class="ri-socials">${OBS.socialChips()}</div>
      <div class="ri-brand">
        <div class="brandmark">
          <img src="assets/logo-dark.png" alt=""/>
          <div class="wm"><b>Mylemans Online</b><span>mylemans.online</span></div>
        </div>
      </div>
    </div>`;
}

/* reads ?track=, else polls a sibling now-playing.txt every 5s. Hides when empty. */
function setupNowPlaying() {
  const el = document.querySelector("[data-np]");
  if (!el) return;
  const track = el.querySelector(".np-track");
  const set = (txt) => {
    txt = (txt || "").trim();
    if (txt) { track.textContent = txt; el.style.display = ""; }
    else { el.style.display = "none"; }
  };
  if (OBS.isDemo) { set(OBS.q("track", "Tycho — Awake")); return; }
  const param = OBS.q("track", null);
  if (param) { set(param); return; }
  async function poll() {
    try {
      const r = await fetch("now-playing.txt?_=" + Date.now(), { cache: "no-store" });
      if (r.ok) set(await r.text());
    } catch (e) { /* no file yet — stay hidden */ }
  }
  poll();
  setInterval(poll, 5000);
}

function renderScene(cfg) {
  const stage = document.querySelector(".stage");
  const live = !!cfg.live;
  const isShare = cfg.mode === "share";
  const isRail = cfg.layout === "rail";
  cfg.demo = OBS.isDemo;

  const clock = `<div class="clock"><span class="dot"></span><span data-t>00:00</span></div>`;
  const statusBadge = live
    ? `<div class="live"><span class="pulse"></span><b>LIVE</b></div>`
    : `<div class="rec"><span class="rdot"></span><b>REC</b></div>`;

  const brandSmall = `
    <div class="brandmark">
      <img src="assets/logo-dark.png" alt="Mylemans Online"/>
      <div class="wm"><b>Mylemans Online</b><span>Homelab · Automation</span></div>
    </div>`;

  const topicPill = `
    <div class="topic">
      <span class="k">On screen</span><span class="div"></span>
      <span class="v" data-topic="${cfg.topic || ""}">${cfg.topic || "Live session"}</span>
    </div>`;

  const nameplate = `
    <div class="nameplate">
      <div class="bar"></div>
      <div class="np-body">
        <span class="np-name">${cfg.name || "Marc Mylemans"}</span>
        <span class="np-role">${cfg.role || "Systems Engineer · Mylemans Online"}</span>
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
      ${live ? '<div class="cam-live"><span class="pulse"></span><b>LIVE</b></div>' : ''}
      <div class="cam-tab">
        <img class="m" src="assets/logo-dark.png" alt=""/>
        <b>${cfg.name || "Marc Mylemans"}</b><span>Mylemans Online</span>
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

  let html = "";

  if (isShare && cfg.layout === "minimal") {
    /* ---------- FULL-SCREEN SHARE (no cam) — corner chrome only ---------- */
    html = `
      ${cfg.demo ? `<div class="demo desk"><div class="win main">${deskInner}</div></div>` : ""}
      <div class="mini tl">
        <div class="topic">
          <span class="k">On screen</span><span class="div"></span>
          <span class="v" data-topic="${cfg.topic || ""}">${cfg.topic || "Live session"}</span>
        </div>
      </div>
      <div class="mini tr">
        <div class="statusmini clock"><span class="rdot"></span><b>REC</b><span class="div"></span><span class="t" data-t>00:00</span></div>
      </div>
      <div class="mini bl">
        <div class="wordchip"><img src="assets/logo-dark.png" alt=""/><b>Mylemans Online</b><span>mylemans.online</span></div>
      </div>
      ${cfg.nowplaying ? `<div class="mini br">${nowPlayingChip()}</div>` : ""}`;
  } else if (isShare && isRail) {
    /* ---------- OPTIMIZED RAIL SCREENSHARE ---------- */
    html = `
      <div class="brandbar">
        <div class="bb-mark"><img src="assets/logo-dark.png" alt=""/><b>Mylemans Online</b></div>
        ${topicPill}
        <div class="spacer"></div>
        ${cfg.nowplaying ? nowPlayingChip() : ""}
        ${statusBadge}
        ${clock}
      </div>
      <div class="screen-frame rail-screen">
        ${cfg.demo ? deskInner : '<div class="scr-label">Screen capture<br/>scale your display source to fill</div>'}
      </div>
      <div class="rail-col">
        ${cfg.chat ? chatPanel() : railInfo(cfg)}
        ${cfg.cam ? camFrame("") : ""}
      </div>`;
  } else if (isShare) {
    /* ---------- FULL-BLEED SCREENSHARE (recording) ---------- */
    html = `
      ${cfg.demo ? `<div class="demo desk"><div class="win main">${deskInner}</div></div>` : ""}
      <div class="brandbar">
        <div class="bb-mark"><img src="assets/logo-dark.png" alt=""/><b>Mylemans Online</b></div>
        ${topicPill}
        <div class="spacer"></div>
        ${cfg.nowplaying ? nowPlayingChip() : socialPills}
        ${statusBadge}
        ${clock}
      </div>
      ${cfg.cam ? camFrame("br") : `
        <div class="wordchip">
          <img src="assets/logo-dark.png" alt=""/>
          <b>${cfg.name || "Marc Mylemans"}</b><span>mylemans.online</span>
        </div>`}`;
  } else {
    /* ---------- TALKING HEAD ---------- */
    const blStack = `<div class="scene-bl"><div class="stackcol">${cfg.nowplaying ? nowPlayingChip() : ""}${nameplate}</div></div>`;
    const chatDock = cfg.chat ? `<div class="jc-chat">${chatPanel()}</div>` : "";
    const bottomRight = cfg.chat ? "" : `<div class="scene-br">${socialChips}</div>`;
    html = `
      ${cfg.demo ? '<div class="demo face"><div class="silhouette"></div></div>' : ''}
      <div class="vignette"></div>
      <div class="scene-top">
        <div>${live ? statusBadge : brandSmall}</div>
        <div class="center">${topicPill}</div>
        ${clock}
      </div>
      ${blStack}
      ${chatDock}
      ${bottomRight}`;
  }

  stage.insertAdjacentHTML("beforeend", html +
    `<div class="confighint">URL options: ?topic=… · ?track=Artist - Title (or edit now-playing.txt) · ?demo=1</div>`);

  OBS.boot();
  if (cfg.nowplaying) setupNowPlaying();
}

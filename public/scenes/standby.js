/* ================================================================
   Standby renderer — builds the active variant for a standby scene.
   Usage:  renderStandby({ eyebrow, title, subtext, countdown, done, mins });
   ================================================================ */
function renderStandby(cfg) {
  const v = OBS.variant;                       // 1 | 2 | 3
  const stage = document.querySelector(".stage");
  stage.classList.add("v" + v, "filled");

  const brandmark = `
    <div class="brandmark">
      <img src="assets/logo-dark.png" alt="Mylemans Online"/>
      <div class="wm"><b>Mylemans Online</b><span>Homelab · Windows Server · Automation</span></div>
    </div>`;

  const clock = `<div class="clock"><span class="dot"></span><span data-t>00:00</span></div>`;
  const socials = `<div class="socials">${OBS.socialChips()}</div>`;

  const eyebrow = `<div class="eyebrow">${cfg.eyebrow}</div>`;
  const title = `<h1 class="title">${cfg.title}</h1>`;
  const subtext = cfg.subtext ? `<p class="subtext">${cfg.subtext}</p>` : "";
  const countdown = cfg.countdown
    ? `<div class="cd-wrap"><span class="cd-label">${cfg.cdLabel || "Starts in"}</span><div class="countdown" id="cd"></div></div>`
    : "";

  let mid = "";
  if (v === 3) {
    mid = `
      <div class="mid">
        <div class="card">
          ${eyebrow}${title}${countdown}${subtext}
          <div class="divider"></div>
          ${socials}
        </div>
      </div>`;
  } else if (v === 2) {
    mid = `
      <div class="watermark"><img src="assets/logo-dark.png" alt=""/></div>
      <div class="mid">${eyebrow}${title}${countdown}${subtext}</div>
      <div class="bottom">${socials}</div>`;
  } else {
    mid = `
      <div class="mid">${eyebrow}${title}${countdown}${subtext}</div>
      <div class="bottom">${socials}</div>`;
  }

  stage.insertAdjacentHTML("beforeend", `
    <div class="ambient"></div>
    ${v === 3 ? '<div class="dotgrid"></div>' : ""}
    <div class="sb">
      <div class="top">${brandmark}${clock}</div>
      ${mid}
    </div>
    <div class="confighint">Configure via URL: ?v=1|2|3 · ?mins=10 or ?until=20:30 · ?topic=… · ?demo=1</div>
  `);

  OBS.boot();
  if (cfg.countdown) {
    OBS.startCountdown(document.getElementById("cd"), {
      scene: cfg.scene, mins: cfg.mins, done: cfg.done
    });
  }
}

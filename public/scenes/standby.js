/* ================================================================
   Standby renderer - builds the active variant for a standby scene.
   Usage:  renderStandby({ eyebrow, title, subtext, countdown, done, mins });
   The live control channel can switch variant and reset the countdown
   without an OBS source refresh.
   ================================================================ */
function buildStandby(cfg, v) {
  const stage = document.querySelector(".stage");
  stage.innerHTML = "";
  stage.className = "stage v" + v + " filled";

  const brand = OBS.brand;
  const brandmark = `
    <div class="brandmark">
      <img src="assets/logo-dark.png" alt="${brand.brandName}"/>
      <div class="wm"><b>${brand.brandName}</b><span>${brand.standbyTagline}</span></div>
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
    <div class="qr-card br"><div class="qr-img-wrap"><img class="qr-img" alt=""/></div><div class="qr-label"></div></div>
    <div class="confighint">Configure via URL: ?v=1|2|3 · ?mins=10 or ?until=20:30 · ?qr=URL · ?demo=1</div>
  `);

  OBS.boot();
  if (cfg.countdown) {
    OBS.startCountdown(document.getElementById("cd"), {
      scene: cfg.scene, mins: cfg.mins, done: cfg.done
    });
  }
}

function renderStandby(cfg) {
  buildStandby(cfg, OBS.variant);

  /* A baked ?v= pins the layout; live pushes won't override it. */
  const variantLocked = OBS.q("v", null) != null;
  let lastCd = null;

  /* Live control: switch standby layout and reset the countdown on the fly.
     variant/countdown are overrides - only applied when non-null, and the
     countdown is only reset when it actually changes (so a topic edit in the
     control room doesn't keep restarting the timer). */
  OBS.connectLive((s) => {
    if (!variantLocked && s.variant != null && s.variant !== OBS.variant) {
      OBS.variant = s.variant;
      buildStandby(cfg, OBS.variant);     // rebuild; countdown resumes via localStorage
    }
    if (cfg.countdown && s.countdown != null && OBS._cdCtl) {
      const key = JSON.stringify(s.countdown);
      if (key !== lastCd) {
        lastCd = key;
        OBS._cdCtl.set({ mode: s.countdown.mode, mins: s.countdown.mins, until: s.countdown.until, done: cfg.done });
      }
    }
    if (typeof s.qr !== "undefined") OBS.setQR(s.qr);   // applied after any rebuild above
  });
}

/* ================================================================
   Standby renderer — builds the active variant for a standby scene.
   Usage:  renderStandby({ eyebrow, title, subtext, countdown, done, mins, cta });
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
      <img src="${OBS.logo}" alt=""/>
      <div class="wm"><b>${OBS.esc(brand.brandName)}</b><span>${OBS.esc(brand.standbyTagline)}</span></div>
    </div>`;

  const clock = `<div class="clock"><span class="dot"></span><span data-t>00:00</span></div>`;
  const socials = `<div class="socials">${OBS.socialChips()}</div>`;

  const eyebrow = `<div class="eyebrow">${cfg.eyebrow}</div>`;
  const title = `<h1 class="title">${cfg.title}</h1>`;
  const subtext = cfg.subtext ? `<p class="subtext">${cfg.subtext}</p>` : "";
  /* Scenes without a countdown (Ending Stream) fill the same slot with a
     call to action, so all three layouts keep their weight in the middle. */
  const countdown = cfg.countdown
    ? `<div class="cd-wrap"><span class="cd-label">${cfg.cdLabel || "Starts in"}</span><div class="countdown" id="cd"></div></div>`
    : (cfg.cta ? `<div class="cd-wrap"><span class="cd-label">${cfg.cta}</span><div class="cta-site">${OBS.esc(brand.site)}</div></div>` : "");

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
      <div class="watermark"><img src="${OBS.logo}" alt=""/></div>
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
    <div class="confighint">Configure via URL: ?v=1|2|3 · ?mins=10 or ?until=20:30 · ?demo=1</div>
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

  /* ?v= is the layout a source starts with. A live push from the control
     room or Stream Deck still switches it (nothing is pushed until someone
     actually changes the layout there), so copied URLs stay steerable. */
  let lastCd = null;

  /* Live control: switch standby layout and reset the countdown on the fly.
     variant/countdown are overrides — only applied when non-null, and the
     countdown is only reset when it actually changes (so a topic edit in the
     control room doesn't keep restarting the timer). */
  OBS.connectLive((s) => {
    if (s.variant != null && s.variant !== OBS.variant) {
      const running = cfg.countdown && OBS._cdCtl ? OBS._cdCtl.target : null;
      OBS.variant = s.variant;
      buildStandby(cfg, OBS.variant);
      if (running != null && OBS._cdCtl) OBS._cdCtl.set({ target: running, done: cfg.done });   // keep the clock running across the rebuild
    }
    if (cfg.countdown && s.countdown != null && OBS._cdCtl) {
      const key = JSON.stringify(s.countdown);
      if (key !== lastCd) {
        lastCd = key;
        const c = s.countdown;
        if (c.mode === "mins" && typeof c.target === "number") {
          /* Count down to the server's end time (converted to this clock). A
             target that already passed is a leftover from an earlier segment:
             ignore it so the scene keeps its own ?mins= behaviour. */
          const local = c.target - (s.clockOffset || 0);
          if (local > Date.now() - 5000) OBS._cdCtl.set({ mode: "mins", mins: c.mins, target: local, done: cfg.done });
        } else {
          OBS._cdCtl.set({ mode: c.mode, mins: c.mins, until: c.until, done: cfg.done });
        }
      }
    }
  });
}

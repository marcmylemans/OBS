/* ================================================================
   Mylemans Online — OBS Overlay System :: shared engine
   ================================================================ */
(function () {
  const OBS = {};

  /* ---------- URL params ---------- */
  const Q = new URLSearchParams(location.search);
  OBS.q = (k, d) => (Q.has(k) ? Q.get(k) : d);
  OBS.isDemo = Q.get("demo") === "1";

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
    bluesky: '<svg viewBox="0 0 600 600"><path d="M300 0c83 0 150 67 150 150s-67 150-150 150S150 233 150 150 217 0 300 0zM78 522c-17-19-25-44-25-75 0-61 51-113 113-113h268c62 0 113 52 113 113 0 31-8 56-25 75-18 20-41 30-69 30H147c-28 0-51-10-69-30z"/></svg>'
  };

  /* default handles (overridable via URL ?yt= &gh= &bs= ) */
  OBS.handles = {
    youtube: OBS.q("yt", "@mylemansonline"),
    github:  OBS.q("gh", "mylemansonline"),
    bluesky: OBS.q("bs", "mylemans.online")
  };

  OBS.socialChips = function (which) {
    const list = which || ["youtube", "github", "bluesky"];
    return list.map((k) => {
      const h = OBS.handles[k];
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
  */
  OBS.startCountdown = function (el, opts) {
    opts = opts || {};
    const sceneKey = "obs-cd-" + (opts.scene || location.pathname);
    const doneText = OBS.q("done", opts.done || "Starting now");

    function resolveTarget() {
      const to = OBS.q("to", null);
      if (to) { const t = Date.parse(to); if (!isNaN(t)) return t; }

      const until = OBS.q("until", null);
      if (until && /^\d{1,2}:\d{2}$/.test(until)) {
        const [h, m] = until.split(":").map(Number);
        const t = new Date();
        t.setHours(h, m, 0, 0);
        if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
        return t.getTime();
      }

      const mins = parseFloat(OBS.q("mins", opts.mins != null ? opts.mins : "10"));
      // persist so an OBS source refresh continues the same countdown
      try {
        const saved = JSON.parse(localStorage.getItem(sceneKey) || "null");
        if (saved && saved.mins === mins && saved.target > Date.now() - 2000) return saved.target;
        const target = Date.now() + mins * 60 * 1000;
        localStorage.setItem(sceneKey, JSON.stringify({ mins, target }));
        return target;
      } catch (e) {
        return Date.now() + mins * 60 * 1000;
      }
    }

    let target = resolveTarget();

    function render() {
      let ms = target - Date.now();
      if (ms <= 0) {
        el.classList.add("count-done");
        el.innerHTML = doneText;
        return;
      }
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
    setInterval(render, 1000);
  };

  /* ---------- Topic text (?topic=...) ---------- */
  OBS.applyTopic = function () {
    const topic = OBS.q("topic", null);
    document.querySelectorAll("[data-topic]").forEach((el) => {
      if (topic) el.textContent = topic;
      else if (el.dataset.topic) el.textContent = el.dataset.topic; // fallback default
    });
  };

  /* ---------- Variant (?v=1|2|3) ---------- */
  OBS.variant = parseInt(OBS.q("v", "1"), 10) || 1;

  /* ---------- Boot ---------- */
  OBS.boot = function () {
    fit();
    const stage = document.querySelector(".stage");
    if (stage && OBS.isDemo) stage.dataset.demo = "1";
    OBS.applyTopic();
    document.querySelectorAll(".clock").forEach(OBS.startClock);
  };

  window.OBS = OBS;
})();

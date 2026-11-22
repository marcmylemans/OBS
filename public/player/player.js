/* ================================================================
   Music player logic — scans /api/tracks, plays audio, and pushes
   the current "Artist — Title" to the OBS Now Playing chip.
   ================================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const listEl = $("tracklist");
  const searchEl = $("search");
  const seekbar = $("seekbar");
  const volume = $("volume");

  let tracks = [];          // full library
  let view = [];            // filtered view shown in the list
  let rows = [];            // row elements, parallel to `view`
  let current = -1;         // index into `view`
  let playing = null;       // the track object that is loaded
  let shuffle = false;
  let repeat = false;
  let lastPushed = null;    // last text sent to the stream
  let failures = 0;         // consecutive tracks that failed to play

  const store = {
    get(k, d) { try { const v = localStorage.getItem("obs-player-" + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("obs-player-" + k, v); } catch (e) {} }
  };

  /* ---------- brand (logo + accent from config.json) ---------- */
  const brand = window.OBS_BRAND || {};
  if (brand.logo) $("brandLogo").src = /^(https?:)?\//.test(brand.logo) ? brand.logo : "/scenes/" + brand.logo;
  if (brand.accent && brand.accent.from && brand.accent.to) {
    document.documentElement.style.setProperty("--acc-from", brand.accent.from);
    document.documentElement.style.setProperty("--acc-to", brand.accent.to);
  }

  /* ---------- helpers ---------- */
  const fmt = (s) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };
  const fmtTotal = (s) => {
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  const label = (t) => (t.artist ? `${t.artist} — ${t.title}` : t.title);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const coverUrl = (t) => "/api/cover?path=" + encodeURIComponent(t.path);
  const setFill = (el, pct) => el.style.setProperty("--fill", pct + "%");

  let noticeTimer;
  function notice(msg) {
    const n = $("notice");
    n.textContent = msg; n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.hidden = true; }, 6000);
  }

  /* ---------- "on stream" status + push ---------- */
  function showStatus(text) {
    const el = $("np-status");
    el.className = "np-status " + (text ? "on" : "off");
    $("np-status-text").textContent = text ? "On stream: " + text : "Nothing on stream";
  }
  async function pushNowPlaying(text) {
    if (text === lastPushed) return;
    lastPushed = text;
    showStatus(text);
    try {
      const r = await fetch("/api/now-playing", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
      });
      if (!r.ok) throw new Error();
    } catch (e) {
      lastPushed = null;      // retry on the next state change
      notice("Couldn’t update Now playing on the stream. The server didn’t answer.");
    }
  }

  /* ---------- library rendering ---------- */
  const STATES = ["loading", "empty", "nomatch", "failed"];
  function showState(which) {
    for (const s of STATES) $(s).hidden = s !== which;
    listEl.hidden = !!which;
    document.querySelector(".lib-head").style.visibility = which ? "hidden" : "";
  }

  function render() {
    listEl.textContent = "";
    rows = [];
    const q = searchEl.value.trim();
    if (!tracks.length) { $("summary").textContent = ""; showState("empty"); return; }
    if (!view.length) { $("nomatchTerm").textContent = q; $("summary").textContent = ""; showState("nomatch"); return; }
    showState(null);

    const total = view.reduce((n, t) => n + (t.duration || 0), 0);
    $("summary").textContent =
      (q ? `${view.length} of ${tracks.length} tracks` : `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"}`) +
      (total ? `, ${fmtTotal(total)}` : "");

    const frag = document.createDocumentFragment();
    view.forEach((t, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "row";
      row.setAttribute("role", "listitem");
      const cover = t.hasCover
        ? `<img class="r-cover" src="${coverUrl(t)}" alt="" loading="lazy"/>`
        : `<div class="r-cover" aria-hidden="true">♪</div>`;
      row.innerHTML = `
        <div class="r-num" aria-hidden="true">
          <span class="num">${i + 1}</span>
          <span class="eq"><i></i><i></i><i></i></span>
          <svg class="ico play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7V5z"/></svg>
          <svg class="ico pause" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
        </div>
        <div class="r-main">
          ${cover}
          <div class="r-meta">
            <div class="r-title">${esc(t.title)}</div>
            <div class="r-artist">${esc(t.artist || "Unknown artist")}</div>
          </div>
        </div>
        <div class="r-album">${esc(t.album || "")}</div>
        <div class="r-dur">${t.duration ? fmt(t.duration) : ""}</div>`;
      row.addEventListener("click", () => {
        if (i === current && playing === t) togglePlay(); else playIndex(i);
      });
      rows.push(row);
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
    markActive(false);
  }

  function markActive(scroll) {
    rows.forEach((row, i) => {
      const on = i === current;
      row.classList.toggle("active", on);
      row.classList.toggle("playing", on && !audio.paused);
      row.classList.toggle("paused", on && audio.paused);
      if (on) row.setAttribute("aria-current", "true"); else row.removeAttribute("aria-current");
    });
    if (scroll && rows[current]) rows[current].scrollIntoView({ block: "nearest" });
  }

  /* ---------- playback ---------- */
  function playIndex(i) {
    if (i < 0 || i >= view.length) return;
    current = i;
    const t = playing = view[i];
    audio.src = t.url;
    audio.play().catch(() => {});
    $("now-title").textContent = t.title;
    $("now-artist").textContent = t.artist || "Unknown artist";
    $("now-cover").innerHTML = t.hasCover ? `<img src="${coverUrl(t)}" alt=""/>` : '<span aria-hidden="true">♪</span>';
    document.title = `${label(t)} — Music player`;
    seekbar.disabled = false;
    markActive(true);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist || "", album: t.album || "",
        artwork: t.hasCover ? [{ src: coverUrl(t) }] : []
      });
    }
  }

  function next(auto) {
    if (!view.length) return;
    if (repeat && auto) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let i;
    if (shuffle && view.length > 1) {
      do { i = Math.floor(Math.random() * view.length); } while (i === current);   // never the same track twice in a row
    } else i = current + 1;
    if (i >= view.length) { if (auto) { stop(); return; } i = 0; }
    playIndex(i);
  }
  function prev() {
    if (!view.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    playIndex(current - 1 < 0 ? view.length - 1 : current - 1);
  }
  function stop() {
    audio.pause();
    pushNowPlaying("");
  }
  function togglePlay() {
    if (!playing) { if (view.length) playIndex(0); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  /* ---------- audio events ---------- */
  function syncPlayState() {
    const on = !audio.paused;
    /* SVG elements have no .hidden property, so set the attribute itself */
    $("ico-play").toggleAttribute("hidden", on); $("ico-pause").toggleAttribute("hidden", !on);
    $("playpause").setAttribute("aria-label", on ? "Pause" : "Play");
    markActive(false);
  }
  audio.addEventListener("play", () => {
    syncPlayState();
    if (playing) pushNowPlaying(label(playing));
  });
  audio.addEventListener("playing", () => { failures = 0; });
  audio.addEventListener("pause", () => {
    syncPlayState();
    // pausing clears the stream chip (unless we're between auto-advance tracks)
    if (!audio.ended) pushNowPlaying("");
  });
  audio.addEventListener("ended", () => next(true));
  audio.addEventListener("error", () => {
    if (!playing) return;
    failures++;
    notice(`Couldn’t play “${playing.title}”. The file may be damaged or in a format this browser can’t decode.`);
    if (failures < 3 && view.length > 1) next(false);    // skip ahead, but don't spin through a broken library
    else stop();
  });
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
      const f = audio.currentTime / audio.duration;
      seekbar.value = f * 1000;
      setFill(seekbar, f * 100);
    }
    $("cur").textContent = fmt(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", () => { $("dur").textContent = fmt(audio.duration); });

  /* ---------- controls ---------- */
  $("playpause").addEventListener("click", togglePlay);
  $("next").addEventListener("click", () => next(false));
  $("prev").addEventListener("click", prev);

  function setShuffle(on) { shuffle = on; $("shuffle").setAttribute("aria-pressed", String(on)); store.set("shuffle", on ? "1" : "0"); }
  function setRepeat(on) { repeat = on; $("repeat").setAttribute("aria-pressed", String(on)); store.set("repeat", on ? "1" : "0"); }
  $("shuffle").addEventListener("click", () => setShuffle(!shuffle));
  $("repeat").addEventListener("click", () => setRepeat(!repeat));
  setShuffle(store.get("shuffle", "0") === "1");
  setRepeat(store.get("repeat", "0") === "1");

  seekbar.addEventListener("input", () => {
    if (audio.duration) { audio.currentTime = (seekbar.value / 1000) * audio.duration; setFill(seekbar, seekbar.value / 10); }
  });

  function setVolume(v) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    audio.volume = v / 100;
    if (v > 0) audio.muted = false;
    volume.value = v;
    store.set("vol", v);
    syncMute();
  }
  function syncMute() {
    const silent = audio.muted || audio.volume === 0;
    $("ico-vol").toggleAttribute("hidden", silent); $("ico-muted").toggleAttribute("hidden", !silent);
    $("mute").setAttribute("aria-pressed", String(silent));
    $("mute").setAttribute("aria-label", silent ? "Unmute" : "Mute");
    setFill(volume, silent ? 0 : audio.volume * 100);
  }
  function toggleMute() {
    if (audio.volume === 0) { setVolume(50); return; }
    audio.muted = !audio.muted;
    syncMute();
  }
  volume.addEventListener("input", () => setVolume(+volume.value));
  $("mute").addEventListener("click", toggleMute);
  setVolume(+store.get("vol", 100));

  /* hardware media keys / OS media controls */
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    const on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
    on("play", () => audio.play().catch(() => {}));
    on("pause", () => audio.pause());
    on("previoustrack", prev);
    on("nexttrack", () => next(false));
  }

  /* ---------- remote control (Stream Deck / Companion via SSE) ---------- */
  function applyCommand(c) {
    switch (c.action) {
      case "playpause": togglePlay(); break;
      case "play": if (audio.paused) togglePlay(); break;
      case "pause": if (!audio.paused) audio.pause(); break;
      case "stop": stop(); break;
      case "next": next(false); break;
      case "prev": prev(); break;
      case "volume":
        if (typeof c.value === "number") setVolume(c.value);
        else if (typeof c.delta === "number") setVolume((audio.volume * 100) + c.delta);
        break;
    }
  }
  function openCommandStream() {
    if (typeof EventSource === "undefined") return;
    try {
      const es = new EventSource("/api/events?role=player");
      es.addEventListener("command", (e) => { try { applyCommand(JSON.parse(e.data)); } catch (_) {} });
    } catch (_) {}
  }
  /* Open the SSE stream only after `load` — an SSE connection opened during
     page load keeps the browser tab's loading spinner running indefinitely. */
  if (document.readyState === "complete") setTimeout(openCommandStream, 0);
  else window.addEventListener("load", () => setTimeout(openCommandStream, 0));

  /* Closing the tab stops the music, so take the chip off the stream too. */
  window.addEventListener("pagehide", () => {
    if (lastPushed && navigator.sendBeacon) {
      navigator.sendBeacon("/api/now-playing", new Blob([JSON.stringify({ text: "" })], { type: "application/json" }));
    }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (e.key === "Escape" && e.target === searchEl) { searchEl.value = ""; applyFilter(); searchEl.blur(); return; }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "/") { e.preventDefault(); searchEl.focus(); return; }
    /* Space on a focused button already activates that button. */
    if (e.code === "Space" && tag !== "BUTTON" && tag !== "A") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") next(false);
    else if (e.code === "ArrowLeft") prev();
    else if (e.key === "m" || e.key === "M") toggleMute();
    else if (e.key === "s" || e.key === "S") setShuffle(!shuffle);
    else if (e.key === "r" || e.key === "R") setRepeat(!repeat);
  });

  /* ---------- search ---------- */
  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    view = q
      ? tracks.filter((t) => (t.title + " " + t.artist + " " + t.album).toLowerCase().includes(q))
      : tracks.slice();
    current = playing ? view.indexOf(playing) : -1;
    render();
  }
  searchEl.addEventListener("input", applyFilter);
  $("clearSearch").addEventListener("click", () => { searchEl.value = ""; applyFilter(); searchEl.focus(); });

  /* ---------- load library ---------- */
  async function load() {
    const btn = $("refresh");
    btn.disabled = true; btn.textContent = "Scanning…";
    if (!tracks.length) showState("loading");
    try {
      const r = await fetch("/api/tracks");
      if (!r.ok) throw new Error();
      const fresh = (await r.json()).tracks || [];
      /* keep the playing track selected across a rescan */
      if (playing) playing = fresh.find((t) => t.path === playing.path) || playing;
      tracks = fresh;
      applyFilter();
    } catch (e) {
      if (!tracks.length) { $("summary").textContent = ""; showState("failed"); }
      else notice("Rescan failed. The server didn’t answer, so the list is unchanged.");
    } finally {
      btn.disabled = false; btn.textContent = "Rescan";
    }
  }
  $("refresh").addEventListener("click", load);
  $("emptyRescan").addEventListener("click", load);
  $("retry").addEventListener("click", load);

  /* reflect whatever is already on stream (another tool may be writing it) */
  fetch("/api/now-playing").then((r) => r.json()).then((d) => {
    if (d.text) { lastPushed = d.text; showStatus(d.text); }
  }).catch(() => {});

  load();
})();

/* ================================================================
   Music player logic — scans /api/tracks, plays audio, and pushes
   the current "Artist — Title" to the OBS now-playing.txt.
   ================================================================ */
(function () {
  const audio = document.getElementById("audio");
  const listEl = document.getElementById("tracklist");
  const emptyEl = document.getElementById("empty");
  const searchEl = document.getElementById("search");

  const nowCover = document.getElementById("now-cover");
  const nowTitle = document.getElementById("now-title");
  const nowArtist = document.getElementById("now-artist");
  const npStatus = document.getElementById("np-status");

  const seekbar = document.getElementById("seekbar");
  const curEl = document.getElementById("cur");
  const durEl = document.getElementById("dur");
  const volume = document.getElementById("volume");

  const icoPlay = document.getElementById("ico-play");
  const icoPause = document.getElementById("ico-pause");
  const shuffleBtn = document.getElementById("shuffle");
  const repeatBtn = document.getElementById("repeat");

  let tracks = [];          // full library
  let view = [];            // filtered/ordered view shown in the list
  let current = -1;         // index into `view`
  let shuffle = false;
  let repeat = false;
  let lastPushed = null;    // last text written to now-playing.txt

  /* ---------- helpers ---------- */
  const fmt = (s) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  const label = (t) => (t.artist ? `${t.artist} — ${t.title}` : t.title);

  /* ---------- now-playing.txt sync ---------- */
  async function pushNowPlaying(text) {
    if (text === lastPushed) return;
    lastPushed = text;
    try {
      await fetch("/api/now-playing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    } catch { /* server offline — ignore */ }
    if (text) { npStatus.textContent = "OBS: " + text; npStatus.className = "np-status on"; }
    else { npStatus.textContent = "OBS: idle"; npStatus.className = "np-status off"; }
  }

  /* ---------- render library ---------- */
  function render() {
    listEl.innerHTML = "";
    if (!tracks.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    view.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "row" + (i === current ? " active" : "");
      const cover = t.hasCover
        ? `<img class="r-cover" src="/api/cover?path=${encodeURIComponent(t.path)}" alt="" loading="lazy"/>`
        : `<div class="r-cover">♪</div>`;
      row.innerHTML = `
        <div class="r-num">
          <span class="num">${i + 1}</span>
          <svg class="play-ico" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8V4z"/></svg>
        </div>
        <div class="r-main">
          ${cover}
          <div class="r-meta">
            <div class="r-title">${esc(t.title)}</div>
            <div class="r-artist">${esc(t.artist || "Unknown artist")}</div>
          </div>
        </div>
        <div class="r-album">${esc(t.album || "")}</div>
        <div class="r-dur">${t.duration ? fmt(t.duration) : "—"}</div>`;
      row.addEventListener("click", () => playIndex(i));
      listEl.appendChild(row);
    });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function markActive() {
    [...listEl.children].forEach((row, i) => row.classList.toggle("active", i === current));
    const active = listEl.children[current];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  /* ---------- playback ---------- */
  function playIndex(i) {
    if (i < 0 || i >= view.length) return;
    current = i;
    const t = view[i];
    audio.src = t.url;
    audio.play().catch(() => {});
    nowTitle.textContent = t.title;
    nowArtist.textContent = t.artist || "Unknown artist";
    nowCover.innerHTML = t.hasCover
      ? `<img src="/api/cover?path=${encodeURIComponent(t.path)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>`
      : "♪";
    markActive();
    pushNowPlaying(label(t));
  }

  function next(auto) {
    if (!view.length) return;
    if (repeat && auto) { audio.currentTime = 0; audio.play(); return; }
    let i;
    if (shuffle) i = Math.floor(Math.random() * view.length);
    else i = current + 1;
    if (i >= view.length) { if (auto) { stop(); return; } i = 0; }
    playIndex(i);
  }
  function prev() {
    if (!view.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let i = current - 1;
    if (i < 0) i = view.length - 1;
    playIndex(i);
  }
  function stop() {
    audio.pause();
    pushNowPlaying("");
  }
  function togglePlay() {
    if (!audio.src) { playIndex(0); return; }
    if (audio.paused) audio.play(); else audio.pause();
  }

  /* ---------- audio events ---------- */
  audio.addEventListener("play", () => {
    icoPlay.hidden = true; icoPause.hidden = false;
    if (current >= 0) pushNowPlaying(label(view[current]));
  });
  audio.addEventListener("pause", () => {
    icoPlay.hidden = false; icoPause.hidden = true;
    // pausing clears the OBS chip (unless we're between auto-advance tracks)
    if (!audio.ended) pushNowPlaying("");
  });
  audio.addEventListener("ended", () => next(true));
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) {
      seekbar.value = (audio.currentTime / audio.duration) * 1000;
      seekbar.style.setProperty("--fill", (audio.currentTime / audio.duration) * 100 + "%");
    }
    curEl.textContent = fmt(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", () => { durEl.textContent = fmt(audio.duration); });

  /* ---------- controls ---------- */
  document.getElementById("playpause").addEventListener("click", togglePlay);
  document.getElementById("next").addEventListener("click", () => next(false));
  document.getElementById("prev").addEventListener("click", prev);
  shuffleBtn.addEventListener("click", () => { shuffle = !shuffle; shuffleBtn.classList.toggle("on", shuffle); });
  repeatBtn.addEventListener("click", () => { repeat = !repeat; repeatBtn.classList.toggle("on", repeat); });

  seekbar.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (seekbar.value / 1000) * audio.duration;
  });
  function setVolume(v) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    audio.volume = v / 100;
    volume.value = v;
    volume.style.setProperty("--fill", v + "%");
    try { localStorage.setItem("obs-player-vol", v); } catch (e) {}
  }
  volume.addEventListener("input", () => setVolume(+volume.value));
  let savedVol = 100;
  try { const s = localStorage.getItem("obs-player-vol"); if (s != null) savedVol = +s; } catch (e) {}
  setVolume(savedVol);

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
  if (typeof EventSource !== "undefined") {
    try {
      const es = new EventSource("/api/events");
      es.addEventListener("command", (e) => { try { applyCommand(JSON.parse(e.data)); } catch (_) {} });
    } catch (_) {}
  }

  /* keyboard: space = play/pause, arrows = prev/next */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if (e.code === "ArrowRight") next(false);
    else if (e.code === "ArrowLeft") prev();
  });

  /* ---------- search ---------- */
  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    const playing = current >= 0 ? view[current] : null;
    view = q
      ? tracks.filter((t) => (t.title + " " + t.artist + " " + t.album).toLowerCase().includes(q))
      : tracks.slice();
    current = playing ? view.indexOf(playing) : -1;
    render();
  }
  searchEl.addEventListener("input", applyFilter);

  /* ---------- load library ---------- */
  async function load() {
    try {
      const r = await fetch("/api/tracks");
      const data = await r.json();
      tracks = data.tracks || [];
    } catch { tracks = []; }
    view = tracks.slice();
    current = -1;
    render();
  }
  document.getElementById("refresh").addEventListener("click", load);

  /* reflect any pre-existing now-playing.txt state on open */
  fetch("/api/now-playing").then((r) => r.json()).then((d) => {
    if (d.text) { npStatus.textContent = "OBS: " + d.text; npStatus.className = "np-status on"; lastPushed = d.text; }
  }).catch(() => {});

  load();
})();

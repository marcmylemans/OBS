/* ================================================================
   Mylemans Online — OBS Scene Pack server

   - Serves the OBS scene control room + all browser-source scenes
     at /scenes  (so the relative now-playing.txt / assets work).
   - Serves a Spotify-styled music player at /player.
   - Scans a mounted music folder (MUSIC_DIR, default /music), reads
     ID3 metadata, streams audio, and extracts embedded cover art.
   - Writes the currently playing track to the scenes' now-playing.txt
     so the OBS "Now playing" chip updates live.
   - Live control: a shared scene state (topic / track / countdown /
     standby variant) pushed to every open scene over Server-Sent
     Events, so the control room updates OBS instantly without
     re-copying URLs or refreshing sources.
   - Brand config: name / handles / accent are read from config.json
     (CONFIG_FILE) and served to the scenes, so the pack is themeable.
   ================================================================ */
import express from "express";
import { parseFile } from "music-metadata";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PORT = parseInt(process.env.PORT || "8080", 10);
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || "/music");
const SCENES_DIR = path.resolve(process.env.SCENES_DIR || path.join(ROOT, "public", "scenes"));
const PLAYER_DIR = path.join(ROOT, "public", "player");
const NOW_PLAYING_FILE = path.join(SCENES_DIR, "now-playing.txt");
const CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || path.join(ROOT, "config.json"));

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus", ".wav", ".webm"]);

const app = express();
app.use(express.json());

/* Express 4 does not catch rejected promises from async handlers; an uncaught
   one would take the whole process down. Wrap every async route so errors
   reach the error middleware at the bottom of this file instead. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ================================================================
   BRAND CONFIG
   ================================================================ */
const DEFAULT_BRAND = {
  brandName: "Mylemans Online",
  tagline: "Homelab · Automation",
  standbyTagline: "Homelab · Windows Server · Automation",
  site: "mylemans.online",
  presenter: { name: "Marc Mylemans", role: "Systems Engineer · Mylemans Online" },
  handles: { youtube: "@mylemansonline", github: "mylemansonline", bluesky: "mylemans.online" },
  accent: { from: "#2563eb", to: "#38bdf8" },
  logo: "assets/logo-mark.png",      // relative to /scenes/ (or an absolute URL)
  chatSource: "YouTube"              // label on the live-chat frame
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], over[k]);
    } else if (over[k] !== undefined) {
      out[k] = over[k];
    }
  }
  return out;
}

/* Re-read config.json on each request so edits apply without a restart. */
function loadBrand() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return deepMerge(DEFAULT_BRAND, raw);
  } catch {
    return DEFAULT_BRAND;
  }
}

/* ================================================================
   LIVE SCENE STATE  (broadcast over SSE)

   topic / variant / countdown are *overrides*: null means "no opinion —
   the scene keeps its own URL/baked value". They only become non-null when
   the control room actively pushes them (Live push on), so connecting
   scenes are never clobbered by defaults. track is always a string
   ("" = nothing playing).
   ================================================================ */
const state = {
  topic: null,
  track: "",
  variant: null,
  countdown: null,
  rev: 0
};
try { state.track = fs.readFileSync(NOW_PLAYING_FILE, "utf8").trim(); } catch {}

const sseClients = new Set();

function sse(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { /* dropped on next close */ }
  }
}
/* `now` lets a scene on another machine correct for clock drift when it
   turns the countdown target into local time. */
function snapshot() { return { ...state, now: Date.now() }; }
function broadcast() { sse("state", snapshot()); }
/* One-shot commands for the music player (transport / volume). Scenes ignore
   these; only the player listens for the "command" event. */
function broadcastCommand(cmd) { sse("command", cmd); }

let cdMins = 10;   // staged standby-countdown minutes (driven by a dial)

async function writeNowPlaying(text) {
  await fsp.mkdir(SCENES_DIR, { recursive: true });
  await fsp.writeFile(NOW_PLAYING_FILE, text ? text + "\n" : "");
}

/* Apply a partial update to the shared state and notify scenes. */
async function updateState(patch) {
  let changed = false;
  if (typeof patch.topic === "string" && patch.topic.trim() !== state.topic) {
    state.topic = patch.topic.trim();
    changed = true;
  }
  if (typeof patch.variant !== "undefined" && patch.variant !== null) {
    const v = Math.min(3, Math.max(1, parseInt(patch.variant, 10) || 1));
    if (v !== state.variant) { state.variant = v; changed = true; }
  }
  if (patch.countdown && typeof patch.countdown === "object") {
    /* The server stamps an absolute end time (`target`, epoch ms) whenever a
       minutes countdown is set, changed or explicitly restarted. Scenes count
       down to that moment, so a source that loads or reconnects later shows
       the time actually remaining instead of starting over. */
    const prev = state.countdown || {};
    const { restart, target: _ignored, ...rest } = patch.countdown;
    const c = { mode: prev.mode, mins: prev.mins, until: prev.until, ...rest };
    c.mode = c.mode === "until" ? "until" : "mins";
    if (c.mode === "mins") {
      c.mins = Math.min(180, Math.max(1, parseFloat(c.mins) || 10));
      const same = prev.mode === "mins" && prev.mins === c.mins && prev.target;
      c.target = same && !restart ? prev.target : Date.now() + c.mins * 60000;
      delete c.until;
    } else {
      c.until = String(c.until || "");
      delete c.mins;
    }
    for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
    if (JSON.stringify(c) !== JSON.stringify(state.countdown)) { state.countdown = c; changed = true; }
  }
  if (typeof patch.track === "string" && patch.track.trim() !== state.track) {
    state.track = patch.track.trim();
    await writeNowPlaying(state.track);
    changed = true;
  }
  if (changed) { state.rev++; broadcast(); }
  return changed;
}

/* Fold external now-playing.txt edits (other tools) into the live state. */
fs.watchFile(NOW_PLAYING_FILE, { interval: 2000 }, async () => {
  let text = "";
  try { text = (await fsp.readFile(NOW_PLAYING_FILE, "utf8")).trim(); } catch {}
  if (text !== state.track) { state.track = text; state.rev++; broadcast(); }
});

/* ================================================================
   MUSIC HELPERS
   ================================================================ */
/* Resolve a promise but give up after `ms` so one unreadable/huge file
   can't hang the whole /api/tracks scan. */
function withTimeout(promise, ms, fallback) {
  let t;
  const timeout = new Promise((resolve) => { t = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise.then((v) => { clearTimeout(t); return v; }, () => { clearTimeout(t); return fallback; }), timeout]);
}

/* `rel` arrives already URL-decoded by Express (req.query), so it must NOT be
   decoded again: a second decodeURIComponent throws on any filename that
   contains a literal "%" (e.g. "100% Mix.mp3"). */
function safeMusicPath(rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  const full = path.resolve(MUSIC_DIR, rel);
  if (full !== MUSIC_DIR && !full.startsWith(MUSIC_DIR + path.sep)) return null;
  return full;
}

async function walkMusic(dir = MUSIC_DIR, base = MUSIC_DIR, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkMusic(abs, base, out);
    } else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      out.push(path.relative(base, abs));
    }
  }
  return out;
}

function fromFilename(rel) {
  const name = path.basename(rel, path.extname(rel)).replace(/_/g, " ").trim();
  const m = name.match(/^\s*(.+?)\s*[-–—]\s*(.+?)\s*$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: "", title: name };
}

/* ================================================================
   CONFIG ROUTES  (registered before static so they win)
   ================================================================ */
app.get("/api/config", (_req, res) => res.json(loadBrand()));

/* Injected into every scene as window.OBS_BRAND before overlay.js. */
app.get("/scenes/brand.js", (_req, res) => {
  res.type("application/javascript").set("Cache-Control", "no-store");
  res.send(`window.OBS_BRAND = ${JSON.stringify(loadBrand())};`);
});

/* ================================================================
   LIVE STATE ROUTES
   ================================================================ */
app.get("/api/state", (_req, res) => res.json(snapshot()));

app.post("/api/state", wrap(async (req, res) => {
  try {
    const changed = await updateState(req.body || {});
    res.json({ ok: true, changed, state: snapshot() });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}));

/* Server-Sent Events stream: scenes subscribe to receive live state. */
app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\n`);
  res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
  res.locals.role = req.query.role === "player" ? "player" : "scene";
  sseClients.add(res);
  const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);
  req.on("close", () => { clearInterval(hb); sseClients.delete(res); });
});

/* ================================================================
   MUSIC API
   ================================================================ */
app.get("/api/tracks", wrap(async (_req, res) => {
  const rels = await walkMusic();
  rels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const tracks = await Promise.all(
    rels.map(async (rel) => {
      const fb = fromFilename(rel);
      const t = {
        path: rel,
        url: "/media/" + rel.split(path.sep).map(encodeURIComponent).join("/"),
        artist: fb.artist,
        title: fb.title,
        album: "",
        duration: 0,
        hasCover: false
      };
      const meta = await withTimeout(
        parseFile(path.join(MUSIC_DIR, rel), { duration: true }),
        5000,
        null
      );
      if (meta) {
        const { common, format } = meta;
        if (common.title) t.title = common.title;
        if (common.artist) t.artist = common.artist;
        if (common.album) t.album = common.album;
        if (format.duration) t.duration = Math.round(format.duration);
        t.hasCover = !!(common.picture && common.picture.length);
      }
      return t;
    })
  );
  res.json({ musicDir: MUSIC_DIR, count: tracks.length, tracks });
}));

app.get("/api/cover", wrap(async (req, res) => {
  const full = safeMusicPath(req.query.path);
  if (!full || !fs.existsSync(full)) return res.sendStatus(404);
  try {
    const { common } = await parseFile(full);
    const pic = common.picture && common.picture[0];
    if (!pic) return res.sendStatus(404);
    res.set("Content-Type", pic.format || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(pic.data));
  } catch {
    res.sendStatus(404);
  }
}));

/* now-playing.txt convenience endpoints (kept for compatibility). */
app.get("/api/now-playing", (_req, res) => res.json({ text: state.track }));

app.post("/api/now-playing", wrap(async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  try {
    await updateState({ track: text });
    res.json({ ok: true, text: state.track });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
}));

/* ================================================================
   STREAM DECK COMMAND ENDPOINTS  (simple GET — easy to bind from
   Bitfocus Companion, a web-request plugin, or a browser)
   ================================================================ */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* --- overlay (pushed to scenes via live state) --- */
app.get("/api/cmd/topic", wrap(async (req, res) => {
  await updateState({ topic: typeof req.query.value === "string" ? req.query.value : "" });
  res.json({ ok: true, topic: state.topic });
}));
app.get("/api/cmd/topic/clear", wrap(async (_req, res) => {
  await updateState({ topic: "" });
  res.json({ ok: true, topic: state.topic });
}));
app.get("/api/cmd/variant", wrap(async (req, res) => {
  let v;
  if (req.query.value != null) {
    v = clamp(parseInt(req.query.value, 10) || 1, 1, 3);
  } else {
    const d = req.query.delta != null ? (parseInt(req.query.delta, 10) || 0) : 0;
    v = (((state.variant || 1) + d - 1) % 3 + 3) % 3 + 1;   // wrap within 1..3
  }
  await updateState({ variant: v });
  res.json({ ok: true, variant: state.variant });
}));
app.get("/api/cmd/countdown", wrap(async (req, res) => {
  if (req.query.until) {
    await updateState({ countdown: { mode: "until", until: String(req.query.until) } });
  } else {
    if (req.query.mins != null) cdMins = clamp(parseInt(req.query.mins, 10) || 10, 1, 180);
    else if (req.query.delta != null) cdMins = clamp(cdMins + (parseInt(req.query.delta, 10) || 0), 1, 180);
    await updateState({ countdown: { mode: "mins", mins: cdMins } });   // live reset for instant feedback
  }
  res.json({ ok: true, countdown: state.countdown, cdMins });
}));
app.get("/api/cmd/countdown/start", wrap(async (_req, res) => {
  await updateState({ countdown: { mode: "mins", mins: cdMins, restart: true } });
  res.json({ ok: true, countdown: state.countdown });
}));

/* --- music player remote (broadcast as a one-shot command) --- */
app.get("/api/cmd/player/:action", (req, res) => {
  const action = req.params.action;
  const cmd = { action };
  if (action === "volume") {
    if (req.query.value != null) cmd.value = clamp(parseInt(req.query.value, 10) || 0, 0, 100);
    else if (req.query.delta != null) cmd.delta = parseInt(req.query.delta, 10) || 0;
  }
  if (!["playpause", "play", "pause", "next", "prev", "volume", "stop"].includes(action)) {
    return res.status(400).json({ ok: false, error: "unknown action" });
  }
  broadcastCommand(cmd);
  res.json({ ok: true, sent: cmd, listeners: sseClients.size });
});

/* ---------- media streaming (Range support for seeking) ---------- */
app.use("/media", express.static(MUSIC_DIR, { acceptRanges: true, fallthrough: false }));

/* ---------- static sites ---------- */
app.use("/scenes", express.static(SCENES_DIR, { extensions: ["html"] }));
app.use("/player", express.static(PLAYER_DIR, { extensions: ["html"] }));

/* `scenes` = open overlay sources (OBS browser sources, scene tabs);
   `players` = open music-player tabs. Previews in the control room don't
   hold a connection, so they aren't counted. */
app.get("/healthz", (_req, res) => {
  let players = 0;
  for (const c of sseClients) if (c.locals.role === "player") players++;
  res.json({ ok: true, clients: sseClients.size, scenes: sseClients.size - players, players, rev: state.rev });
});

app.get("/favicon.ico", (_req, res) => res.redirect("/scenes/assets/favicon.png"));

/* Landing page → control room. */
app.get("/", (_req, res) => res.redirect("/scenes/"));

/* Last-resort error handler: a bad request must never crash the server
   mid-stream. Client errors (malformed URL/JSON) keep their 4xx status. */
app.use((err, req, res, _next) => {
  const status = err.status >= 400 && err.status < 500 ? err.status : (err instanceof URIError ? 400 : 500);
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return res.end();
  res.status(status).json({ ok: false, error: status >= 500 ? "internal error" : "bad request" });
});

app.listen(PORT, () => {
  console.log(`OBS Scene Pack server running on http://localhost:${PORT}`);
  console.log(`  Control room : http://localhost:${PORT}/scenes/`);
  console.log(`  Music player : http://localhost:${PORT}/player/`);
  console.log(`  Music folder : ${MUSIC_DIR}${fs.existsSync(MUSIC_DIR) ? "" : "  (not found — mount a volume here)"}`);
  console.log(`  Config file  : ${CONFIG_FILE}${fs.existsSync(CONFIG_FILE) ? "" : "  (using built-in defaults)"}`);
  console.log(`  now-playing  : ${NOW_PLAYING_FILE}`);
});

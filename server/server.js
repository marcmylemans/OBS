/* ================================================================
   Mylemans Online — OBS Scene Pack server

   - Serves the OBS scene control room + all browser-source scenes
     at /scenes  (so the relative now-playing.txt / assets work).
   - Serves a Spotify-styled music player at /player.
   - Scans a mounted music folder (MUSIC_DIR, default /music), reads
     ID3 metadata, streams audio, and extracts embedded cover art.
   - Writes the currently playing track to the scenes' now-playing.txt
     so the OBS "Now playing" chip updates live.
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

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus", ".wav", ".webm"]);

const app = express();
app.use(express.json());

/* ---------- helpers ---------- */

/* Resolve a client-supplied relative path safely inside MUSIC_DIR. */
function safeMusicPath(rel) {
  const decoded = decodeURIComponent(rel || "");
  const full = path.resolve(MUSIC_DIR, decoded);
  if (full !== MUSIC_DIR && !full.startsWith(MUSIC_DIR + path.sep)) return null;
  return full;
}

/* Recursively walk MUSIC_DIR for audio files (paths relative to MUSIC_DIR). */
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

/* Derive "Artist — Title" from filename when tags are missing. */
function fromFilename(rel) {
  const name = path.basename(rel, path.extname(rel)).replace(/_/g, " ").trim();
  const m = name.match(/^\s*(.+?)\s*[-–—]\s*(.+?)\s*$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: "", title: name };
}

/* ---------- API ---------- */

/* List all tracks with metadata. */
app.get("/api/tracks", async (_req, res) => {
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
      try {
        const { common, format } = await parseFile(path.join(MUSIC_DIR, rel), { duration: true });
        if (common.title) t.title = common.title;
        if (common.artist) t.artist = common.artist;
        if (common.album) t.album = common.album;
        if (format.duration) t.duration = Math.round(format.duration);
        t.hasCover = !!(common.picture && common.picture.length);
      } catch {
        /* unreadable tags — keep filename-derived fallback */
      }
      return t;
    })
  );
  res.json({ musicDir: MUSIC_DIR, count: tracks.length, tracks });
});

/* Embedded cover art for a track (falls back to 404 → player shows placeholder). */
app.get("/api/cover", async (req, res) => {
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
});

/* Read / write the now-playing.txt that the OBS scenes poll. */
app.get("/api/now-playing", async (_req, res) => {
  let text = "";
  try { text = (await fsp.readFile(NOW_PLAYING_FILE, "utf8")).trim(); } catch {}
  res.json({ text });
});

app.post("/api/now-playing", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  try {
    await fsp.mkdir(SCENES_DIR, { recursive: true });
    await fsp.writeFile(NOW_PLAYING_FILE, text ? text + "\n" : "");
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

/* ---------- media streaming (Range support for seeking) ---------- */
app.use("/media", express.static(MUSIC_DIR, { acceptRanges: true, fallthrough: false }));

/* ---------- static sites ---------- */
app.use("/scenes", express.static(SCENES_DIR, { extensions: ["html"] }));
app.use("/player", express.static(PLAYER_DIR, { extensions: ["html"] }));

/* Landing page → control room. */
app.get("/", (_req, res) => res.redirect("/scenes/"));

app.listen(PORT, () => {
  console.log(`OBS Scene Pack server running on http://localhost:${PORT}`);
  console.log(`  Control room : http://localhost:${PORT}/scenes/`);
  console.log(`  Music player : http://localhost:${PORT}/player/`);
  console.log(`  Music folder : ${MUSIC_DIR}${fs.existsSync(MUSIC_DIR) ? "" : "  (not found — mount a volume here)"}`);
  console.log(`  now-playing  : ${NOW_PLAYING_FILE}`);
});

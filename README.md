# OBS Scene Pack — Mylemans Online

A Dockerized web server for the **Mylemans Online OBS Scene Pack**: eight
browser-source overlays (1920×1080) for streaming and recording, a **control
room** to configure them and copy ready-to-paste OBS URLs, and a **Spotify-styled
music player** that drives the on-stream *Now Playing* chip from a folder of
music files.

## What's inside

| Path | What it is |
| --- | --- |
| `public/scenes/` | The OBS Scene Pack — control room (`index.html`) + 8 scene overlays |
| `public/player/` | The music player UI |
| `server/server.js` | Express server: serves the scenes + player, scans music, writes `now-playing.txt` |
| `Dockerfile`, `docker-compose.yml` | Container build + run |

### The eight scenes

**Streaming** — Starting Soon · Be Right Back · Ending Stream · Just Chatting · Screensharing + Webcam
**Recording** — Just Chatting · Screensharing + Webcam · Screensharing (no webcam)

All scenes are transparent browser sources (standby scenes are full-screen). They
self-scale from 1920×1080 to any canvas size, so they stay crisp at 1080p or 4K.

## Quick start (Docker)

```bash
# 1. Put your music in ./music  (or edit the volume path in docker-compose.yml)
mkdir -p music   # drop .mp3 / .flac / .m4a / .ogg / .wav files here

# 2. Build and run
docker compose up --build -d

# 3. Open the control room
#    http://localhost:8080/scenes/
#    Music player: http://localhost:8080/player/
```

Or with plain Docker:

```bash
docker build -t mylemans-obs-scenes .
docker run -d -p 8080:8080 -v /path/to/your/music:/music:ro mylemans-obs-scenes
```

Run locally without Docker:

```bash
npm install
MUSIC_DIR=/path/to/your/music npm start
```

### Pre-built image (GitHub Container Registry)

A GitHub Actions workflow (`.github/workflows/docker-build.yml`) builds and
publishes a **multi-arch image** (`linux/amd64` + `linux/arm64`, so it runs on
PCs/servers as well as Raspberry Pi / Apple Silicon) to GHCR on every push to
`main` and on `v*` tags. Pull it instead of building locally — Docker
auto-selects the right architecture:

```bash
docker run -d -p 8080:8080 -v /path/to/your/music:/music:ro \
  ghcr.io/marcmylemans/obs:latest
```

Tags follow the branch/semver (`latest`, `v1.2.3`, `1.2`, …). The package must
be made public (or you must `docker login ghcr.io`) to pull it.

The build is optimized for speed: dependencies (pure-JS) are installed once on
the build platform and copied into each arch — avoiding slow QEMU `npm` runs —
and both the BuildKit layer cache (GitHub Actions cache) and the npm cache are
reused across runs.

## Using the scenes in OBS

1. Open the **control room** at `http://localhost:8080/scenes/`.
2. Set your countdown (minutes or a target time), on-screen topic, and standby
   layout (01/02/03). Previews update live.
3. Hit **Copy URL** on any scene card — it copies the **full absolute URL**
   with your settings baked in, e.g.
   `http://localhost:8080/scenes/Starting%20Soon.html?mins=10`.
4. In OBS, add a **Browser** source, paste that URL, set **1920×1080**.
   - For countdown scenes, tick *Refresh browser when scene becomes active* so
     the timer restarts each time.

Placement coordinates for webcam / chat / screen-capture regions are documented
right inside the control room's setup section.

### Live push (no URL re-copy)

Baking settings into the URL is great for first-time setup, but you don't have to
re-copy a URL every time you want to change something mid-stream. Flip **Live push
to OBS** to **On** in the control room and your changes stream to every already-open
scene source instantly over Server-Sent Events:

- **Topic** lower-third — update or clear it live on the capture scenes.
- **Standby layout** (01/02/03) — switch centered/editorial/panel live.
- **Countdown** — reset to N minutes or a target time without refreshing.
- **Now playing** is pushed by the music player on the same channel (instant, no
  5s poll).

A URL that explicitly sets `?topic=` is treated as locked and won't be overwritten
by live pushes, so you can pin a topic on one source while steering the rest.

### Branding & theming

Brand details live in **`config.json`** (no code edits): presenter name/role,
social handles, brand name/taglines, and the accent gradient. The server injects
them into every scene, and the accent colors re-theme the overlays. Edit the file
and refresh — no rebuild needed (mount it into the container to override, per
`docker-compose.yml`). Per-scene URL overrides (`?yt= &gh= &bs=`) still win.

```jsonc
{
  "brandName": "Mylemans Online",
  "presenter": { "name": "Marc Mylemans", "role": "Systems Engineer · Mylemans Online" },
  "handles": { "youtube": "@mylemansonline", "github": "mylemansonline", "bluesky": "mylemans.online" },
  "accent": { "from": "#2563eb", "to": "#38bdf8" }
}
```

### Configurable URL parameters

| Param | Scenes | Effect |
| --- | --- | --- |
| `?mins=10` | standby | Countdown of N minutes (persists across source refresh) |
| `?until=20:30` | standby | Countdown to a wall-clock time |
| `?v=1\|2\|3` | standby | Standby layout (centered / editorial / panel) |
| `?topic=...` | capture | On-screen topic lower-third |
| `?track=Artist - Title` | capture | Fixed Now Playing label (overrides the file) |
| `?yt= &gh= &bs=` | all | Override social handles |
| `?demo=1` | capture | Preview backdrop (never use in OBS) |

## Music player → Now Playing

The music player scans the mounted music folder, reads ID3 tags (falling back to
`Artist - Title` filenames), and lets you play tracks in the browser. While a
track plays it writes `Artist — Title` to `public/scenes/now-playing.txt` and
pushes it over the live channel, so the OBS scenes' **Now Playing** chip (with
animated EQ bars) updates instantly. Pausing/stopping clears it, so the chip
auto-hides. (Scenes also keep a 5s file poll as a fallback when the live channel
isn't available.)

- **Map your music:** mount any folder to `/music` in the container (see the
  volume in `docker-compose.yml`). Nested subfolders are scanned recursively.
- **Supported formats:** mp3, m4a/aac, flac, ogg/opus, wav, webm.
- Embedded album art is shown in the player; the `OBS: …` badge in the top-right
  reflects exactly what's written to `now-playing.txt`.

Any external tool (Spotify/foobar2000/Snip, OBS "Output current song") can write
that same file instead — the player is just the bundled, no-config option.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `MUSIC_DIR` | `/music` | Folder scanned for music |
| `SCENES_DIR` | `public/scenes` | Where `now-playing.txt` is written |
| `CONFIG_FILE` | `config.json` | Brand/theme config (re-read per request) |

### HTTP routes

| Route | Description |
| --- | --- |
| `/` | Redirects to the control room |
| `/scenes/` | OBS control room + scene overlays |
| `/player/` | Music player |
| `/media/<file>` | Streams a music file (HTTP Range / seeking supported) |
| `GET /api/tracks` | Library with parsed metadata |
| `GET /api/cover?path=…` | Embedded album art |
| `GET/POST /api/now-playing` | Read / write the Now Playing text |
| `GET/POST /api/state` | Read / push live scene state (topic, variant, countdown, track) |
| `GET /api/events` | Server-Sent Events stream the scenes subscribe to |
| `GET /api/config` · `GET /scenes/brand.js` | Brand/theme config (JSON / injected JS) |
| `GET /healthz` | Health + connected-scene count |

---

*Design handed off from [Claude Design](https://claude.ai/design); brand: deep
navy + electric-blue gradient, system type, the Mylemans Online M/V logo.*

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
publishes the image to GHCR on every push to `main` and on `v*` tags. Pull it
instead of building locally:

```bash
docker run -d -p 8080:8080 -v /path/to/your/music:/music:ro \
  ghcr.io/marcmylemans/obs:latest
```

Tags follow the branch/semver (`latest`, `v1.2.3`, `1.2`, …). The package must
be made public (or you must `docker login ghcr.io`) to pull it.

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
track plays it writes `Artist — Title` to `public/scenes/now-playing.txt`; the
OBS scenes poll that file every 5s and show the **Now Playing** chip (with
animated EQ bars). Pausing/stopping clears it, so the chip auto-hides.

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

---

*Design handed off from [Claude Design](https://claude.ai/design); brand: deep
navy + electric-blue gradient, system type, the Mylemans Online M/V logo.*

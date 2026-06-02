# Stream Deck + profile for the OBS Scene Pack

This folder contains a Stream Deck **+** layout tailored to the eight OBS scenes,
plus everything needed to drive the overlays and the bundled music player from
the deck — including the four dials.

> **Why two setup paths?** Switching OBS scenes and controlling OBS audio on the
> dials is handled by Elgato's official **OBS Studio** plugin. But sending plain
> HTTP to this app (topic / countdown / music transport) — *especially from the
> SD+ dials* — is something the stock Elgato app doesn't do well with generic
> plugins. **Bitfocus Companion** (free, open-source) has first-class SD+ encoder
> + HTTP support and is the reliable way to wire the dials. Use whichever path
> fits; you can even run both (Companion takes over the deck while it runs).

---

## The layout

Stream Deck + = **8 LCD keys** (2 rows × 4) + a **touch strip** + **4 dials**.

### Keys — page 1 · STREAM
```
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ Starting Soon │ Be Right Back │ Ending Stream │ Just Chatting▶│
├───────────────┼───────────────┼───────────────┼───────────────┤
│ Screenshare+▶ │ Topic: clear  │ ⏯ Play/Pause  │ → RECORD      │
└───────────────┴───────────────┴───────────────┴───────────────┘
```

### Keys — page 2 · RECORD
```
┌───────────────┬───────────────┬───────────────┬───────────────┐
│ JustChatting●R│ Screenshare+●R│ Screenshare ●R│ → STREAM      │
├───────────────┼───────────────┼───────────────┼───────────────┤
│ ⏮ Prev        │ ⏯ Play/Pause  │ ⏭ Next        │ Topic: clear  │
└───────────────┴───────────────┴───────────────┴───────────────┘
```

### Dials (both pages)
| Dial | Rotate | Press |
| --- | --- | --- |
| 1 · 🎵 **Music volume** | player volume ∓ | play / pause |
| 2 · 🎙 **Mic** | OBS mic input gain ∓ | mute toggle |
| 3 · 🔊 **Desktop** | OBS desktop/music level ∓ | mute toggle |
| 4 · ⏱ **Countdown** | standby minutes ∓ (live) | start / restart |

Dials 2 & 3 are pure OBS-plugin audio actions. Dials 1 & 4 talk to this app.

---

## App control endpoints (HTTP GET)

Replace `HOST` with the machine running the container (e.g. `localhost` or a LAN
IP), port `8080` by default.

| Action | URL |
| --- | --- |
| Set topic | `http://HOST:8080/api/cmd/topic?value=Proxmox%20HA` |
| Clear topic | `http://HOST:8080/api/cmd/topic/clear` |
| Standby layout 1/2/3 | `http://HOST:8080/api/cmd/variant?value=2` |
| Standby layout next | `http://HOST:8080/api/cmd/variant?delta=1` |
| Countdown ± minutes (live) | `http://HOST:8080/api/cmd/countdown?delta=1` · `?delta=-1` |
| Countdown set minutes | `http://HOST:8080/api/cmd/countdown?mins=10` |
| Countdown to clock time | `http://HOST:8080/api/cmd/countdown?until=20:30` |
| Countdown start/restart | `http://HOST:8080/api/cmd/countdown/start` |
| Music play/pause | `http://HOST:8080/api/cmd/player/playpause` |
| Music next / prev | `http://HOST:8080/api/cmd/player/next` · `/prev` |
| Music volume ± | `http://HOST:8080/api/cmd/player/volume?delta=-2` |
| Music volume absolute | `http://HOST:8080/api/cmd/player/volume?value=50` |

All return small JSON and are safe to call repeatedly. Music commands require the
player page (`/player/`) to be open somewhere — it applies them over the live
channel (it does not need to be the focused window).

---

## Path A — Bitfocus Companion (recommended, full dial support)

1. Install [Companion](https://bitfocus.io/companion) and add your Stream Deck +
   (Companion → Surfaces; or use the Stream Deck app's "Bitfocus Companion" mode
   if running both).
2. **Connections** → add:
   - **OBS Studio** (`companion-module-obs-studio`) — point at obs-websocket
     (Tools → WebSocket Server Settings in OBS). Used for scene switching + the
     mic/desktop dials.
   - **Generic HTTP** (`generic-http`) — base URL `http://HOST:8080`. Used for
     this app.
3. **Buttons** — for each scene key, add an **OBS → Set Scene** action with the
   matching OBS scene name. For the control keys, add a **Generic HTTP → GET**
   action with the URL from the table above (e.g. *Topic: clear* → `/api/cmd/topic/clear`).
4. **Dials (rotary)** — Companion lets you bind *rotate left*, *rotate right* and
   *press* on each encoder:
   - **Dial 1** — rotate right → `GET /api/cmd/player/volume?delta=2`; rotate left
     → `?delta=-2`; press → `GET /api/cmd/player/playpause`.
   - **Dial 2 / 3** — OBS module *Set/Adjust source volume* on rotate, *Toggle mute*
     on press (pick your Mic / Desktop audio sources).
   - **Dial 4** — rotate right → `GET /api/cmd/countdown?delta=1`; rotate left →
     `?delta=-1`; press → `GET /api/cmd/countdown/start`.

> Tip: set each dial's text on the touch strip (e.g. "Music", "Mic", "Desktop",
> "Timer") so the labels show above the knobs.

## Path B — Elgato Stream Deck app

1. Install the **OBS Studio** plugin (Stream Deck store) and connect it to
   obs-websocket. Assign the 8 keys to **Scene** actions (your OBS scene names).
2. **Dials 2 & 3:** the OBS plugin provides audio actions usable on dials — assign
   your Mic and Desktop/music sources (rotate = level, press = mute).
3. **Dials 1 & 4 (music / countdown) and the HTTP control keys:** the stock app
   needs a web-request capable action. Install a plugin such as **BarRaider's
   "Web Requests"** / **"API Ninja"** and point its GET action at the URLs above.
   (If your plugin doesn't support encoders, use Companion for dials 1 & 4.)
4. **Utility keys:** the built-in **Website** action can open
   `http://HOST:8080/scenes/` (control room) or `/player/` (music player).

## Importable profile (experimental)

`OBS Scene Pack.streamDeckProfile` is a best-effort profile for the Elgato app:
it lays out the 8 scene keys (OBS **Scene** action, titled per scene) across the
two pages plus utility keys. Import via the Stream Deck app → Profiles →
**Import**.

⚠️ It's a scaffold: after import you'll likely need to (a) re-select each scene in
the OBS action so it matches *your* OBS scene names, and (b) assign the dials per
Path A/B above. If the app refuses the import (device-model mismatch), use the
manual setup — it's the reliable route. Regenerate the file any time with
`node streamdeck/build-profile.mjs`.

## Naming your OBS scenes

The scene keys switch **OBS scenes**, so create one OBS scene per overlay and add
the matching browser source (the Copy-URL value from the control room) to it.
Suggested names (used by the profile titles): `Starting Soon`, `Be Right Back`,
`Ending Stream`, `Just Chatting (Stream)`, `Screenshare + Webcam (Stream)`,
`Just Chatting (Record)`, `Screenshare + Webcam (Record)`, `Screenshare (Record)`.

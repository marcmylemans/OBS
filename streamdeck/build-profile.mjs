/* ================================================================
   Generates "OBS Scene Pack.streamDeckProfile" for the Elgato app.

   This is a best-effort scaffold: it lays out the 8 scene keys with the
   OBS Studio "Scene" action, titled per scene. After import you may need
   to re-select each scene to match your OBS scene names, and assign the
   dials / control keys per streamdeck/README.md.

   Run:  node streamdeck/build-profile.mjs
   (requires the `zip` CLI on PATH)
   ================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Stream Deck + device model code. If the app refuses the import, this is the
   most likely thing to change — known codes incl. 20GAA9901 (Stream Deck),
   20GAT9901 (XL), 20GBA9901 (MK.2). Falls back to manual setup otherwise. */
const DEVICE_MODEL = "20GBA9901";
const PROFILE_UUID = "C0FFEE00-0BSP-4ACE-9000-OBSSCENEPACK1";
const OBS_SCENE_ACTION = "com.elgato.obsstudio.scene";

/* 8 keys (cols 0-3 × rows 0-1) → OBS scene names. */
const KEYS = [
  ["0,0", "Starting Soon"],
  ["1,0", "Be Right Back"],
  ["2,0", "Ending Stream"],
  ["3,0", "Just Chatting (Stream)"],
  ["0,1", "Screenshare + Webcam (Stream)"],
  ["1,1", "Just Chatting (Record)"],
  ["2,1", "Screenshare + Webcam (Record)"],
  ["3,1", "Screenshare (Record)"]
];

const Actions = {};
for (const [coord, scene] of KEYS) {
  Actions[coord] = {
    Name: "Scene",
    Controller: "Keypad",
    State: 0,
    States: [{ Title: scene, TitleAlignment: "middle", FSize: "14" }],
    UUID: OBS_SCENE_ACTION,
    Settings: { sceneName: scene }
  };
}

const manifest = {
  Name: "OBS Scene Pack",
  Version: "1.0",
  Device: { Model: DEVICE_MODEL, UUID: "" },
  Actions
};

const buildDir = path.join(__dirname, "build");
const profDir = path.join(buildDir, PROFILE_UUID);
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(profDir, { recursive: true });
fs.writeFileSync(path.join(profDir, "manifest.json"), JSON.stringify(manifest, null, 2));

const out = path.join(__dirname, "OBS Scene Pack.streamDeckProfile");
fs.rmSync(out, { force: true });
try {
  execFileSync("zip", ["-r", "-X", out, PROFILE_UUID], { cwd: buildDir, stdio: "inherit" });
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log("Wrote", out);
} catch (e) {
  console.error("Could not run `zip`. The profile tree is at:", profDir);
  console.error("Zip the inner folder yourself:  cd streamdeck/build && zip -r '../OBS Scene Pack.streamDeckProfile' " + PROFILE_UUID);
  process.exit(1);
}

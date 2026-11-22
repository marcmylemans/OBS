/* ================================================================
   Smoke tests for the OBS Scene Pack server.

   Starts the real server on a free port against a throwaway music
   folder and checks the routes OBS, the player and the Stream Deck
   depend on — including the requests that used to crash the process.

   Run:  npm test      (Node's built-in test runner, no extra deps)
   ================================================================ */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* A filename with a literal "%" — the case that used to kill the server. */
const TRICKY = "100% Mix - Test Song.mp3";
const COVER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

/* ---- build a tiny but valid MP3: ID3v2.3 tag (title, artist, cover) + silent frames ---- */
function id3Frame(id, body) {
  const head = Buffer.alloc(10);
  head.write(id, 0, "latin1");
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}
function textFrame(id, text) {
  return id3Frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(text, "latin1")]));
}
function synchsafe(n) {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}
function makeMp3() {
  const apic = id3Frame("APIC", Buffer.concat([
    Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), COVER
  ]));
  const frames = Buffer.concat([textFrame("TIT2", "Tagged Title"), textFrame("TPE1", "Tagged Artist"), apic]);
  const tag = Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0]), synchsafe(frames.length), frames]);
  /* MPEG-1 Layer III, 128 kbps, 44.1 kHz → 417-byte frames of silence */
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return Buffer.concat([tag, ...Array(20).fill(frame)]);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let child, base, musicDir;
let output = "";

before(async () => {
  musicDir = fs.mkdtempSync(path.join(os.tmpdir(), "obs-music-"));
  fs.writeFileSync(path.join(musicDir, TRICKY), makeMp3());
  fs.writeFileSync(path.join(musicDir, "Plain Artist - Plain Title.mp3"), makeMp3().subarray(-417 * 20));

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), MUSIC_DIR: musicDir },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });

  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(base + "/healthz")).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start:\n" + output);
});

after(async () => {
  if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  fs.rmSync(musicDir, { recursive: true, force: true });
});

async function assertAlive() {
  assert.equal(child.exitCode, null, "server process died:\n" + output);
  assert.equal((await fetch(base + "/healthz")).status, 200);
}

test("health, config and scene pages are served", async () => {
  assert.equal((await (await fetch(base + "/healthz")).json()).ok, true);
  assert.equal(typeof (await (await fetch(base + "/api/config")).json()).brandName, "string");
  assert.match(await (await fetch(base + "/scenes/brand.js")).text(), /^window\.OBS_BRAND = /);
  for (const page of ["/scenes/", "/scenes/Starting%20Soon.html", "/player/"]) {
    assert.equal((await fetch(base + page)).status, 200, page);
  }
});

test("library scan reads tags and falls back to the filename", async () => {
  const { count, tracks } = await (await fetch(base + "/api/tracks")).json();
  assert.equal(count, 2);
  const tagged = tracks.find((t) => t.path === TRICKY);
  assert.deepEqual([tagged.artist, tagged.title, tagged.hasCover], ["Tagged Artist", "Tagged Title", true]);
  const plain = tracks.find((t) => t.path !== TRICKY);
  assert.deepEqual([plain.artist, plain.title, plain.hasCover], ["Plain Artist", "Plain Title", false]);
});

test("cover + media work for a filename containing a literal %", async () => {
  const cover = await fetch(base + "/api/cover?path=" + encodeURIComponent(TRICKY));
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await cover.arrayBuffer()), COVER);

  const { tracks } = await (await fetch(base + "/api/tracks")).json();
  const media = await fetch(base + tracks.find((t) => t.path === TRICKY).url);
  assert.equal(media.status, 200);
  await media.arrayBuffer();
  await assertAlive();
});

test("malformed or hostile requests get an error response, not a crash", async () => {
  const bad = [
    "/api/cover?path=%E0%A4%A",              // malformed percent-encoding
    "/api/cover?path=100%25",                // decodes to a bare "100%"
    "/api/cover",                            // missing path
    "/api/cover?path[]=a&path[]=b",          // array instead of string
    "/api/cover?path=..%2F..%2Fetc%2Fpasswd",// traversal out of the music dir
    "/media/%E0%A4%A",
    "/media/..%2F..%2Fetc%2Fpasswd"
  ];
  for (const url of bad) {
    const r = await fetch(base + url);
    await r.arrayBuffer();
    assert.ok(r.status >= 400 && r.status < 500, `${url} → ${r.status}`);
  }
  const r = await fetch(base + "/api/state", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json"
  });
  assert.equal(r.status, 400);
  await assertAlive();
});

test("Stream Deck command endpoints update the live state", async () => {
  assert.equal((await (await fetch(base + "/api/cmd/topic?value=Proxmox%20100%25")).json()).topic, "Proxmox 100%");
  assert.equal((await (await fetch(base + "/api/cmd/variant?value=3")).json()).variant, 3);
  assert.deepEqual(
    (await (await fetch(base + "/api/cmd/countdown?mins=5")).json()).countdown,
    { mode: "mins", mins: 5 }
  );
  assert.equal((await fetch(base + "/api/cmd/player/bogus")).status, 400);
  const state = await (await fetch(base + "/api/state")).json();
  assert.deepEqual([state.topic, state.variant], ["Proxmox 100%", 3]);
  await assertAlive();
});

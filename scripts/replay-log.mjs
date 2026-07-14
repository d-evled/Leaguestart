#!/usr/bin/env node
/**
 * Replays a fixture Client.txt into a destination file as if the game were
 * writing it live — the end-to-end harness for testing the tracker without
 * the game.
 *
 *   node scripts/replay-log.mjs --src crates/core/tests/fixtures/full_run.txt \
 *     --dest /tmp/poe/Client.txt --speed 60 --rewrite-ts
 *
 * Options:
 *   --src <file>       fixture to replay (required)
 *   --dest <file>      destination "Client.txt" (required; created/appended)
 *   --speed <n>        time compression factor (default 60: 1 game minute/s)
 *   --rewrite-ts       shift timestamps so the run appears to happen now
 *   --truncate-at <n>  after n lines, truncate the destination once
 *                      (exercises the watcher's recovery path)
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const src = opt("src");
const dest = opt("dest");
if (!src || !dest) {
  console.error("usage: replay-log.mjs --src <fixture> --dest <file> [--speed 60] [--rewrite-ts] [--truncate-at n]");
  process.exit(1);
}
const speed = Number(opt("speed", "60"));
const truncateAt = opt("truncate-at") ? Number(opt("truncate-at")) : null;
const rewrite = flag("rewrite-ts");

const TS_RE = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const parseTs = (line) => {
  const m = TS_RE.exec(line);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
};
const pad = (n) => String(n).padStart(2, "0");
const fmt = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const lines = readFileSync(src, "utf8").split("\n").filter(Boolean);
const firstTs = lines.map(parseTs).find((t) => t !== null) ?? Date.now();
const offset = rewrite ? Date.now() - firstTs : 0;

mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, ""); // start clean so the app tails from a known state

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let prevTs = firstTs;
let written = 0;
for (const line of lines) {
  const ts = parseTs(line);
  if (ts !== null) {
    const gap = Math.max(0, ts - prevTs) / speed;
    prevTs = ts;
    if (gap > 0) await sleep(Math.min(gap, 10_000));
  }
  const out =
    rewrite && ts !== null ? line.replace(TS_RE, fmt(ts + offset)) : line;
  appendFileSync(dest, out + "\n");
  written += 1;
  if (truncateAt !== null && written === truncateAt) {
    console.log(`truncating ${dest} after ${written} lines`);
    await sleep(1500);
    writeFileSync(dest, "");
  }
}
console.log(`replayed ${written} lines from ${src} to ${dest}`);

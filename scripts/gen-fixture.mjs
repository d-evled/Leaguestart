#!/usr/bin/env node
/**
 * Generates crates/core/tests/fixtures/full_run.txt — a synthetic Client.txt
 * of one complete campaign run (acts 1–10 golden path, epilogue, first map).
 *
 * Deterministic by construction so tests can assert exact values:
 *   - every zone dwell is exactly 60s, every loading screen exactly 3s
 *   - one level-up every 5th zone, one death in The Dried Lake
 *   - chat noise sprinkled in to exercise the parser's negative cases
 *
 * Timestamps are wall-clock formatted; the uptime column advances in ms.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const areasFile = JSON.parse(
  readFileSync(join(root, "crates", "core", "data", "poe1", "3.26", "areas.json"), "utf8"),
);

// Golden path: non-side campaign zones + towns, acts 1-10 in canonical order,
// then the epilogue town. This mirrors what the test derives from AreaDb.
const path = areasFile.areas
  .filter((a) => a.act !== null && a.act <= 11 && !a.side)
  .sort((a, b) => a.act - b.act || a.order - b.order);

const DWELL_S = 60;
const LOAD_S = 3;
const CHAR = "Fixturina";
const CLASS = "Witch";

let t = new Date(2026, 6, 12, 8, 0, 0); // 2026/07/12 08:00:00 local
let uptime = 1_000_000;

const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp = (d) =>
  `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ` +
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const lines = [];
function emit(body, level = "INFO") {
  lines.push(`${stamp(t)} ${uptime} deadbeef [${level} Client 7777] ${body}`);
}
function advance(seconds) {
  t = new Date(t.getTime() + seconds * 1000);
  uptime += seconds * 1000;
}

// Synthetic client ids follow the documented `<part>_<act>_<n>` scheme.
const clientIds = new Map();
let perAct = {};
function clientIdFor(a) {
  if (!clientIds.has(a.id)) {
    if (a.town) {
      clientIds.set(a.id, `${a.act <= 5 ? 1 : 2}_${a.act}_town`);
    } else {
      perAct[a.act] = (perAct[a.act] ?? 0) + 1;
      clientIds.set(a.id, `${a.act <= 5 ? 1 : 2}_${a.act}_${perAct[a.act]}`);
    }
  }
  return clientIds.get(a.id);
}

let level = 1;
let zoneIndex = 0;
let seed = 4242;

for (const area of path) {
  // Transition: instance details -> generating -> load -> entered.
  emit("Got Instance Details from login server", "DEBUG");
  emit(
    `Generating level ${area.level} area "${clientIdFor(area)}" with seed ${seed++}`,
    "DEBUG",
  );
  advance(LOAD_S);
  emit(`: You have entered ${area.name}.`);

  zoneIndex += 1;
  // Mid-zone happenings, all inside the 60s dwell.
  advance(20);
  if (zoneIndex % 5 === 0) {
    level += 2;
    emit(`: ${CHAR} (${CLASS}) is now level ${level}`);
  }
  if (area.name === "The Dried Lake") {
    emit(`: ${CHAR} has been slain.`);
  }
  if (zoneIndex % 10 === 0) {
    emit(`#SomeTrader: You have entered my shop, WTS leveling uniques`);
    emit(`: RandomGuy: Bob (Witch) is now level 3`);
  }
  advance(DWELL_S - 20);
}

// Endgame: first map ends the run (FirstMap goal).
emit("Got Instance Details from login server", "DEBUG");
emit(`Generating level 68 area "MapWorldsBeach" with seed ${seed++}`, "DEBUG");
advance(LOAD_S);
emit(`: You have entered Beach.`);
advance(30);

const out = join(root, "crates", "core", "tests", "fixtures", "full_run.txt");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n") + "\n");
console.log(`wrote ${out}: ${lines.length} lines, ${path.length} campaign areas`);

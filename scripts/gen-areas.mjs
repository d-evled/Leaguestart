#!/usr/bin/env node
/**
 * Generates crates/core/data/poe1/<PATCH>/areas.json from the curated table below.
 *
 * The table is the raw source (see crates/core/data/poe1/SOURCES.md for
 * provenance and validation status). Edit the table, run
 * `npm run gen:areas`, and commit both.
 *
 * Flags per zone: "w" = has waypoint, "s" = side area (off the golden path).
 * Towns are listed in `town` and always have a waypoint.
 * `order` is assigned in increments of 10 in listed order — it is the
 * canonical progression order used to align splits across runs.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PATCH = "3.26";
const GAME = "poe1";

// [name, monsterLevel, flags]
const ACTS = [
  {
    act: 1,
    town: ["Lioneye's Watch", 1],
    zones: [
      ["The Twilight Strand", 1, ""],
      ["The Coast", 2, "w"],
      ["The Tidal Island", 3, "s"],
      ["The Mud Flats", 4, "w"],
      ["The Fetid Pool", 5, "s"],
      ["The Submerged Passage", 5, "w"],
      ["The Flooded Depths", 6, "s"],
      ["The Ledge", 6, "w"],
      ["The Climb", 7, "w"],
      ["The Lower Prison", 8, "w"],
      ["The Upper Prison", 9, ""],
      ["Prisoner's Gate", 10, "w"],
      ["The Ship Graveyard", 11, "w"],
      ["The Ship Graveyard Cave", 12, "s"],
      ["The Cavern of Wrath", 12, ""],
      ["The Cavern of Anger", 13, "w"],
    ],
  },
  {
    act: 2,
    town: ["The Forest Encampment", 13],
    zones: [
      ["The Southern Forest", 12, "w"],
      ["The Old Fields", 14, ""],
      ["The Den", 15, "s"],
      ["The Crossroads", 15, "w"],
      ["The Broken Bridge", 16, "sw"],
      ["The Fellshrine Ruins", 16, "s"],
      ["The Crypt Level 1", 17, "s"],
      ["The Crypt Level 2", 18, "s"],
      ["The Chamber of Sins Level 1", 17, "w"],
      ["The Chamber of Sins Level 2", 18, ""],
      ["The Riverways", 18, "w"],
      ["The Western Forest", 19, "w"],
      ["The Weaver's Chambers", 19, "s"],
      ["The Wetlands", 20, "w"],
      ["The Vaal Ruins", 21, ""],
      ["The Northern Forest", 22, "w"],
      ["The Dread Thicket", 22, "s"],
      ["The Caverns", 23, "w"],
      ["The Ancient Pyramid", 24, ""],
    ],
  },
  {
    act: 3,
    town: ["The Sarn Encampment", 23],
    zones: [
      ["The City of Sarn", 23, "w"],
      ["The Slums", 24, ""],
      ["The Crematorium", 25, "w"],
      ["The Sewers", 26, "w"],
      ["The Marketplace", 27, "w"],
      ["The Catacombs", 27, "s"],
      ["The Battlefront", 28, "w"],
      ["The Solaris Temple Level 1", 28, "w"],
      ["The Solaris Temple Level 2", 29, ""],
      ["The Docks", 29, "w"],
      ["The Ebony Barracks", 30, "w"],
      ["The Lunaris Temple Level 1", 31, "w"],
      ["The Lunaris Temple Level 2", 32, ""],
      ["The Imperial Gardens", 32, "w"],
      ["The Library", 33, "sw"],
      ["The Archives", 33, "s"],
      ["The Sceptre of God", 33, ""],
      ["The Upper Sceptre of God", 34, ""],
    ],
  },
  {
    act: 4,
    town: ["Highgate", 33],
    zones: [
      ["The Aqueduct", 33, "w"],
      ["The Dried Lake", 35, "w"],
      ["The Mines Level 1", 36, ""],
      ["The Mines Level 2", 37, ""],
      ["The Crystal Veins", 37, "w"],
      ["Kaom's Dream", 38, ""],
      ["Kaom's Stronghold", 39, ""],
      ["Daresso's Dream", 38, "w"],
      ["The Grand Arena", 39, ""],
      ["The Belly of the Beast Level 1", 39, ""],
      ["The Belly of the Beast Level 2", 40, ""],
      ["The Harvest", 40, "w"],
      ["The Ascent", 40, ""],
    ],
  },
  {
    act: 5,
    town: ["Overseer's Tower", 41],
    zones: [
      ["The Slave Pens", 41, "w"],
      ["The Control Blocks", 42, ""],
      ["Oriath Square", 43, "w"],
      ["The Templar Courts", 44, "w"],
      ["The Chamber of Innocence", 45, "w"],
      ["The Torched Courts", 46, "w"],
      ["The Ruined Square", 47, "w"],
      ["The Reliquary", 48, "s"],
      ["The Ossuary", 48, "sw"],
      ["The Cathedral Rooftop", 49, ""],
    ],
  },
  {
    act: 6,
    town: ["Lioneye's Watch", 44],
    zones: [
      ["The Twilight Strand", 44, ""],
      ["The Coast", 45, "w"],
      ["The Tidal Island", 45, "s"],
      ["The Mud Flats", 46, "w"],
      ["The Karui Fortress", 47, "s"],
      ["The Ridge", 47, "w"],
      ["The Lower Prison", 48, "w"],
      ["Shavronne's Tower", 49, "w"],
      ["Prisoner's Gate", 50, "w"],
      ["The Riverways", 50, "w"],
      ["The Wetlands", 51, "w"],
      ["The Southern Forest", 51, "w"],
      ["The Beacon", 52, "w"],
      ["Brine King's Reef", 53, ""],
    ],
  },
  {
    act: 7,
    town: ["The Bridge Encampment", 54],
    zones: [
      ["The Broken Bridge", 54, ""],
      ["The Crossroads", 55, "w"],
      ["The Fellshrine Ruins", 55, "s"],
      ["The Crypt", 56, "sw"],
      ["The Chamber of Sins Level 1", 56, "w"],
      ["The Chamber of Sins Level 2", 57, ""],
      ["Maligaro's Sanctum", 57, "s"],
      ["The Ashen Fields", 57, "w"],
      ["The Northern Forest", 58, "w"],
      ["The Dread Thicket", 58, "s"],
      ["The Causeway", 59, "w"],
      ["The Vaal City", 59, "w"],
      ["The Temple of Decay Level 1", 60, ""],
      ["The Temple of Decay Level 2", 60, ""],
    ],
  },
  {
    act: 8,
    town: ["The Sarn Encampment", 60],
    zones: [
      ["The Sarn Ramparts", 60, "w"],
      ["The Toxic Conduits", 61, "w"],
      ["Doedre's Cesspool", 61, "w"],
      ["The Grand Promenade", 62, "w"],
      ["The High Gardens", 63, "s"],
      ["The Bath House", 62, "w"],
      ["The Lunaris Concourse", 63, "w"],
      ["The Lunaris Temple Level 1", 63, ""],
      ["The Lunaris Temple Level 2", 64, ""],
      ["The Grain Gate", 62, "w"],
      ["The Imperial Fields", 62, "w"],
      ["The Solaris Concourse", 63, "w"],
      ["The Solaris Temple Level 1", 63, ""],
      ["The Solaris Temple Level 2", 64, ""],
      ["The Quay", 63, "s"],
      ["The Harbour Bridge", 64, ""],
    ],
  },
  {
    act: 9,
    town: ["Highgate", 64],
    zones: [
      ["The Blood Aqueduct", 64, "w"],
      ["The Descent", 65, ""],
      ["The Vastiri Desert", 65, "w"],
      ["The Oasis", 66, "s"],
      ["The Foothills", 66, "w"],
      ["The Boiling Lake", 67, "s"],
      ["The Tunnel", 67, "w"],
      ["The Quarry", 68, "w"],
      ["The Refinery", 68, "s"],
      ["The Belly of the Beast", 68, ""],
      ["The Rotting Core", 68, ""],
    ],
  },
  {
    act: 10,
    town: ["Oriath Docks", 67],
    zones: [
      ["The Cathedral Rooftop", 67, ""],
      ["The Ravaged Square", 68, "w"],
      ["The Torched Courts", 69, "w"],
      ["The Desecrated Chambers", 70, "w"],
      ["The Ossuary", 69, "sw"],
      ["The Canals", 70, "w"],
      ["The Feeding Trough", 71, ""],
    ],
  },
];

// Epilogue town — entering it is the "campaign complete" proxy (post-Kitava).
const EPILOGUE = { act: 11, name: "Karui Shores", level: 60 };

// Well-known non-campaign areas the classifier should not treat as unknown.
const SPECIAL = [
  { name: "Aspirants' Plaza", kind: "lab", level: 33 },
  { name: "Aspirant's Trial", kind: "lab", level: 33 },
  { name: "The Menagerie", kind: "other", level: 1 },
  { name: "Azurite Mine", kind: "other", level: 1 },
  { name: "The Rogue Harbour", kind: "other", level: 1 },
  { name: "The Temple of Atzoatl", kind: "other", level: 1 },
  { name: "The Sacred Grove", kind: "other", level: 1 },
  { name: "Tane's Laboratory", kind: "other", level: 1 },
];

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const areas = [];
for (const { act, town, zones } of ACTS) {
  // The first zone of every act is entered before its town (e.g. The
  // Twilight Strand before Lioneye's Watch), so the town slots at 15.
  let order = 0;
  const [townName, townLevel] = town;
  const zoneRows = zones.map(([name, level, flags]) => ({
    id: `a${act}-${slug(name)}`,
    name,
    act,
    order: (order += 10),
    kind: "campaign",
    town: false,
    waypoint: flags.includes("w"),
    side: flags.includes("s"),
    level,
  }));
  areas.push(zoneRows[0]);
  areas.push({
    id: `a${act}-${slug(townName)}`,
    name: townName,
    act,
    order: 15,
    kind: "town",
    town: true,
    waypoint: true,
    side: false,
    level: townLevel,
  });
  areas.push(...zoneRows.slice(1));
}
areas.push({
  id: `a${EPILOGUE.act}-${slug(EPILOGUE.name)}`,
  name: EPILOGUE.name,
  act: EPILOGUE.act,
  order: 10,
  kind: "town",
  town: true,
  waypoint: true,
  side: false,
  level: EPILOGUE.level,
});
for (const s of SPECIAL) {
  areas.push({
    id: `x-${slug(s.name)}`,
    name: s.name,
    act: null,
    order: null,
    kind: s.kind,
    town: false,
    waypoint: false,
    side: false,
    level: s.level,
  });
}

// Sanity checks: ids unique; duplicate names only across different acts.
const ids = new Set();
for (const a of areas) {
  if (ids.has(a.id)) throw new Error(`duplicate id: ${a.id}`);
  ids.add(a.id);
}
const byName = new Map();
for (const a of areas) {
  const list = byName.get(a.name) ?? [];
  list.push(a);
  byName.set(a.name, list);
}
for (const [name, list] of byName) {
  const acts = list.map((a) => a.act);
  if (new Set(acts).size !== acts.length)
    throw new Error(`duplicate name within one act: ${name}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "crates", "core", "data", GAME, PATCH);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "areas.json");
writeFileSync(
  out,
  JSON.stringify({ game: GAME, patch: PATCH, areas }, null, 1) + "\n",
);
console.log(
  `wrote ${out}: ${areas.length} areas, ` +
    `${[...byName.values()].filter((l) => l.length > 1).length} duplicated names`,
);

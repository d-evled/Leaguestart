// PoE 1 character taxonomy for the plan dropdowns (current as of 3.24+ —
// Raider was reworked into Warden). PoB may still emit legacy names from
// old builds; the selects keep unknown values visible instead of dropping
// them.

export const CLASSES = [
  "Duelist",
  "Marauder",
  "Ranger",
  "Scion",
  "Shadow",
  "Templar",
  "Witch",
] as const;

export const ASCENDANCIES: Record<string, string[]> = {
  Duelist: ["Champion", "Gladiator", "Slayer"],
  Marauder: ["Berserker", "Chieftain", "Juggernaut"],
  Ranger: ["Deadeye", "Pathfinder", "Warden"],
  Scion: ["Ascendant"],
  Shadow: ["Assassin", "Saboteur", "Trickster"],
  Templar: ["Guardian", "Hierophant", "Inquisitor"],
  Witch: ["Elementalist", "Necromancer", "Occultist"],
};

// Permanent leagues. The current challenge league changes every ~4 months
// and can't be known ahead of time — the League select has a "Custom…"
// entry for typing it (e.g. "Mercenaries", "Mercenaries HC").
export const LEAGUE_PRESETS = [
  "Standard",
  "Hardcore",
  "SSF Standard",
  "SSF Hardcore",
];

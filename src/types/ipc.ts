// DTO types mirroring the Rust serde models (camelCase).
// Keep in sync with crates/core/src/db/models.rs and src-tauri/src/state.rs.

export interface Run {
  id: number;
  planId: number | null;
  kind: "practice" | "league_start";
  label: string | null;
  characterName: string | null;
  characterClass: string | null;
  startedAt: number;
  endedAt: number | null;
  status: "active" | "completed" | "abandoned";
  goal: { type: "first_map" | "complete_act10" | "manual" } | null;
  totalMs: number | null;
  totalLoadMs: number | null;
  deaths: number;
  notesMd: string | null;
  game: string;
  patch: string | null;
}

export interface ZoneSegment {
  id: number;
  runId: number;
  seq: number;
  areaId: string;
  clientAreaId: string | null;
  areaName: string;
  act: number | null;
  areaLevel: number | null;
  kind: "campaign" | "town" | "hideout" | "map" | "lab" | "other" | "unknown";
  enteredAt: number;
  exitedAt: number | null;
  loadMs: number;
  isRevisit: boolean;
  instanceSeed: number | null;
  excluded: boolean;
}

export interface LevelEvent {
  id: number;
  runId: number | null;
  progressionId: number | null;
  segmentId: number | null;
  character: string;
  class: string | null;
  level: number;
  at: number;
}

export interface DeathEvent {
  id: number;
  runId: number | null;
  progressionId: number | null;
  segmentId: number | null;
  character: string;
  at: number;
}

export interface RunDetail {
  run: Run;
  segments: ZoneSegment[];
  levels: LevelEvent[];
  deaths: DeathEvent[];
}

export interface LeaguePlan {
  id: number;
  name: string;
  game: string;
  leagueName: string | null;
  buildName: string | null;
  class: string | null;
  ascendancy: string | null;
  notesMd: string | null;
  createdAt: number;
  archived: boolean;
}

export interface PobCheckpoint {
  id: number;
  planId: number;
  label: string;
  sortOrder: number;
  pobCode: string | null;
  url: string | null;
  notes: string | null;
  decodedClass: string | null;
  decodedAscendancy: string | null;
  decodedLevel: number | null;
  decodedMainSkill: string | null;
  createdAt: number;
}

export interface GuideLink {
  id: number;
  planId: number;
  title: string;
  url: string;
  kind: "maxroll" | "youtube" | "forum" | "other";
  notes: string | null;
  sortOrder: number;
}

export interface AtlasProgression {
  id: number;
  planId: number | null;
  runId: number | null;
  label: string;
  characterName: string | null;
  startedAt: number;
  active: boolean;
  createdAt: number;
}

export interface TierMilestone {
  id: number;
  progressionId: number;
  tier: number;
  status: "candidate" | "completed" | "dismissed";
  mapAreaId: string | null;
  mapName: string | null;
  charLevel: number | null;
  enteredAt: number;
  completedAt: number | null;
  elapsedMs: number | null;
  diedInMap: boolean;
  manual: boolean;
}

export interface Voidstone {
  id: number;
  progressionId: number;
  stone: "decayed" | "grasping" | "omniscient" | "ceremonial";
  acquiredAt: number;
  charLevel: number | null;
  elapsedMs: number | null;
  notes: string | null;
}

export interface ProgressionDetail {
  progression: AtlasProgression;
  milestones: TierMilestone[];
  voidstones: Voidstone[];
  levels: LevelEvent[];
}

export interface ZoneNote {
  id: number;
  game: string;
  areaId: string;
  noteMd: string | null;
  flagged: boolean;
  updatedAt: number;
}

export interface CompareRow {
  areaId: string;
  areaName: string;
  act: number | null;
  order: number | null;
  kind: string;
  perRunMs: (number | null)[];
}

export interface CumulativePoint {
  rowIndex: number;
  cumulativeMs: number;
}

export interface LevelPoint {
  elapsedMs: number;
  level: number;
}

export interface CompareData {
  runs: Run[];
  rows: CompareRow[];
  cumulative: CumulativePoint[][];
  levelCurves: LevelPoint[][];
}

export interface ZoneStat {
  areaId: string;
  areaName: string;
  act: number | null;
  order: number | null;
  runsCounted: number;
  bestMs: number;
  medianMs: number;
  lastMs: number;
  iqrMs: number;
  shareOfAct: number;
  autoFlag: boolean;
  flagged: boolean;
  noteMd: string | null;
}

export interface TrackerStatus {
  state: "watching" | "no_file" | "idle" | "";
  logPath: string | null;
  chatWarning: boolean;
  lastEventAt: number | null;
  activeRunId: number | null;
  activeProgressionId: number | null;
}

export interface LogPathValidation {
  exists: boolean;
  size: number;
  modifiedAgoMs: number | null;
  sampleEvents: number;
}

export interface PobImport {
  class: string | null;
  ascendancy: string | null;
  level: number | null;
  /** "code" for a pasted code, otherwise the raw URL that was fetched. */
  source: string;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  url: string;
  title: string | null;
}

export type Settings = Record<string, unknown>;

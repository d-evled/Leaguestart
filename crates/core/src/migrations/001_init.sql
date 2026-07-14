-- Leaguestart schema v1. All timestamps are epoch milliseconds, all durations ms.

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

CREATE TABLE league_plans (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  game        TEXT NOT NULL DEFAULT 'poe1',
  league_name TEXT,
  build_name  TEXT,
  class       TEXT,
  ascendancy  TEXT,
  notes_md    TEXT,
  created_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pob_checkpoints (
  id          INTEGER PRIMARY KEY,
  plan_id     INTEGER NOT NULL REFERENCES league_plans(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  pob_code    TEXT,
  url         TEXT,
  notes       TEXT,
  decoded_class      TEXT,
  decoded_ascendancy TEXT,
  decoded_level      INTEGER,
  decoded_main_skill TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_pob_plan ON pob_checkpoints(plan_id, sort_order);

CREATE TABLE guide_links (
  id         INTEGER PRIMARY KEY,
  plan_id    INTEGER NOT NULL REFERENCES league_plans(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other', -- maxroll|youtube|forum|other
  notes      TEXT,
  sort_order INTEGER NOT NULL
);
CREATE INDEX idx_links_plan ON guide_links(plan_id, sort_order);

CREATE TABLE runs (
  id              INTEGER PRIMARY KEY,
  plan_id         INTEGER REFERENCES league_plans(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL DEFAULT 'practice', -- practice|league_start
  label           TEXT,
  character_name  TEXT,
  character_class TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  status          TEXT NOT NULL DEFAULT 'active', -- active|completed|abandoned
  goal_json       TEXT NOT NULL,
  total_ms        INTEGER,
  total_load_ms   INTEGER,
  deaths          INTEGER NOT NULL DEFAULT 0,
  notes_md        TEXT,
  game            TEXT NOT NULL DEFAULT 'poe1',
  patch           TEXT
);

CREATE TABLE zone_segments (
  id             INTEGER PRIMARY KEY,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  area_id        TEXT NOT NULL,     -- static slug, or "client:<id>"/"name:<name>" fallback
  client_area_id TEXT,              -- raw internal id observed in the Generating line
  area_name      TEXT NOT NULL,
  act            INTEGER,
  area_level     INTEGER,
  kind           TEXT NOT NULL,     -- campaign|town|hideout|map|lab|other|unknown
  entered_at     INTEGER NOT NULL,
  exited_at      INTEGER,
  load_ms        INTEGER NOT NULL DEFAULT 0, -- loading gap that preceded this segment
  is_revisit     INTEGER NOT NULL DEFAULT 0,
  instance_seed  INTEGER,
  excluded       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_segments_run ON zone_segments(run_id, seq);

CREATE TABLE atlas_progressions (
  id             INTEGER PRIMARY KEY,
  plan_id        INTEGER REFERENCES league_plans(id) ON DELETE SET NULL,
  run_id         INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  label          TEXT NOT NULL,
  character_name TEXT,
  started_at     INTEGER NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL
);

CREATE TABLE level_events (
  id             INTEGER PRIMARY KEY,
  run_id         INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  progression_id INTEGER REFERENCES atlas_progressions(id) ON DELETE CASCADE,
  segment_id     INTEGER REFERENCES zone_segments(id) ON DELETE SET NULL,
  character      TEXT NOT NULL,
  class          TEXT,
  level          INTEGER NOT NULL,
  at             INTEGER NOT NULL
);
CREATE INDEX idx_levels_run ON level_events(run_id);
CREATE INDEX idx_levels_prog ON level_events(progression_id);

CREATE TABLE deaths (
  id             INTEGER PRIMARY KEY,
  run_id         INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  progression_id INTEGER REFERENCES atlas_progressions(id) ON DELETE CASCADE,
  segment_id     INTEGER REFERENCES zone_segments(id) ON DELETE SET NULL,
  character      TEXT NOT NULL,
  at             INTEGER NOT NULL
);
CREATE INDEX idx_deaths_run ON deaths(run_id);

CREATE TABLE atlas_tier_milestones (
  id             INTEGER PRIMARY KEY,
  progression_id INTEGER NOT NULL REFERENCES atlas_progressions(id) ON DELETE CASCADE,
  tier           INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 16),
  status         TEXT NOT NULL DEFAULT 'candidate', -- candidate|completed|dismissed
  map_area_id    TEXT,
  map_name       TEXT,
  char_level     INTEGER,
  entered_at     INTEGER NOT NULL,
  completed_at   INTEGER,
  elapsed_ms     INTEGER,
  died_in_map    INTEGER NOT NULL DEFAULT 0,
  manual         INTEGER NOT NULL DEFAULT 0,
  UNIQUE(progression_id, tier)
);

CREATE TABLE voidstones (
  id             INTEGER PRIMARY KEY,
  progression_id INTEGER NOT NULL REFERENCES atlas_progressions(id) ON DELETE CASCADE,
  stone          TEXT NOT NULL, -- decayed|grasping|omniscient|ceremonial
  acquired_at    INTEGER NOT NULL,
  char_level     INTEGER,
  elapsed_ms     INTEGER,
  notes          TEXT,
  UNIQUE(progression_id, stone)
);

CREATE TABLE zone_notes (
  id         INTEGER PRIMARY KEY,
  game       TEXT NOT NULL DEFAULT 'poe1',
  area_id    TEXT NOT NULL,
  note_md    TEXT,
  flagged    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(game, area_id)
);

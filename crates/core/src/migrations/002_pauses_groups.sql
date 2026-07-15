-- Schema v2: run pause tracking + user-defined run groups.

CREATE TABLE run_groups (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Wall-clock intervals during which the run timer was paused (logged out,
-- game closed/crashed, AFK, or manual pause). Effective run time is
-- total_ms - paused_ms; per-zone stats are unaffected because the active
-- segment is closed when a pause begins.
CREATE TABLE run_pauses (
  id         INTEGER PRIMARY KEY,
  run_id     INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,            -- NULL = pause still open
  kind       TEXT NOT NULL,      -- exit|afk|manual
  auto       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_pauses_run ON run_pauses(run_id);

ALTER TABLE runs ADD COLUMN paused_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN group_id INTEGER REFERENCES run_groups(id) ON DELETE SET NULL;

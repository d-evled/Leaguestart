//! The event interpreter: consumes parsed log lines, maintains run/atlas
//! state, writes to SQLite, and reports what changed so the shell can emit
//! UI events.

use crate::areas::{AreaDb, SegmentKind};
use crate::db::models::Run;
use crate::db::repo::{atlas, runs};
use crate::log::parser::{LogEvent, LogLine};
use crate::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// The area id (from the static DB) that starts a campaign run.
const RUN_START_AREA: &str = "a1-the-twilight-strand";
/// Entering the epilogue town is the "campaign complete" proxy.
const EPILOGUE_AREA: &str = "a11-karui-shores";
/// Loading screens longer than this are treated as data errors and clamped.
const MAX_LOAD_MS: i64 = 10 * 60 * 1000;
/// Re-entering the Twilight Strand within this window of starting (while
/// still in act 1) is a relog, not a new run.
const RESTART_GRACE_MS: i64 = 15 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RunGoal {
    #[default]
    FirstMap,
    CompleteAct10,
    Manual,
}

#[derive(Debug, Clone, Default)]
pub struct TrackerConfig {
    pub game: String,
    pub patch: String,
    pub active_character: Option<String>,
    pub goal: RunGoal,
    pub default_plan_id: Option<i64>,
    /// Kind stamped on auto-started runs; the UI can reclassify afterwards.
    pub default_run_kind: String,
}

impl TrackerConfig {
    pub fn new(game: &str, patch: &str) -> Self {
        TrackerConfig {
            game: game.to_string(),
            patch: patch.to_string(),
            active_character: None,
            goal: RunGoal::FirstMap,
            default_plan_id: None,
            default_run_kind: "practice".to_string(),
        }
    }
}

/// What a batch of handled lines changed — the shell maps these to events.
#[derive(Debug, Clone, PartialEq)]
pub enum TrackerOutput {
    RunStarted(Run),
    /// Completed or abandoned (see `run.status`).
    RunFinished(Run),
    /// The active run's snapshot (segments/levels/deaths) changed.
    Snapshot,
    /// Atlas progression data changed.
    Atlas(i64),
    Notice(String),
}

#[derive(Debug, Clone)]
struct PendingGen {
    area_level: i64,
    client_id: String,
    seed: Option<i64>,
}

#[derive(Debug)]
struct RunState {
    run_id: i64,
    started_at: i64,
    kind: String,
    character: Option<String>,
    current_segment: Option<i64>,
    visited: HashSet<String>,
    act: u8,
}

#[derive(Debug)]
struct MapState {
    milestone_id: i64,
    died: bool,
}

#[derive(Debug)]
struct AtlasState {
    id: i64,
    started_at: i64,
    character: Option<String>,
    current_map: Option<MapState>,
}

pub struct Tracker {
    conn: Connection,
    areas: AreaDb,
    cfg: TrackerConfig,
    pending_load: Option<i64>,
    pending_gen: Option<PendingGen>,
    open_instances: HashMap<String, PendingGen>,
    char_levels: HashMap<String, (String, i64)>,
    run: Option<RunState>,
    atlas: Option<AtlasState>,
    last_uptime: Option<i64>,
}

impl Tracker {
    pub fn new(conn: Connection, areas: AreaDb, cfg: TrackerConfig) -> Self {
        Tracker {
            conn,
            areas,
            cfg,
            pending_load: None,
            pending_gen: None,
            open_instances: HashMap::new(),
            char_levels: HashMap::new(),
            run: None,
            atlas: None,
            last_uptime: None,
        }
    }

    pub fn config(&self) -> &TrackerConfig {
        &self.cfg
    }

    pub fn set_config(&mut self, cfg: TrackerConfig) {
        self.cfg = cfg;
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Resume active run / progression state from the database (app restart
    /// mid-session). In-memory caches (open instances, pending loads) are
    /// rebuilt as new lines arrive.
    pub fn reload_from_db(&mut self) -> Result<Vec<TrackerOutput>> {
        let mut out = Vec::new();
        self.run = None;
        if let Some(run) = runs::active_run(&self.conn)? {
            let segs = runs::segments(&self.conn, run.id)?;
            let act = segs
                .iter()
                .rev()
                .find_map(|s| {
                    (s.kind == "campaign" || s.kind == "town")
                        .then_some(s.act)
                        .flatten()
                })
                .unwrap_or(1) as u8;
            self.run = Some(RunState {
                run_id: run.id,
                started_at: run.started_at,
                kind: run.kind.clone(),
                character: run.character_name.clone(),
                current_segment: runs::open_segment(&self.conn, run.id)?.map(|s| s.id),
                visited: runs::visited_area_ids(&self.conn, run.id)?
                    .into_iter()
                    .collect(),
                act,
            });
            if let Some(name) = &run.character_name {
                if let Some(level) = runs::last_level(&self.conn, name)? {
                    self.char_levels.insert(
                        name.clone(),
                        (run.character_class.clone().unwrap_or_default(), level),
                    );
                }
            }
            out.push(TrackerOutput::Snapshot);
        }
        self.atlas = None;
        if let Some(p) = atlas::active_progression(&self.conn)? {
            if let Some(name) = &p.character_name {
                if let Some(level) = runs::last_level(&self.conn, name)? {
                    self.char_levels
                        .entry(name.clone())
                        .or_insert((String::new(), level));
                }
            }
            self.atlas = Some(AtlasState {
                id: p.id,
                started_at: p.started_at,
                character: p.character_name,
                // A candidate that was in-flight during a crash stays a
                // candidate until confirmed manually or replaced.
                current_map: None,
            });
        }
        Ok(out)
    }

    pub fn handle(&mut self, line: &LogLine) -> Result<Vec<TrackerOutput>> {
        // Uptime counter went backwards => game restarted: all open
        // instances died with the client.
        if let Some(up) = line.uptime_ms {
            if self.last_uptime.is_some_and(|last| up < last) {
                self.pending_load = None;
                self.pending_gen = None;
                self.open_instances.clear();
            }
            self.last_uptime = Some(up);
        }

        match &line.event {
            LogEvent::InstanceDetails => {
                self.pending_load = Some(line.ts_ms);
                Ok(vec![])
            }
            LogEvent::AreaGenerating { area_level, client_id, seed } => {
                self.pending_gen = Some(PendingGen {
                    area_level: *area_level,
                    client_id: client_id.clone(),
                    seed: *seed,
                });
                Ok(vec![])
            }
            LogEvent::ZoneEntered { name } => self.on_zone_entered(name, line.ts_ms),
            LogEvent::LevelUp { character, class, level } => {
                self.on_level_up(character, class, *level, line.ts_ms)
            }
            LogEvent::Death { character } => self.on_death(character, line.ts_ms),
            LogEvent::AfkMode { .. } => Ok(vec![]),
        }
    }

    fn ignored_by_filter(&self, character: &str) -> bool {
        self.cfg
            .active_character
            .as_deref()
            .is_some_and(|f| !f.eq_ignore_ascii_case(character))
    }

    fn on_zone_entered(&mut self, name: &str, ts: i64) -> Result<Vec<TrackerOutput>> {
        let mut out = Vec::new();

        let gen = self
            .pending_gen
            .take()
            .or_else(|| self.open_instances.get(name).cloned());
        let act_hint = self.run.as_ref().map(|r| r.act);
        let resolved = self.areas.resolve(
            name,
            gen.as_ref().map(|g| g.area_level),
            gen.as_ref().map(|g| g.client_id.as_str()),
            act_hint,
        );
        if let Some(g) = &gen {
            self.open_instances.insert(name.to_string(), g.clone());
        }
        let load_ms = self
            .pending_load
            .take()
            .map(|start| (ts - start).clamp(0, MAX_LOAD_MS))
            .unwrap_or(0);

        // -- Run lifecycle --
        if resolved.area_id == RUN_START_AREA {
            let restart_same_run = self.run.as_ref().is_some_and(|r| {
                r.act <= 1 && ts - r.started_at < RESTART_GRACE_MS
            });
            if !restart_same_run {
                if self.run.is_some() {
                    out.extend(self.finish_run("abandoned", ts)?);
                    out.push(TrackerOutput::Notice(
                        "Previous run abandoned: a new run started".into(),
                    ));
                }
                let run = runs::insert_run(
                    &self.conn,
                    &runs::NewRun {
                        plan_id: self.cfg.default_plan_id,
                        kind: &self.cfg.default_run_kind,
                        started_at: ts,
                        goal: &serde_json::to_value(self.cfg.goal).unwrap(),
                        game: &self.cfg.game,
                        patch: &self.cfg.patch,
                    },
                )?;
                self.run = Some(RunState {
                    run_id: run.id,
                    started_at: ts,
                    kind: run.kind.clone(),
                    character: None,
                    current_segment: None,
                    visited: HashSet::new(),
                    act: 1,
                });
                out.push(TrackerOutput::RunStarted(run));
            }
        }

        // -- Segment stitching --
        if let Some(run) = &mut self.run {
            if let Some(seg_id) = run.current_segment.take() {
                // The load gap belongs to neither zone; the previous zone
                // ended when the transition began.
                runs::close_segment(&self.conn, seg_id, ts - load_ms)?;
            }
            let is_revisit = run.visited.contains(&resolved.area_id);
            let seg = runs::insert_segment(
                &self.conn,
                &runs::NewSegment {
                    run_id: run.run_id,
                    area_id: &resolved.area_id,
                    client_area_id: gen.as_ref().map(|g| g.client_id.as_str()),
                    area_name: &resolved.name,
                    act: resolved.act.map(|a| a as i64),
                    area_level: resolved.area_level,
                    kind: resolved.kind.as_str(),
                    entered_at: ts,
                    load_ms,
                    is_revisit,
                    instance_seed: gen.as_ref().and_then(|g| g.seed),
                },
            )?;
            run.visited.insert(resolved.area_id.clone());
            run.current_segment = Some(seg.id);
            if matches!(resolved.kind, SegmentKind::Campaign | SegmentKind::Town) {
                if let Some(act) = resolved.act {
                    run.act = act;
                }
            }
            out.push(TrackerOutput::Snapshot);

            // -- Goal completion --
            let goal = self.cfg.goal;
            let done = match goal {
                RunGoal::FirstMap => resolved.kind == SegmentKind::Map,
                RunGoal::CompleteAct10 => resolved.area_id == EPILOGUE_AREA,
                RunGoal::Manual => false,
            };
            if done {
                out.extend(self.finish_run("completed", ts)?);
            }
        }

        // -- Atlas tier milestones (endgame phase: no active campaign run) --
        if self.run.is_none() {
            if let Some(state) = &mut self.atlas {
                if resolved.kind == SegmentKind::Map {
                    if let Some(tier) = resolved.map_tier {
                        let existing =
                            atlas::milestone_for_tier(&self.conn, state.id, tier)?;
                        let completed =
                            existing.is_some_and(|m| m.status == "completed");
                        if !completed {
                            let char_level = state
                                .character
                                .as_ref()
                                .and_then(|c| self.char_levels.get(c))
                                .map(|(_, l)| *l);
                            let m = atlas::upsert_candidate(
                                &self.conn,
                                &atlas::CandidateInput {
                                    progression_id: state.id,
                                    tier,
                                    map_area_id: gen
                                        .as_ref()
                                        .map(|g| g.client_id.as_str()),
                                    map_name: Some(&resolved.name),
                                    char_level,
                                    entered_at: ts,
                                    elapsed_ms: Some(ts - state.started_at),
                                },
                            )?;
                            state.current_map =
                                Some(MapState { milestone_id: m.id, died: false });
                            out.push(TrackerOutput::Atlas(state.id));
                        } else {
                            state.current_map = None;
                        }
                    }
                } else if let Some(cm) = state.current_map.take() {
                    if !cm.died {
                        atlas::complete_milestone(&self.conn, cm.milestone_id, ts)?;
                        out.push(TrackerOutput::Atlas(state.id));
                    }
                }
            }
        }

        Ok(out)
    }

    fn on_level_up(
        &mut self,
        character: &str,
        class: &str,
        level: i64,
        ts: i64,
    ) -> Result<Vec<TrackerOutput>> {
        self.char_levels
            .insert(character.to_string(), (class.to_string(), level));
        if self.ignored_by_filter(character) {
            return Ok(vec![]);
        }
        let mut out = Vec::new();
        if let Some(run) = &mut self.run {
            if run.character.is_none() {
                run.character = Some(character.to_string());
                runs::set_run_character(&self.conn, run.run_id, character, class)?;
            }
            if run.character.as_deref() == Some(character) {
                runs::insert_level_event(
                    &self.conn,
                    &runs::NewLevelEvent {
                        run_id: Some(run.run_id),
                        progression_id: None,
                        segment_id: run.current_segment,
                        character,
                        class: Some(class),
                        level,
                        at: ts,
                    },
                )?;
                out.push(TrackerOutput::Snapshot);
            }
        } else if let Some(state) = &mut self.atlas {
            if state.character.is_none() {
                state.character = Some(character.to_string());
                self.conn.execute(
                    "UPDATE atlas_progressions SET character_name=?2 WHERE id=?1",
                    rusqlite::params![state.id, character],
                )?;
            }
            if state.character.as_deref() == Some(character) {
                runs::insert_level_event(
                    &self.conn,
                    &runs::NewLevelEvent {
                        run_id: None,
                        progression_id: Some(state.id),
                        segment_id: None,
                        character,
                        class: Some(class),
                        level,
                        at: ts,
                    },
                )?;
                out.push(TrackerOutput::Atlas(state.id));
            }
        }
        Ok(out)
    }

    fn on_death(&mut self, character: &str, ts: i64) -> Result<Vec<TrackerOutput>> {
        if self.ignored_by_filter(character) {
            return Ok(vec![]);
        }
        let mut out = Vec::new();
        if let Some(run) = &mut self.run {
            if run.character.is_none() {
                run.character = Some(character.to_string());
            }
            if run.character.as_deref() == Some(character) {
                runs::insert_death(
                    &self.conn,
                    Some(run.run_id),
                    None,
                    run.current_segment,
                    character,
                    ts,
                )?;
                runs::bump_deaths(&self.conn, run.run_id)?;
                out.push(TrackerOutput::Snapshot);
            }
        } else if let Some(state) = &mut self.atlas {
            if state.character.as_deref().is_none_or(|c| c == character) {
                runs::insert_death(&self.conn, None, Some(state.id), None, character, ts)?;
                if let Some(cm) = &mut state.current_map {
                    cm.died = true;
                    atlas::set_milestone_died(&self.conn, cm.milestone_id)?;
                }
                out.push(TrackerOutput::Atlas(state.id));
            }
        }
        Ok(out)
    }

    /// Finish the active run (goal reached, manual stop, or abandonment).
    /// A `league_start` run rolls straight into a new atlas progression.
    pub fn finish_run(&mut self, status: &str, ts: i64) -> Result<Vec<TrackerOutput>> {
        let Some(run_state) = self.run.take() else {
            return Ok(vec![]);
        };
        if let Some(seg_id) = run_state.current_segment {
            runs::close_segment(&self.conn, seg_id, ts)?;
        }
        let run = runs::finish_run(&self.conn, run_state.run_id, status, ts)?;
        let mut out = vec![TrackerOutput::RunFinished(run.clone()), TrackerOutput::Snapshot];
        if status == "completed" && run.kind == "league_start" {
            let p = atlas::create_progression(
                &self.conn,
                run.plan_id,
                Some(run.id),
                &format!(
                    "Atlas — {}",
                    run.character_name.as_deref().unwrap_or("league start")
                ),
                run.character_name.as_deref(),
                run.started_at,
            )?;
            self.atlas = Some(AtlasState {
                id: p.id,
                started_at: p.started_at,
                character: p.character_name.clone(),
                current_map: None,
            });
            out.push(TrackerOutput::Atlas(p.id));
            out.push(TrackerOutput::Notice(
                "Campaign complete — atlas progression tracking started".into(),
            ));
        }
        Ok(out)
    }

    /// Manual stop from the UI.
    pub fn stop_active_run(&mut self, abandon: bool) -> Result<Vec<TrackerOutput>> {
        let status = if abandon { "abandoned" } else { "completed" };
        self.finish_run(status, crate::db::now_ms())
    }

    pub fn has_active_run(&self) -> bool {
        self.run.is_some()
    }

    /// Warm in-memory context (open instances, character levels, pending
    /// generation) from historical lines without writing anything to the
    /// database. Used with `watcher::backscan_lines` when the app starts
    /// while the game is already running.
    pub fn warm(&mut self, line: &LogLine) {
        if let Some(up) = line.uptime_ms {
            if self.last_uptime.is_some_and(|last| up < last) {
                self.open_instances.clear();
                self.pending_gen = None;
            }
            self.last_uptime = Some(up);
        }
        match &line.event {
            LogEvent::AreaGenerating { area_level, client_id, seed } => {
                self.pending_gen = Some(PendingGen {
                    area_level: *area_level,
                    client_id: client_id.clone(),
                    seed: *seed,
                });
            }
            LogEvent::ZoneEntered { name } => {
                if let Some(g) = self.pending_gen.take() {
                    self.open_instances.insert(name.clone(), g);
                }
            }
            LogEvent::LevelUp { character, class, level } => {
                self.char_levels
                    .insert(character.clone(), (class.clone(), *level));
            }
            _ => {}
        }
    }
}

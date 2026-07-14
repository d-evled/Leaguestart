//! The tracker thread: tails Client.txt, feeds the core tracker, emits UI
//! events, and reacts to control messages from commands.

use crate::events;
use crate::state::{AppState, CtlMsg, TrackerStatus};
use leaguestart_core::areas::AreaDb;
use leaguestart_core::db::repo::{atlas, runs, settings};
use leaguestart_core::log::parser::{self, LogEvent};
use leaguestart_core::log::watcher::{backscan_lines, LogWatcher};
use leaguestart_core::rusqlite::Connection;
use leaguestart_core::tracker::{RunGoal, Tracker, TrackerConfig};
use std::path::Path;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const GAME: &str = "poe1";
const PATCH: &str = "3.26";
/// Don't replay more than this much missed log on startup (a week of play
/// while the app was closed should not be re-ingested at once).
const CURSOR_RESUME_MAX_BYTES: u64 = 2 * 1024 * 1024;
const BACKSCAN_BYTES: u64 = 64 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(400);
/// Status heartbeat every N poll ticks (~5s).
const STATUS_EVERY_TICKS: u32 = 12;

fn read_config(conn: &Connection) -> TrackerConfig {
    let mut cfg = TrackerConfig::new(GAME, PATCH);
    cfg.active_character = settings::get_string(conn, "active_character")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    cfg.goal = settings::get(conn, "run_goal")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<RunGoal>(v).ok())
        .unwrap_or_default();
    cfg.default_plan_id = settings::get(conn, "active_plan_id")
        .ok()
        .flatten()
        .and_then(|v| v.as_i64());
    cfg.default_run_kind = settings::get_string(conn, "default_run_kind")
        .ok()
        .flatten()
        .filter(|s| s == "league_start" || s == "practice")
        .unwrap_or_else(|| "practice".to_string());
    cfg
}

/// (Re)create the watcher from the configured path, resuming the persisted
/// cursor when it is close enough, and warm tracker context via backscan.
fn setup_watcher(
    watcher: &mut Option<LogWatcher>,
    tracker: &mut Tracker,
    status: &mut TrackerStatus,
) {
    let path = settings::get_string(tracker.conn(), "client_log_path")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    status.log_path = path.clone();
    let Some(path) = path else {
        *watcher = None;
        status.state = "idle".to_string();
        return;
    };
    let path = std::path::PathBuf::from(path);

    let cursor_offset = settings::get(tracker.conn(), "log_cursor")
        .ok()
        .flatten()
        .and_then(|v| {
            let same = v.get("path").and_then(|p| p.as_str())
                == path.to_str();
            let offset = v.get("offset").and_then(|o| o.as_u64())?;
            same.then_some(offset)
        });
    let file_len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let resume = cursor_offset
        .filter(|&off| off <= file_len && file_len - off <= CURSOR_RESUME_MAX_BYTES);

    let w = match resume {
        Some(offset) => LogWatcher::start_at(&path, offset),
        None => LogWatcher::start_at_end(&path),
    };
    match w {
        Ok(w) => {
            // Warm in-memory context (current instances, character levels)
            // from recent history without replaying it as live events.
            if resume.is_none() {
                if let Ok(lines) = backscan_lines(&path, BACKSCAN_BYTES) {
                    for raw in &lines {
                        if let Some(line) = parser::parse_line(raw) {
                            tracker.warm(&line);
                        }
                    }
                }
            }
            status.state = "watching".to_string();
            *watcher = Some(w);
        }
        Err(_) => {
            status.state = "no_file".to_string();
            *watcher = None;
        }
    }
}

fn refresh_ids(status: &mut TrackerStatus, conn: &Connection) {
    status.active_run_id = runs::active_run(conn).ok().flatten().map(|r| r.id);
    status.active_progression_id =
        atlas::active_progression(conn).ok().flatten().map(|p| p.id);
}

fn push_status(app: &AppHandle, status: &TrackerStatus) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut s) = state.status.lock() {
            *s = status.clone();
        }
    }
    events::emit_status(app, status);
}

fn push_recent(app: &AppHandle, raw: &str) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut buf) = state.recent_events.lock() {
            if buf.len() >= 100 {
                buf.pop_front();
            }
            buf.push_back(raw.to_string());
        }
    }
}

pub fn run(app: AppHandle, conn: Connection, rx: Receiver<CtlMsg>) {
    let areas = AreaDb::load_embedded();
    let cfg = read_config(&conn);
    let mut tracker = Tracker::new(conn, areas, cfg);
    let initial = tracker.reload_from_db().unwrap_or_default();

    let mut status = TrackerStatus::default();
    let mut watcher: Option<LogWatcher> = None;
    let mut gen_without_zone: u32 = 0;
    let mut ticks: u32 = 0;

    setup_watcher(&mut watcher, &mut tracker, &mut status);
    events::emit_outputs(&app, tracker.conn(), &initial);
    refresh_ids(&mut status, tracker.conn());
    push_status(&app, &status);

    loop {
        match rx.recv_timeout(POLL_INTERVAL) {
            Ok(CtlMsg::Shutdown) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(CtlMsg::Reload) => {
                let cfg = read_config(tracker.conn());
                tracker.set_config(cfg);
                let outs = tracker.reload_from_db().unwrap_or_default();
                let configured = settings::get_string(tracker.conn(), "client_log_path")
                    .ok()
                    .flatten()
                    .filter(|s| !s.is_empty());
                let path_changed = match (&watcher, &configured) {
                    (Some(w), Some(p)) => w.path() != Path::new(p),
                    (None, Some(_)) | (Some(_), None) => true,
                    (None, None) => false,
                };
                if path_changed {
                    setup_watcher(&mut watcher, &mut tracker, &mut status);
                }
                events::emit_outputs(&app, tracker.conn(), &outs);
                refresh_ids(&mut status, tracker.conn());
                push_status(&app, &status);
            }
            Ok(CtlMsg::StopRun { abandon }) => {
                let outs = tracker.stop_active_run(abandon).unwrap_or_default();
                events::emit_outputs(&app, tracker.conn(), &outs);
                refresh_ids(&mut status, tracker.conn());
                push_status(&app, &status);
            }
            Err(RecvTimeoutError::Timeout) => {}
        }

        let mut status_dirty = false;
        if let Some(w) = watcher.as_mut() {
            match w.poll() {
                Ok(res) => {
                    let new_state = if res.exists { "watching" } else { "no_file" };
                    if status.state != new_state {
                        status.state = new_state.to_string();
                        status_dirty = true;
                    }
                    if res.truncated {
                        let _ = tauri::Emitter::emit(
                            &app,
                            "notice://message",
                            events::Notice {
                                text: "Log file was truncated or replaced — resumed from its end"
                                    .to_string(),
                            },
                        );
                    }
                    if !res.lines.is_empty() {
                        let mut outputs = Vec::new();
                        for raw in &res.lines {
                            if let Some(line) = parser::parse_line(raw) {
                                push_recent(&app, raw);
                                match &line.event {
                                    LogEvent::AreaGenerating { .. } => gen_without_zone += 1,
                                    LogEvent::ZoneEntered { .. } => {
                                        gen_without_zone = 0;
                                        if status.chat_warning {
                                            status.chat_warning = false;
                                            status_dirty = true;
                                        }
                                    }
                                    _ => {}
                                }
                                status.last_event_at = Some(line.ts_ms);
                                if let Ok(outs) = tracker.handle(&line) {
                                    outputs.extend(outs);
                                }
                            }
                        }
                        // Zones generate but never "entered": local chat is
                        // probably disabled in-game — the tracker is blind.
                        if gen_without_zone >= 3 && !status.chat_warning {
                            status.chat_warning = true;
                            status_dirty = true;
                        }
                        if !outputs.is_empty() {
                            events::emit_outputs(&app, tracker.conn(), &outputs);
                            refresh_ids(&mut status, tracker.conn());
                            status_dirty = true;
                        }
                        let _ = settings::set(
                            tracker.conn(),
                            "log_cursor",
                            &serde_json::json!({
                                "path": w.path().to_string_lossy(),
                                "offset": w.offset(),
                            }),
                        );
                    }
                }
                Err(_) => {
                    if status.state != "no_file" {
                        status.state = "no_file".to_string();
                        status_dirty = true;
                    }
                }
            }
        }

        ticks = ticks.wrapping_add(1);
        if status_dirty || ticks % STATUS_EVERY_TICKS == 0 {
            push_status(&app, &status);
        }
    }
}

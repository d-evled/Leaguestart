use super::{conn, err_str};
use crate::events::emit_data_changed;
use crate::state::{AppState, CtlMsg, TrackerStatus};
use leaguestart_core::db::repo::settings;
use leaguestart_core::log::{parser, watcher};
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, State};

/// Settings keys that affect the tracker thread's behavior.
const TRACKER_KEYS: &[&str] = &[
    "client_log_path",
    "active_character",
    "run_goal",
    "active_plan_id",
    "default_run_kind",
];

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<HashMap<String, serde_json::Value>, String> {
    settings::get_all(&*conn(&state)?).map_err(err_str)
}

#[tauri::command]
pub fn set_setting(
    app: AppHandle,
    state: State<AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    settings::set(&*conn(&state)?, &key, &value).map_err(err_str)?;
    if TRACKER_KEYS.contains(&key.as_str()) {
        let _ = state.ctl.send(CtlMsg::Reload);
    }
    emit_data_changed(&app, "settings");
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPathValidation {
    pub exists: bool,
    pub size: u64,
    pub modified_ago_ms: Option<i64>,
    /// Parsed events found in the last 32 KB — a quick "is this really
    /// Client.txt (and is local chat on)?" check.
    pub sample_events: i64,
}

#[tauri::command]
pub fn validate_log_path(path: String) -> Result<LogPathValidation, String> {
    let p = std::path::Path::new(&path);
    let Ok(meta) = std::fs::metadata(p) else {
        return Ok(LogPathValidation {
            exists: false,
            size: 0,
            modified_ago_ms: None,
            sample_events: 0,
        });
    };
    let modified_ago_ms = meta
        .modified()
        .ok()
        .and_then(|m| m.elapsed().ok())
        .map(|d| d.as_millis() as i64);
    let sample_events = watcher::backscan_lines(p, 32 * 1024)
        .map(|lines| {
            lines
                .iter()
                .filter(|l| parser::parse_line(l).is_some())
                .count() as i64
        })
        .unwrap_or(0);
    Ok(LogPathValidation {
        exists: true,
        size: meta.len(),
        modified_ago_ms,
        sample_events,
    })
}

#[tauri::command]
pub fn get_tracker_status(state: State<AppState>) -> Result<TrackerStatus, String> {
    Ok(state.status.lock().map_err(err_str)?.clone())
}

#[tauri::command]
pub fn recent_parsed_events(state: State<AppState>) -> Result<Vec<String>, String> {
    Ok(state
        .recent_events
        .lock()
        .map_err(err_str)?
        .iter()
        .cloned()
        .collect())
}

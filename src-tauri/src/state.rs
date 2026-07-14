use leaguestart_core::areas::AreaDb;
use leaguestart_core::rusqlite::Connection;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::mpsc::Sender;
use std::sync::Mutex;

/// Messages to the tracker thread.
#[derive(Debug)]
pub enum CtlMsg {
    /// Settings changed (log path, character filter, goal, active plan) or
    /// the active run/progression was changed from the UI: re-read config
    /// and state from the database.
    Reload,
    StopRun { abandon: bool },
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrackerStatus {
    /// "watching" | "no_file" | "idle" (no path configured)
    pub state: String,
    pub log_path: Option<String>,
    pub chat_warning: bool,
    pub last_event_at: Option<i64>,
    pub active_run_id: Option<i64>,
    pub active_progression_id: Option<i64>,
}

pub struct AppState {
    /// Command-side connection (the tracker thread owns its own).
    pub db: Mutex<Connection>,
    pub ctl: Sender<CtlMsg>,
    pub areas: AreaDb,
    pub status: Mutex<TrackerStatus>,
    pub recent_events: Mutex<VecDeque<String>>,
}

pub mod analysis;
pub mod atlas;
pub mod notes;
pub mod plans;
pub mod runs;
pub mod settings;

use crate::state::AppState;
use leaguestart_core::rusqlite::Connection;
use std::sync::MutexGuard;

pub fn conn<'a>(state: &'a tauri::State<AppState>) -> Result<MutexGuard<'a, Connection>, String> {
    state.db.lock().map_err(|e| e.to_string())
}

pub fn err_str<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

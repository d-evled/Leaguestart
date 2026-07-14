use super::{conn, err_str};
use crate::state::AppState;
use leaguestart_core::db::models::{CompareData, ZoneStat};
use leaguestart_core::db::repo::analysis;
use tauri::State;

#[tauri::command]
pub fn compare_runs(state: State<AppState>, run_ids: Vec<i64>) -> Result<CompareData, String> {
    analysis::compare(&conn(&state)?, &state.areas, &run_ids).map_err(err_str)
}

#[tauri::command]
pub fn zone_stats(state: State<AppState>, plan_id: Option<i64>) -> Result<Vec<ZoneStat>, String> {
    analysis::zone_stats(&conn(&state)?, &state.areas, plan_id, "poe1").map_err(err_str)
}

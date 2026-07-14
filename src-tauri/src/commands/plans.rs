use super::{conn, err_str};
use crate::events::emit_data_changed;
use crate::state::AppState;
use leaguestart_core::db::models::{GuideLink, LeaguePlan, PobCheckpoint};
use leaguestart_core::db::repo::plans;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_plans(state: State<AppState>) -> Result<Vec<LeaguePlan>, String> {
    plans::list_plans(&*conn(&state)?).map_err(err_str)
}

#[tauri::command]
pub fn upsert_plan(
    app: AppHandle,
    state: State<AppState>,
    input: plans::PlanInput,
) -> Result<LeaguePlan, String> {
    let plan = plans::upsert_plan(&*conn(&state)?, &input).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(plan)
}

#[tauri::command]
pub fn delete_plan(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    plans::delete_plan(&*conn(&state)?, id).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(())
}

#[tauri::command]
pub fn list_checkpoints(
    state: State<AppState>,
    plan_id: i64,
) -> Result<Vec<PobCheckpoint>, String> {
    plans::list_checkpoints(&*conn(&state)?, plan_id).map_err(err_str)
}

#[tauri::command]
pub fn upsert_checkpoint(
    app: AppHandle,
    state: State<AppState>,
    input: plans::CheckpointInput,
) -> Result<PobCheckpoint, String> {
    let cp = plans::upsert_checkpoint(&*conn(&state)?, &input).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(cp)
}

#[tauri::command]
pub fn delete_checkpoint(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    plans::delete_checkpoint(&*conn(&state)?, id).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(())
}

#[tauri::command]
pub fn reorder_checkpoints(
    app: AppHandle,
    state: State<AppState>,
    ids: Vec<i64>,
) -> Result<(), String> {
    plans::reorder_checkpoints(&*conn(&state)?, &ids).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(())
}

#[tauri::command]
pub fn list_links(state: State<AppState>, plan_id: i64) -> Result<Vec<GuideLink>, String> {
    plans::list_links(&*conn(&state)?, plan_id).map_err(err_str)
}

#[tauri::command]
pub fn upsert_link(
    app: AppHandle,
    state: State<AppState>,
    input: plans::LinkInput,
) -> Result<GuideLink, String> {
    let link = plans::upsert_link(&*conn(&state)?, &input).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(link)
}

#[tauri::command]
pub fn delete_link(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    plans::delete_link(&*conn(&state)?, id).map_err(err_str)?;
    emit_data_changed(&app, "plans");
    Ok(())
}

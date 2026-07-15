use super::{conn, err_str};
use crate::events::{active_run_snapshot, emit_data_changed};
use crate::state::{AppState, CtlMsg};
use leaguestart_core::db::models::{RunDetail, RunGroup, RunListEntry};
use leaguestart_core::db::repo::{groups, runs};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_runs(state: State<AppState>) -> Result<Vec<RunListEntry>, String> {
    runs::list_run_entries(&*conn(&state)?).map_err(err_str)
}

#[tauri::command]
pub fn get_run_detail(state: State<AppState>, id: i64) -> Result<Option<RunDetail>, String> {
    runs::run_detail(&*conn(&state)?, id).map_err(err_str)
}

#[tauri::command]
pub fn get_active_run(state: State<AppState>) -> Result<Option<RunDetail>, String> {
    Ok(active_run_snapshot(&*conn(&state)?))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_run_meta(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    kind: String,
    label: Option<String>,
    plan_id: Option<i64>,
    notes_md: Option<String>,
) -> Result<(), String> {
    runs::update_run_meta(
        &*conn(&state)?,
        id,
        &kind,
        label.as_deref(),
        plan_id,
        notes_md.as_deref(),
    )
    .map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

#[tauri::command]
pub fn delete_run(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    runs::delete_run(&*conn(&state)?, id).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

#[tauri::command]
pub fn stop_active_run(state: State<AppState>, abandon: bool) -> Result<(), String> {
    state.ctl.send(CtlMsg::StopRun { abandon }).map_err(err_str)
}

#[tauri::command]
pub fn pause_active_run(state: State<AppState>) -> Result<(), String> {
    state.ctl.send(CtlMsg::PauseRun).map_err(err_str)
}

#[tauri::command]
pub fn resume_active_run(state: State<AppState>) -> Result<(), String> {
    state.ctl.send(CtlMsg::ResumeRun).map_err(err_str)
}

// ---- Run groups ----

#[tauri::command]
pub fn list_run_groups(state: State<AppState>) -> Result<Vec<RunGroup>, String> {
    groups::list(&*conn(&state)?).map_err(err_str)
}

#[tauri::command]
pub fn create_run_group(
    app: AppHandle,
    state: State<AppState>,
    name: String,
) -> Result<RunGroup, String> {
    let group = groups::create(&*conn(&state)?, name.trim()).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(group)
}

#[tauri::command]
pub fn rename_run_group(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    name: String,
) -> Result<(), String> {
    groups::rename(&*conn(&state)?, id, name.trim()).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

#[tauri::command]
pub fn delete_run_group(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    groups::delete(&*conn(&state)?, id).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

#[tauri::command]
pub fn set_run_group(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    group_id: Option<i64>,
) -> Result<(), String> {
    groups::set_run_group(&*conn(&state)?, id, group_id).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

#[tauri::command]
pub fn set_segment_excluded(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    excluded: bool,
) -> Result<(), String> {
    runs::set_segment_excluded(&*conn(&state)?, id, excluded).map_err(err_str)?;
    emit_data_changed(&app, "runs");
    Ok(())
}

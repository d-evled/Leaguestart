use super::{conn, err_str};
use crate::events::emit_data_changed;
use crate::state::{AppState, CtlMsg};
use leaguestart_core::db::models::{AtlasProgression, ProgressionDetail, Voidstone};
use leaguestart_core::db::now_ms;
use leaguestart_core::db::repo::{atlas, runs};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_progressions(state: State<AppState>) -> Result<Vec<AtlasProgression>, String> {
    atlas::list_progressions(&conn(&state)?).map_err(err_str)
}

#[tauri::command]
pub fn get_progression_detail(
    state: State<AppState>,
    id: i64,
) -> Result<Option<ProgressionDetail>, String> {
    atlas::progression_detail(&conn(&state)?, id).map_err(err_str)
}

#[tauri::command]
pub fn create_progression(
    app: AppHandle,
    state: State<AppState>,
    label: String,
    plan_id: Option<i64>,
) -> Result<AtlasProgression, String> {
    let p = atlas::create_progression(&conn(&state)?, plan_id, None, &label, None, now_ms())
        .map_err(err_str)?;
    let _ = state.ctl.send(CtlMsg::Reload);
    emit_data_changed(&app, "atlas");
    Ok(p)
}

#[tauri::command]
pub fn set_progression_active(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    active: bool,
) -> Result<(), String> {
    atlas::set_progression_active(&conn(&state)?, id, active).map_err(err_str)?;
    let _ = state.ctl.send(CtlMsg::Reload);
    emit_data_changed(&app, "atlas");
    Ok(())
}

#[tauri::command]
pub fn delete_progression(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    atlas::delete_progression(&conn(&state)?, id).map_err(err_str)?;
    let _ = state.ctl.send(CtlMsg::Reload);
    emit_data_changed(&app, "atlas");
    Ok(())
}

#[tauri::command]
pub fn set_milestone_status(
    app: AppHandle,
    state: State<AppState>,
    id: i64,
    status: String,
) -> Result<(), String> {
    atlas::set_milestone_status(&conn(&state)?, id, &status).map_err(err_str)?;
    emit_data_changed(&app, "atlas");
    Ok(())
}

#[tauri::command]
pub fn toggle_voidstone(
    app: AppHandle,
    state: State<AppState>,
    progression_id: i64,
    stone: String,
) -> Result<Vec<Voidstone>, String> {
    let db = conn(&state)?;
    let char_level = atlas::get_progression(&db, progression_id)
        .map_err(err_str)?
        .and_then(|p| p.character_name)
        .and_then(|name| runs::last_level(&db, &name).ok().flatten());
    let stones =
        atlas::toggle_voidstone(&db, progression_id, &stone, char_level).map_err(err_str)?;
    emit_data_changed(&app, "atlas");
    Ok(stones)
}

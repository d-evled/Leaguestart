use super::{conn, err_str};
use crate::events::emit_data_changed;
use crate::state::AppState;
use leaguestart_core::db::models::ZoneNote;
use leaguestart_core::db::repo::notes;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_zone_notes(state: State<AppState>) -> Result<Vec<ZoneNote>, String> {
    notes::list(&conn(&state)?, "poe1").map_err(err_str)
}

#[tauri::command]
pub fn set_zone_note(
    app: AppHandle,
    state: State<AppState>,
    area_id: String,
    note_md: Option<String>,
    flagged: bool,
) -> Result<ZoneNote, String> {
    let note = notes::set(&conn(&state)?, "poe1", &area_id, note_md.as_deref(), flagged)
        .map_err(err_str)?;
    emit_data_changed(&app, "notes");
    Ok(note)
}

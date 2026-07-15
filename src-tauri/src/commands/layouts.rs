use leaguestart_core::layouts::LayoutDb;

/// Static embedded data — cheap to clone, cached by the frontend forever.
#[tauri::command]
pub fn get_layouts() -> LayoutDb {
    LayoutDb::load_embedded().clone()
}

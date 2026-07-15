mod commands;
mod events;
mod state;
mod tracker_thread;

use leaguestart_core::areas::AreaDb;
use leaguestart_core::db;
use state::{AppState, TrackerStatus};
use std::collections::VecDeque;
use std::sync::{mpsc, Mutex};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("leaguestart.db3");

            let command_conn = db::open(&db_path)?;
            let (tx, rx) = mpsc::channel();

            app.manage(AppState {
                db: Mutex::new(command_conn),
                ctl: tx,
                areas: AreaDb::load_embedded(),
                status: Mutex::new(TrackerStatus::default()),
                recent_events: Mutex::new(VecDeque::with_capacity(128)),
            });

            let handle = app.handle().clone();
            let thread_conn = db::open(&db_path)?;
            std::thread::Builder::new()
                .name("tracker".into())
                .spawn(move || tracker_thread::run(handle, thread_conn, rx))?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    let _ = state.ctl.send(state::CtlMsg::Shutdown);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::validate_log_path,
            commands::settings::get_tracker_status,
            commands::settings::recent_parsed_events,
            commands::plans::list_plans,
            commands::plans::upsert_plan,
            commands::plans::delete_plan,
            commands::plans::list_checkpoints,
            commands::plans::upsert_checkpoint,
            commands::plans::delete_checkpoint,
            commands::plans::reorder_checkpoints,
            commands::plans::list_links,
            commands::plans::upsert_link,
            commands::plans::delete_link,
            commands::pob::import_pob,
            commands::update::check_for_update,
            commands::layouts::get_layouts,
            commands::layout_images::fetch_layout_images,
            commands::layout_images::get_layout_images,
            commands::layout_images::clear_layout_images,
            commands::runs::list_runs,
            commands::runs::get_run_detail,
            commands::runs::get_active_run,
            commands::runs::update_run_meta,
            commands::runs::delete_run,
            commands::runs::stop_active_run,
            commands::runs::pause_active_run,
            commands::runs::resume_active_run,
            commands::runs::set_segment_excluded,
            commands::runs::list_run_groups,
            commands::runs::create_run_group,
            commands::runs::rename_run_group,
            commands::runs::delete_run_group,
            commands::runs::set_run_group,
            commands::atlas::list_progressions,
            commands::atlas::get_progression_detail,
            commands::atlas::create_progression,
            commands::atlas::set_progression_active,
            commands::atlas::delete_progression,
            commands::atlas::set_milestone_status,
            commands::atlas::toggle_voidstone,
            commands::analysis::compare_runs,
            commands::analysis::zone_stats,
            commands::notes::get_zone_notes,
            commands::notes::set_zone_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

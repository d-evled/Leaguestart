use crate::state::TrackerStatus;
use leaguestart_core::db::models::RunDetail;
use leaguestart_core::db::repo::runs;
use leaguestart_core::rusqlite::Connection;
use leaguestart_core::tracker::TrackerOutput;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DataChanged {
    pub domain: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub text: String,
}

pub fn emit_data_changed(app: &AppHandle, domain: &'static str) {
    let _ = app.emit("data://changed", DataChanged { domain });
}

pub fn emit_status(app: &AppHandle, status: &TrackerStatus) {
    let _ = app.emit("tracker://status", status.clone());
}

pub fn active_run_snapshot(conn: &Connection) -> Option<RunDetail> {
    let run = runs::active_run(conn).ok()??;
    runs::run_detail(conn, run.id).ok()?
}

pub fn emit_active_run(app: &AppHandle, conn: &Connection) {
    let _ = app.emit("run://active", active_run_snapshot(conn));
}

/// Map tracker outputs to UI events (coalescing duplicate snapshots).
pub fn emit_outputs(app: &AppHandle, conn: &Connection, outputs: &[TrackerOutput]) {
    let mut snapshot = false;
    let mut runs_changed = false;
    let mut atlas_changed = false;
    for o in outputs {
        match o {
            TrackerOutput::RunStarted(_) => {
                snapshot = true;
                runs_changed = true;
            }
            TrackerOutput::RunFinished(run) => {
                let _ = app.emit("run://finished", run.clone());
                snapshot = true;
                runs_changed = true;
            }
            TrackerOutput::Snapshot => snapshot = true,
            TrackerOutput::Atlas(_) => atlas_changed = true,
            TrackerOutput::Notice(text) => {
                let _ = app.emit("notice://message", Notice { text: text.clone() });
            }
        }
    }
    if snapshot {
        emit_active_run(app, conn);
    }
    if runs_changed {
        emit_data_changed(app, "runs");
    }
    if atlas_changed {
        emit_data_changed(app, "atlas");
    }
}

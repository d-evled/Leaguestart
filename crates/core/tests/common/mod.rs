#![allow(dead_code)] // helpers are shared across independent test binaries

use leaguestart_core::areas::AreaDb;
use leaguestart_core::db;
use leaguestart_core::log::parser;
use leaguestart_core::tracker::{RunGoal, Tracker, TrackerConfig, TrackerOutput};
use rusqlite::Connection;

pub fn config(goal: RunGoal, kind: &str) -> TrackerConfig {
    let mut cfg = TrackerConfig::new("poe1", "3.26");
    cfg.goal = goal;
    cfg.default_run_kind = kind.to_string();
    cfg
}

pub fn tracker(goal: RunGoal, kind: &str) -> Tracker {
    tracker_on(db::open_memory().unwrap(), goal, kind)
}

pub fn tracker_on(conn: Connection, goal: RunGoal, kind: &str) -> Tracker {
    Tracker::new(conn, AreaDb::load_embedded(), config(goal, kind))
}

pub fn feed(t: &mut Tracker, text: &str) -> Vec<TrackerOutput> {
    let mut out = Vec::new();
    for raw in text.lines() {
        if let Some(line) = parser::parse_line(raw) {
            out.extend(t.handle(&line).unwrap());
        }
    }
    out
}

pub fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path).expect("fixture exists")
}

/// Build a log line quickly for inline scenarios.
/// `ts` like "2026/07/12 09:00:00".
pub fn log_line(ts: &str, uptime: i64, body: &str) -> String {
    let level = if body.starts_with(':') { "INFO" } else { "DEBUG" };
    format!("{ts} {uptime} abc1234 [{level} Client 9999] {body}")
}

//! End-to-end without the GUI: a writer thread appends the full-run fixture
//! to a temp "Client.txt" in chunks (like the game writing live, or
//! `scripts/replay-log.mjs`), while the watcher tails it and feeds the
//! tracker. Asserts the same outcome as the direct-feed test.

mod common;

use common::*;
use leaguestart_core::db::repo::runs;
use leaguestart_core::log::parser;
use leaguestart_core::log::watcher::LogWatcher;
use leaguestart_core::tracker::RunGoal;
use std::io::Write;
use std::time::Duration;

#[test]
fn live_appended_log_produces_a_completed_run() {
    let dir = tempfile::tempdir().unwrap();
    let log_path = dir.path().join("Client.txt");
    std::fs::write(&log_path, "").unwrap();

    let mut tracker = tracker(RunGoal::FirstMap, "practice");
    let mut watcher = LogWatcher::start_at_end(&log_path).unwrap();

    let fixture_text = fixture("full_run.txt");
    let writer_path = log_path.clone();
    let writer = std::thread::spawn(move || {
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&writer_path)
            .unwrap();
        // Write in awkward chunks (splitting lines mid-way) to exercise the
        // partial-line buffer, with tiny sleeps to interleave with polling.
        for chunk in fixture_text.as_bytes().chunks(700) {
            f.write_all(chunk).unwrap();
            f.flush().unwrap();
            std::thread::sleep(Duration::from_millis(2));
        }
    });

    let mut done = false;
    for _ in 0..2000 {
        let res = watcher.poll().unwrap();
        for raw in &res.lines {
            if let Some(line) = parser::parse_line(raw) {
                for out in tracker.handle(&line).unwrap() {
                    if matches!(
                        out,
                        leaguestart_core::tracker::TrackerOutput::RunFinished(_)
                    ) {
                        done = true;
                    }
                }
            }
        }
        if done && writer.is_finished() {
            break;
        }
        std::thread::sleep(Duration::from_millis(2));
    }
    writer.join().unwrap();
    assert!(done, "run should complete from live-appended log");

    let all = runs::list_runs(tracker.conn()).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].status, "completed");
    assert_eq!(all[0].character_name.as_deref(), Some("Fixturina"));
    // Same totals as the direct-feed test: the tail path loses nothing.
    assert_eq!(all[0].total_ms, Some(7_623_000));
}

mod common;

use common::*;
use leaguestart_core::areas::AreaDb;
use leaguestart_core::db::repo::{analysis, notes, runs};
use leaguestart_core::tracker::RunGoal;

/// Two runs with a deliberately slow Coast in the second one. No loading
/// lines are simulated, so dwell = time between entries exactly:
/// Strand 60s in both runs; Coast `coast_secs`.
fn two_runs() -> leaguestart_core::tracker::Tracker {
    let mut t = tracker(RunGoal::FirstMap, "practice");
    let run = |start_min: u64, coast_secs: u64, base_up: i64| {
        let abs = |secs: u64| {
            let total = start_min * 60 + secs;
            format!(
                "2026/07/12 {:02}:{:02}:{:02}",
                9 + total / 3600,
                (total / 60) % 60,
                total % 60
            )
        };
        let mut up = base_up;
        let mut mk = |secs: u64, body: &str| {
            up += 1000;
            log_line(&abs(secs), up, body)
        };
        [
            mk(0, r#"Generating level 1 area "1_1_1" with seed 1"#),
            mk(3, ": You have entered The Twilight Strand."),
            mk(30, ": Speedy (Witch) is now level 2"),
            mk(63, r#"Generating level 2 area "1_1_2" with seed 2"#),
            mk(63, ": You have entered The Coast."),
            mk(63 + coast_secs, r#"Generating level 68 area "MapWorldsBeach" with seed 3"#),
            mk(63 + coast_secs, ": You have entered Beach."),
        ]
        .join("\n")
    };
    feed(&mut t, &run(0, 100, 1_000));
    feed(&mut t, &run(30, 300, 10_000_000));
    t
}

#[test]
fn compare_aligns_zones_and_reports_deltas() {
    let t = two_runs();
    let ids: Vec<i64> = runs::list_runs(t.conn())
        .unwrap()
        .iter()
        .map(|r| r.id)
        .collect();
    assert_eq!(ids.len(), 2);
    // list_runs is newest-first; compare in chronological order.
    let ids: Vec<i64> = ids.into_iter().rev().collect();

    let areas = AreaDb::load_embedded();
    let cmp = analysis::compare(t.conn(), &areas, &ids).unwrap();
    assert_eq!(cmp.runs.len(), 2);

    let coast = cmp
        .rows
        .iter()
        .find(|r| r.area_id == "a1-the-coast")
        .expect("coast row");
    assert_eq!(coast.per_run_ms[0], Some(100_000));
    assert_eq!(coast.per_run_ms[1], Some(300_000));

    let strand = cmp
        .rows
        .iter()
        .find(|r| r.area_id == "a1-the-twilight-strand")
        .unwrap();
    assert_eq!(strand.per_run_ms[0], strand.per_run_ms[1]);

    // Rows come out in canonical campaign order: strand before coast.
    let i_strand = cmp.rows.iter().position(|r| r.area_id == "a1-the-twilight-strand").unwrap();
    let i_coast = cmp.rows.iter().position(|r| r.area_id == "a1-the-coast").unwrap();
    assert!(i_strand < i_coast);

    // Cumulative series end at each run's total active (load-removed) time.
    let end0 = cmp.cumulative[0].last().unwrap().cumulative_ms;
    let end1 = cmp.cumulative[1].last().unwrap().cumulative_ms;
    assert_eq!(end1 - end0, 200_000, "run 2 lost exactly 200s in the Coast");

    // Level curves are relative to each run's start.
    assert_eq!(cmp.level_curves[0].len(), 1);
    assert_eq!(cmp.level_curves[0][0].level, 2);
}

#[test]
fn zone_stats_flag_the_slow_zone() {
    let t = two_runs();
    let areas = AreaDb::load_embedded();
    let stats = analysis::zone_stats(t.conn(), &areas, None, "poe1").unwrap();

    let coast = stats.iter().find(|s| s.area_id == "a1-the-coast").unwrap();
    assert_eq!(coast.runs_counted, 2);
    assert_eq!(coast.best_ms, 100_000);
    assert_eq!(coast.median_ms, 200_000);
    assert_eq!(coast.last_ms, 300_000);
    assert_eq!(coast.iqr_ms, 100_000);
    assert!(coast.auto_flag, "coast should be auto-flagged as a bottleneck");

    let strand = stats.iter().find(|s| s.area_id == "a1-the-twilight-strand").unwrap();
    assert!(!strand.auto_flag);
    assert!(strand.share_of_act > 0.0 && strand.share_of_act < 1.0);

    // Manual flags/notes join in.
    notes::set(t.conn(), "poe1", "a1-the-coast", Some("bad layout RNG"), true).unwrap();
    let stats = analysis::zone_stats(t.conn(), &areas, None, "poe1").unwrap();
    let coast = stats.iter().find(|s| s.area_id == "a1-the-coast").unwrap();
    assert!(coast.flagged);
    assert_eq!(coast.note_md.as_deref(), Some("bad layout RNG"));
}

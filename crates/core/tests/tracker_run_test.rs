mod common;

use common::*;
use leaguestart_core::areas::AreaDb;
use leaguestart_core::db;
use leaguestart_core::db::repo::runs;
use leaguestart_core::tracker::{RunGoal, TrackerOutput};

#[test]
fn full_run_fixture_produces_one_completed_run() {
    let mut t = tracker(RunGoal::FirstMap, "practice");
    let out = feed(&mut t, &fixture("full_run.txt"));

    assert!(out.iter().any(|o| matches!(o, TrackerOutput::RunStarted(_))));
    assert!(out
        .iter()
        .any(|o| matches!(o, TrackerOutput::RunFinished(r) if r.status == "completed")));

    let all = runs::list_runs(t.conn()).unwrap();
    assert_eq!(all.len(), 1);
    let run = &all[0];
    assert_eq!(run.status, "completed");
    assert_eq!(run.character_name.as_deref(), Some("Fixturina"));
    assert_eq!(run.character_class.as_deref(), Some("Witch"));
    assert_eq!(run.deaths, 1);

    // The golden path the fixture generator followed: non-side campaign/town
    // areas of acts 1..=11 — derived from the same embedded area DB.
    let areas = AreaDb::load_embedded();
    let golden: Vec<_> = areas
        .all()
        .iter()
        .filter(|a| a.act.is_some() && !a.side)
        .collect();
    let expected_segments = golden.len() + 1; // + the first map

    let segs = runs::segments(t.conn(), run.id).unwrap();
    assert_eq!(segs.len(), expected_segments);
    assert!(segs.iter().all(|s| !s.is_revisit), "golden path never revisits");
    assert!(segs.iter().all(|s| s.exited_at.is_some()), "all segments closed");

    // Every loading screen in the fixture is exactly 3s.
    assert_eq!(run.total_load_ms, Some(3000 * expected_segments as i64));
    // Started at first strand entry 08:00:03, ended at map entry 10:07:06.
    assert_eq!(run.total_ms, Some(7_623_000));

    // Every zone dwell is exactly 60s: check act sums = 60s * zone count.
    for act in 1..=10i64 {
        let expected: i64 = golden
            .iter()
            .filter(|a| a.act == Some(act as u8))
            .count() as i64
            * 60_000;
        let actual: i64 = segs
            .iter()
            .filter(|s| s.act == Some(act))
            .map(|s| s.exited_at.unwrap() - s.entered_at)
            .sum();
        assert_eq!(actual, expected, "act {act} time");
    }

    // 24 level-ups (every 5th zone), death lands in The Dried Lake.
    let levels = runs::levels(t.conn(), run.id).unwrap();
    assert_eq!(levels.len(), 24);
    let deaths = runs::deaths(t.conn(), run.id).unwrap();
    assert_eq!(deaths.len(), 1);
    let death_seg = segs
        .iter()
        .find(|s| Some(s.id) == deaths[0].segment_id)
        .unwrap();
    assert_eq!(death_seg.area_name, "The Dried Lake");

    // The final map segment resolved as a map with tier metadata.
    let map_seg = segs.last().unwrap();
    assert_eq!(map_seg.kind, "map");
    assert_eq!(map_seg.area_id, "map:MapWorldsBeach");
}

#[test]
fn backtracking_and_deaths_attach_to_the_right_segments() {
    let mut t = tracker(RunGoal::FirstMap, "practice");
    feed(&mut t, &fixture("backtrack_death.txt"));

    let run = runs::active_run(t.conn()).unwrap().expect("run still active");
    assert_eq!(run.deaths, 1);

    let segs = runs::segments(t.conn(), run.id).unwrap();
    let names: Vec<_> = segs.iter().map(|s| s.area_name.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "The Twilight Strand",
            "Lioneye's Watch",
            "The Coast",
            "The Mud Flats",
            "Lioneye's Watch",
            "The Mud Flats",
            "The Fetid Pool",
        ]
    );
    let revisits: Vec<_> = segs.iter().map(|s| s.is_revisit).collect();
    assert_eq!(revisits, vec![false, false, false, false, true, true, false]);

    // Death happened in the first Mud Flats visit (seq 4).
    let deaths = runs::deaths(t.conn(), run.id).unwrap();
    assert_eq!(deaths[0].segment_id, Some(segs[3].id));

    // Merged zone math: Coast 175s; Mud Flats 58s + 87s.
    let dur =
        |s: &leaguestart_core::db::models::ZoneSegment| s.exited_at.unwrap() - s.entered_at;
    assert_eq!(dur(&segs[2]), 175_000);
    assert_eq!(dur(&segs[3]) + dur(&segs[5]), 145_000);
    // Loading screens are excluded from dwell and recorded on the segment.
    assert_eq!(segs[0].load_ms, 4000);
    assert_eq!(segs[6].load_ms, 4000);

    // Level events attach to the segment where they happened.
    let levels = runs::levels(t.conn(), run.id).unwrap();
    assert_eq!(levels.len(), 3);
    assert_eq!(levels[0].segment_id, Some(segs[0].id));
    assert_eq!(levels[1].segment_id, Some(segs[2].id));
    assert_eq!(levels[2].segment_id, Some(segs[5].id));
}

#[test]
fn duplicate_zone_names_resolve_across_acts() {
    let mut t = tracker(RunGoal::FirstMap, "practice");
    feed(&mut t, &fixture("act6_coast.txt"));

    let run = runs::active_run(t.conn()).unwrap().unwrap();
    let segs = runs::segments(t.conn(), run.id).unwrap();
    let ids: Vec<_> = segs.iter().map(|s| s.area_id.as_str()).collect();
    assert_eq!(
        ids,
        vec!["a1-the-twilight-strand", "a1-the-coast", "a6-the-coast", "a6-the-coast"]
    );
    assert_eq!(segs[1].act, Some(1));
    assert_eq!(segs[2].act, Some(6));
    // Same name, different act: NOT a revisit of the act-1 Coast…
    assert!(!segs[2].is_revisit);
    // …but re-entering the same act-6 instance (no Generating line —
    // resolved via the open-instance cache) is.
    assert!(segs[3].is_revisit);
    assert_eq!(segs[3].client_area_id.as_deref(), Some("2_6_2"));
}

#[test]
fn twilight_strand_relog_grace_vs_new_run() {
    // Relog within grace period, still act 1 → same run.
    let mut t = tracker(RunGoal::FirstMap, "practice");
    let lines = [
        log_line("2026/07/12 09:00:00", 1_000, r#"Generating level 1 area "1_1_1" with seed 1"#),
        log_line("2026/07/12 09:00:03", 4_000, ": You have entered The Twilight Strand."),
        // Relog 5 minutes in: back to the strand (fresh instance).
        log_line("2026/07/12 09:05:00", 304_000, r#"Generating level 1 area "1_1_1" with seed 2"#),
        log_line("2026/07/12 09:05:03", 307_000, ": You have entered The Twilight Strand."),
    ]
    .join("\n");
    feed(&mut t, &lines);
    assert_eq!(runs::list_runs(t.conn()).unwrap().len(), 1);
    let run = runs::active_run(t.conn()).unwrap().unwrap();
    let segs = runs::segments(t.conn(), run.id).unwrap();
    assert_eq!(segs.len(), 2);
    assert!(segs[1].is_revisit);

    // Outside the grace period → old run abandoned, new run started.
    let mut t = tracker(RunGoal::FirstMap, "practice");
    let lines = [
        log_line("2026/07/12 09:00:00", 1_000, r#"Generating level 1 area "1_1_1" with seed 1"#),
        log_line("2026/07/12 09:00:03", 4_000, ": You have entered The Twilight Strand."),
        log_line("2026/07/12 09:20:00", 1_204_000, r#"Generating level 1 area "1_1_1" with seed 3"#),
        log_line("2026/07/12 09:20:03", 1_207_000, ": You have entered The Twilight Strand."),
    ]
    .join("\n");
    let out = feed(&mut t, &lines);
    let all = runs::list_runs(t.conn()).unwrap();
    assert_eq!(all.len(), 2);
    assert!(out
        .iter()
        .any(|o| matches!(o, TrackerOutput::RunFinished(r) if r.status == "abandoned")));
    assert!(runs::active_run(t.conn()).unwrap().is_some());
}

#[test]
fn app_restart_mid_run_resumes_without_duplicates() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("test.db3");
    let text = fixture("backtrack_death.txt");
    let all_lines: Vec<&str> = text.lines().collect();
    // Split right after the death (line 16 of the fixture).
    let (part1, part2) = all_lines.split_at(16);

    let mut t1 = tracker_on(db::open(&db_path).unwrap(), RunGoal::FirstMap, "practice");
    feed(&mut t1, &part1.join("\n"));
    let run_id = runs::active_run(t1.conn()).unwrap().unwrap().id;
    drop(t1);

    // "App restart": new tracker on the same database resumes the run.
    let mut t2 = tracker_on(db::open(&db_path).unwrap(), RunGoal::FirstMap, "practice");
    t2.reload_from_db().unwrap();
    feed(&mut t2, &part2.join("\n"));

    let all = runs::list_runs(t2.conn()).unwrap();
    assert_eq!(all.len(), 1, "no duplicate run after restart");
    assert_eq!(all[0].id, run_id);
    let segs = runs::segments(t2.conn(), run_id).unwrap();
    assert_eq!(segs.len(), 7, "segments continue after resume");
    // Mud Flats re-entry after restart still resolves to act 1 and revisits.
    assert_eq!(segs[5].area_id, "a1-the-mud-flats");
    assert!(segs[5].is_revisit);
}

#[test]
fn character_filter_ignores_other_characters() {
    let conn = db::open_memory().unwrap();
    let mut cfg = config(RunGoal::FirstMap, "practice");
    cfg.active_character = Some("MyMain".to_string());
    let mut t = leaguestart_core::tracker::Tracker::new(
        conn,
        leaguestart_core::areas::AreaDb::load_embedded(),
        cfg,
    );
    let lines = [
        log_line("2026/07/12 09:00:00", 1_000, r#"Generating level 1 area "1_1_1" with seed 1"#),
        log_line("2026/07/12 09:00:03", 4_000, ": You have entered The Twilight Strand."),
        log_line("2026/07/12 09:00:30", 31_000, ": SomeMule (Duelist) is now level 2"),
        log_line("2026/07/12 09:00:40", 41_000, ": SomeMule has been slain."),
        log_line("2026/07/12 09:01:00", 61_000, ": MyMain (Witch) is now level 2"),
    ]
    .join("\n");
    feed(&mut t, &lines);
    let run = runs::active_run(t.conn()).unwrap().unwrap();
    assert_eq!(run.character_name.as_deref(), Some("MyMain"));
    assert_eq!(run.deaths, 0, "mule death ignored");
    assert_eq!(runs::levels(t.conn(), run.id).unwrap().len(), 1);
}

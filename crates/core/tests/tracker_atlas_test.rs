mod common;

use common::*;
use leaguestart_core::db::repo::{atlas, runs};
use leaguestart_core::tracker::RunGoal;

#[test]
fn league_start_run_rolls_into_atlas_progression_with_tier_milestones() {
    let mut t = tracker(RunGoal::CompleteAct10, "league_start");
    feed(&mut t, &fixture("maps_t1_t3.txt"));

    // Campaign run completed at Karui Shores.
    let all = runs::list_runs(t.conn()).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].status, "completed");
    assert_eq!(all[0].kind, "league_start");

    // Progression auto-created, anchored at the run start.
    let p = atlas::active_progression(t.conn()).unwrap().expect("progression");
    assert_eq!(p.run_id, Some(all[0].id));
    assert_eq!(p.character_name.as_deref(), Some("Exilena"));
    assert_eq!(p.started_at, all[0].started_at);

    let ms = atlas::milestones(t.conn(), p.id).unwrap();
    assert_eq!(ms.len(), 3);

    let t1 = &ms[0];
    assert_eq!((t1.tier, t1.status.as_str()), (1, "completed"));
    assert_eq!(t1.map_name.as_deref(), Some("Beach"));
    assert_eq!(t1.char_level, Some(70));
    // Entered 11:35:00, run started 11:00:03.
    assert_eq!(t1.elapsed_ms, Some(2_097_000));
    assert!(t1.completed_at.is_some());
    assert!(!t1.died_in_map);

    // Tier 2: first attempt (Desert) had a death and was replaced by Dunes.
    let t2 = &ms[1];
    assert_eq!((t2.tier, t2.status.as_str()), (2, "completed"));
    assert_eq!(t2.map_name.as_deref(), Some("Dunes"));
    assert!(!t2.died_in_map);

    let t3 = &ms[2];
    assert_eq!((t3.tier, t3.status.as_str()), (3, "completed"));
    assert_eq!(t3.map_name.as_deref(), Some("Atoll"));

    // The endgame death and level-up were attributed to the progression.
    let levels = runs::levels_for_progression(t.conn(), p.id).unwrap();
    assert_eq!(levels.len(), 1);
    assert_eq!(levels[0].level, 70);
}

#[test]
fn death_in_map_keeps_candidate_unconfirmed() {
    let mut t = tracker(RunGoal::CompleteAct10, "league_start");
    let text = fixture("maps_t1_t3.txt");
    // Stop right after returning to the hideout following the Desert death.
    let cutoff = text
        .lines()
        .position(|l| l.contains("MapWorldsDunes"))
        .unwrap();
    let partial: Vec<&str> = text.lines().take(cutoff - 1).collect();
    feed(&mut t, &partial.join("\n"));

    let p = atlas::active_progression(t.conn()).unwrap().unwrap();
    let ms = atlas::milestones(t.conn(), p.id).unwrap();
    let t2 = ms.iter().find(|m| m.tier == 2).expect("tier 2 candidate");
    assert_eq!(t2.status, "candidate");
    assert!(t2.died_in_map);
    assert_eq!(t2.map_name.as_deref(), Some("Desert"));
}

#[test]
fn voidstone_toggle_records_time_level_and_elapsed() {
    let mut t = tracker(RunGoal::CompleteAct10, "league_start");
    feed(&mut t, &fixture("maps_t1_t3.txt"));
    let p = atlas::active_progression(t.conn()).unwrap().unwrap();

    let stones = atlas::toggle_voidstone(t.conn(), p.id, "decayed", Some(72)).unwrap();
    assert_eq!(stones.len(), 1);
    assert_eq!(stones[0].stone, "decayed");
    assert_eq!(stones[0].char_level, Some(72));
    assert!(stones[0].elapsed_ms.unwrap() > 0);

    // Toggling again removes it.
    let stones = atlas::toggle_voidstone(t.conn(), p.id, "decayed", None).unwrap();
    assert!(stones.is_empty());
}

#[test]
fn manual_milestone_status_edits() {
    let mut t = tracker(RunGoal::CompleteAct10, "league_start");
    feed(&mut t, &fixture("maps_t1_t3.txt"));
    let p = atlas::active_progression(t.conn()).unwrap().unwrap();
    let ms = atlas::milestones(t.conn(), p.id).unwrap();

    atlas::set_milestone_status(t.conn(), ms[0].id, "dismissed").unwrap();
    let after = atlas::milestone_for_tier(t.conn(), p.id, 1).unwrap().unwrap();
    assert_eq!(after.status, "dismissed");
    assert!(after.manual);
}

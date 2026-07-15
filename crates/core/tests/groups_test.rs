use leaguestart_core::db;
use leaguestart_core::db::repo::{groups, runs};

fn insert_run(conn: &rusqlite::Connection) -> i64 {
    runs::insert_run(
        conn,
        &runs::NewRun {
            plan_id: None,
            kind: "practice",
            started_at: 1_000,
            goal: &serde_json::json!({ "type": "first_map" }),
            game: "poe1",
            patch: "3.26",
        },
    )
    .unwrap()
    .id
}

#[test]
fn group_crud_and_run_assignment() {
    let conn = db::open_memory().unwrap();
    let g1 = groups::create(&conn, "SSF practice").unwrap();
    groups::create(&conn, "aura stacker").unwrap();

    // Case-insensitive alphabetical listing.
    let names: Vec<_> = groups::list(&conn)
        .unwrap()
        .into_iter()
        .map(|g| g.name)
        .collect();
    assert_eq!(names, vec!["aura stacker", "SSF practice"]);

    let run_id = insert_run(&conn);
    groups::set_run_group(&conn, run_id, Some(g1.id)).unwrap();
    assert_eq!(
        runs::get_run(&conn, run_id).unwrap().unwrap().group_id,
        Some(g1.id)
    );

    groups::rename(&conn, g1.id, "SSF league start").unwrap();
    assert!(groups::list(&conn)
        .unwrap()
        .iter()
        .any(|g| g.name == "SSF league start"));

    // Un-assign, re-assign.
    groups::set_run_group(&conn, run_id, None).unwrap();
    assert_eq!(
        runs::get_run(&conn, run_id).unwrap().unwrap().group_id,
        None
    );
    groups::set_run_group(&conn, run_id, Some(g1.id)).unwrap();

    // Deleting a group detaches its runs, never deletes them.
    groups::delete(&conn, g1.id).unwrap();
    let run = runs::get_run(&conn, run_id).unwrap().unwrap();
    assert_eq!(run.group_id, None);
    assert_eq!(groups::list(&conn).unwrap().len(), 1);
}

#[test]
fn list_run_entries_counts_campaign_acts() {
    let conn = db::open_memory().unwrap();
    let run_id = insert_run(&conn);
    for (i, (area, act)) in [
        ("a1-the-twilight-strand", 1),
        ("a1-the-coast", 1),
        ("a2-the-southern-forest", 2),
    ]
    .iter()
    .enumerate()
    {
        runs::insert_segment(
            &conn,
            &runs::NewSegment {
                run_id,
                area_id: area,
                client_area_id: None,
                area_name: area,
                act: Some(*act),
                area_level: Some(1),
                kind: "campaign",
                entered_at: 1_000 + i as i64 * 60_000,
                load_ms: 0,
                is_revisit: false,
                instance_seed: None,
            },
        )
        .unwrap();
    }
    let entries = runs::list_run_entries(&conn).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].run.id, run_id);
    assert_eq!(entries[0].acts_seen, 2);
}

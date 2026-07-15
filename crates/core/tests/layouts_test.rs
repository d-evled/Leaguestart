//! Layout notes stay in lockstep with the area database: full coverage of
//! campaign zones, no orphans, sane field values.

use leaguestart_core::areas::AreaDb;
use leaguestart_core::layouts::LayoutDb;
use std::collections::HashSet;

#[test]
fn layouts_cover_every_campaign_zone_exactly() {
    let layouts = LayoutDb::load_embedded();
    let areas_json: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(format!(
            "{}/data/poe1/3.26/areas.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap(),
    )
    .unwrap();

    let campaign_ids: HashSet<&str> = areas_json["areas"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|a| a["kind"] == "campaign")
        .map(|a| a["id"].as_str().unwrap())
        .collect();
    let layout_ids: HashSet<&str> = layouts.zones.iter().map(|z| z.area_id.as_str()).collect();

    assert_eq!(
        layout_ids.len(),
        layouts.zones.len(),
        "duplicate layout ids"
    );
    let missing: Vec<_> = campaign_ids.difference(&layout_ids).collect();
    let orphaned: Vec<_> = layout_ids.difference(&campaign_ids).collect();
    assert!(
        missing.is_empty(),
        "campaign zones without layout notes: {missing:?}"
    );
    assert!(
        orphaned.is_empty(),
        "layout notes without a campaign zone: {orphaned:?}"
    );
}

#[test]
fn layout_entries_are_well_formed_and_resolvable() {
    let layouts = LayoutDb::load_embedded();
    let areas = AreaDb::load_embedded();
    assert!(layouts.zones.len() >= 120);
    assert!(!layouts.source.url.is_empty());

    for z in &layouts.zones {
        let area = areas
            .by_id(&z.area_id)
            .expect("layout id resolves in AreaDb");
        assert_eq!(area.name, z.name, "{}", z.area_id);
        assert!((1..=10).contains(&z.act), "{}", z.area_id);
        assert!(!z.summary.trim().is_empty(), "{}", z.area_id);
        assert!(
            (1..=4).contains(&z.tips.len()) && z.tips.iter().all(|t| !t.trim().is_empty()),
            "{}",
            z.area_id
        );
        assert!((1..=3).contains(&z.consistency), "{}", z.area_id);
    }

    // Spot-checks: duplicate-name zones resolve to act-specific notes.
    let a1 = layouts.by_area_id("a1-the-coast").unwrap();
    let a6 = layouts.by_area_id("a6-the-coast").unwrap();
    assert_eq!(a1.act, 1);
    assert_eq!(a6.act, 6);
    assert_ne!(a1.summary, a6.summary);
}

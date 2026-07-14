//! Static area database: resolves zone display names (and observed client
//! area ids) to act / order / kind metadata.
//!
//! Display names repeat between Acts 1–5 and 6–10, so resolution never uses
//! the name alone: the monster level from the `Generating` log line (or an
//! act hint from the run context / client-id prefix) picks the right act.
//! The game's internal ids are *not* assumed known — they are recorded as
//! observed and only their `<part>_<act>_<n>` prefix is used as an act hint.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Area {
    pub id: String,
    pub name: String,
    pub act: Option<u8>,
    pub order: Option<i64>,
    pub kind: String, // campaign|town|lab|other
    pub town: bool,
    pub waypoint: bool,
    pub side: bool,
    pub level: i64,
}

#[derive(Debug, Deserialize)]
struct AreaFile {
    game: String,
    patch: String,
    areas: Vec<Area>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentKind {
    Campaign,
    Town,
    Hideout,
    Map,
    Lab,
    Other,
    Unknown,
}

impl SegmentKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SegmentKind::Campaign => "campaign",
            SegmentKind::Town => "town",
            SegmentKind::Hideout => "hideout",
            SegmentKind::Map => "map",
            SegmentKind::Lab => "lab",
            SegmentKind::Other => "other",
            SegmentKind::Unknown => "unknown",
        }
    }
}

/// The tracker's view of one observed area entry after resolution.
#[derive(Debug, Clone)]
pub struct ResolvedArea {
    pub area_id: String,
    pub name: String,
    pub act: Option<u8>,
    pub area_level: Option<i64>,
    pub kind: SegmentKind,
    /// Map tier (area_level - 67) when kind == Map and the level is known.
    pub map_tier: Option<i64>,
}

pub struct AreaDb {
    pub game: String,
    pub patch: String,
    areas: Vec<Area>,
    by_id: HashMap<String, usize>,
    by_name: HashMap<String, Vec<usize>>,
}

const EMBEDDED: &str = include_str!("../data/poe1/3.26/areas.json");

/// Map area levels start at 68 for tier 1 (tier = level - 67).
const MAP_TIER_BASE: i64 = 67;

impl AreaDb {
    pub fn load_embedded() -> Self {
        let file: AreaFile =
            serde_json::from_str(EMBEDDED).expect("embedded areas.json must parse");
        let mut by_id = HashMap::new();
        let mut by_name: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, a) in file.areas.iter().enumerate() {
            by_id.insert(a.id.clone(), i);
            by_name.entry(a.name.clone()).or_default().push(i);
        }
        AreaDb {
            game: file.game,
            patch: file.patch,
            areas: file.areas,
            by_id,
            by_name,
        }
    }

    pub fn by_id(&self, id: &str) -> Option<&Area> {
        self.by_id.get(id).map(|&i| &self.areas[i])
    }

    pub fn by_name(&self, name: &str) -> Vec<&Area> {
        self.by_name
            .get(name)
            .map(|v| v.iter().map(|&i| &self.areas[i]).collect())
            .unwrap_or_default()
    }

    pub fn all(&self) -> &[Area] {
        &self.areas
    }

    /// Extract an act hint from a client area id following the documented
    /// `<part>_<act>_<n>` scheme (e.g. "1_4_2" → act 4, "2_9_1" → act 9).
    pub fn act_hint_from_client_id(client_id: &str) -> Option<u8> {
        let mut parts = client_id.split('_');
        let part = parts.next()?;
        if part != "1" && part != "2" {
            return None;
        }
        parts.next()?.parse::<u8>().ok().filter(|a| (1..=11).contains(a))
    }

    /// Resolve an observed zone entry to an area.
    ///
    /// `area_level` comes from the paired `Generating` line when available;
    /// `act_hint` from the client id prefix or the run's current act.
    pub fn resolve(
        &self,
        name: &str,
        area_level: Option<i64>,
        client_id: Option<&str>,
        act_hint: Option<u8>,
    ) -> ResolvedArea {
        // Pattern classification from the client id takes precedence: maps
        // and hideouts must never be mistaken for campaign zones.
        if let Some(cid) = client_id {
            if cid.starts_with("MapWorlds") {
                return ResolvedArea {
                    area_id: format!("map:{cid}"),
                    name: name.to_string(),
                    act: None,
                    area_level,
                    kind: SegmentKind::Map,
                    map_tier: area_level.map(|l| (l - MAP_TIER_BASE).max(1)),
                };
            }
            if cid.contains("Hideout") {
                return ResolvedArea {
                    area_id: format!("client:{cid}"),
                    name: name.to_string(),
                    act: None,
                    area_level,
                    kind: SegmentKind::Hideout,
                    map_tier: None,
                };
            }
        }
        if name.ends_with(" Hideout") {
            return ResolvedArea {
                area_id: format!("name:{name}"),
                name: name.to_string(),
                act: None,
                area_level,
                kind: SegmentKind::Hideout,
                map_tier: None,
            };
        }

        let candidates = self.by_name(name);
        if !candidates.is_empty() {
            let hint = act_hint.or_else(|| {
                client_id.and_then(Self::act_hint_from_client_id)
            });
            let best = candidates
                .iter()
                .min_by_key(|a| {
                    // Prefer nearest monster level (duplicate names differ by
                    // 30+ levels between parts); fall back to act distance.
                    match (area_level, hint, a.act) {
                        (Some(l), _, _) => (a.level - l).unsigned_abs(),
                        (None, Some(h), Some(act)) => {
                            (act as i64 - h as i64).unsigned_abs()
                        }
                        _ => 0,
                    }
                })
                .unwrap();
            let kind = match best.kind.as_str() {
                "town" => SegmentKind::Town,
                "lab" => SegmentKind::Lab,
                "other" => SegmentKind::Other,
                _ => SegmentKind::Campaign,
            };
            return ResolvedArea {
                area_id: best.id.clone(),
                name: best.name.clone(),
                act: best.act,
                area_level: area_level.or(Some(best.level)),
                kind,
                map_tier: None,
            };
        }

        // Unknown area: never fail, record what we saw.
        ResolvedArea {
            area_id: client_id
                .map(|c| format!("client:{c}"))
                .unwrap_or_else(|| format!("name:{name}")),
            name: name.to_string(),
            act: act_hint.or_else(|| client_id.and_then(Self::act_hint_from_client_id)),
            area_level,
            kind: SegmentKind::Unknown,
            map_tier: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_db_loads_and_is_consistent() {
        let db = AreaDb::load_embedded();
        assert_eq!(db.game, "poe1");
        assert!(db.all().len() > 130);
        // Duplicate names resolve to exactly one area per act.
        for (name, acts) in [("The Coast", (1u8, 6u8)), ("The Riverways", (2, 6))] {
            let hits = db.by_name(name);
            assert_eq!(hits.len(), 2, "{name} should exist twice");
            let mut got: Vec<u8> = hits.iter().filter_map(|a| a.act).collect();
            got.sort();
            assert_eq!(got, vec![acts.0, acts.1]);
        }
    }

    #[test]
    fn resolves_duplicates_by_level() {
        let db = AreaDb::load_embedded();
        let a1 = db.resolve("The Coast", Some(2), None, None);
        assert_eq!(a1.area_id, "a1-the-coast");
        let a6 = db.resolve("The Coast", Some(45), None, None);
        assert_eq!(a6.area_id, "a6-the-coast");
        // Act hint works when no level is known.
        let a6b = db.resolve("The Coast", None, None, Some(6));
        assert_eq!(a6b.area_id, "a6-the-coast");
    }

    #[test]
    fn classifies_maps_and_hideouts() {
        let db = AreaDb::load_embedded();
        let m = db.resolve("Strand", Some(70), Some("MapWorldsStrand"), None);
        assert_eq!(m.kind, SegmentKind::Map);
        assert_eq!(m.map_tier, Some(3));
        let h = db.resolve("Stately Hideout", None, Some("HideoutBaroque"), None);
        assert_eq!(h.kind, SegmentKind::Hideout);
        let h2 = db.resolve("Enlightened Hideout", None, None, None);
        assert_eq!(h2.kind, SegmentKind::Hideout);
    }

    #[test]
    fn act_hints_parse() {
        assert_eq!(AreaDb::act_hint_from_client_id("1_4_2"), Some(4));
        assert_eq!(AreaDb::act_hint_from_client_id("2_9_10"), Some(9));
        assert_eq!(AreaDb::act_hint_from_client_id("MapWorldsStrand"), None);
        assert_eq!(AreaDb::act_hint_from_client_id("3_1_1"), None);
    }

    #[test]
    fn unknown_areas_never_fail() {
        let db = AreaDb::load_embedded();
        let u = db.resolve("Some Future League Zone", Some(80), Some("League4_1"), None);
        assert_eq!(u.kind, SegmentKind::Unknown);
        assert_eq!(u.area_id, "client:League4_1");
    }
}

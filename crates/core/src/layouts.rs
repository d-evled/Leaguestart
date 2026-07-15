//! Embedded zone-layout notes (crates/core/data/poe1/layouts.json).
//!
//! One entry per campaign zone: an original condensed summary + tips for
//! learning the layout, a consistency rating, and an optional exact URL
//! into the external guide it complements. Generated and validated by
//! `scripts/gen-layouts.mjs` — edit there, not in the JSON.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneLayout {
    pub area_id: String,
    pub name: String,
    pub act: u8,
    pub order: i64,
    pub side: bool,
    pub waypoint: bool,
    pub summary: String,
    pub tips: Vec<String>,
    /// 1 = fixed layout, 2 = variable but rule-based, 3 = high variance.
    pub consistency: u8,
    pub guide_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideSource {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutDb {
    pub game: String,
    pub written_for: String,
    pub source: GuideSource,
    pub zones: Vec<ZoneLayout>,
}

static EMBEDDED: OnceLock<LayoutDb> = OnceLock::new();

impl LayoutDb {
    pub fn load_embedded() -> &'static LayoutDb {
        EMBEDDED.get_or_init(|| {
            serde_json::from_str(include_str!("../data/poe1/layouts.json"))
                .expect("embedded layouts.json is valid")
        })
    }

    pub fn by_area_id(&self, area_id: &str) -> Option<&ZoneLayout> {
        self.zones.iter().find(|z| z.area_id == area_id)
    }
}

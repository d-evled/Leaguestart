//! Row structs. These double as IPC DTOs (serialized camelCase for the
//! TypeScript side — keep `src/types/ipc.ts` in sync when editing).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: i64,
    pub plan_id: Option<i64>,
    pub kind: String, // practice | league_start
    pub label: Option<String>,
    pub character_name: Option<String>,
    pub character_class: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub status: String, // active | completed | abandoned
    pub goal: serde_json::Value,
    pub total_ms: Option<i64>,
    pub total_load_ms: Option<i64>,
    pub deaths: i64,
    pub notes_md: Option<String>,
    pub game: String,
    pub patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneSegment {
    pub id: i64,
    pub run_id: i64,
    pub seq: i64,
    pub area_id: String,
    pub client_area_id: Option<String>,
    pub area_name: String,
    pub act: Option<i64>,
    pub area_level: Option<i64>,
    pub kind: String,
    pub entered_at: i64,
    pub exited_at: Option<i64>,
    pub load_ms: i64,
    pub is_revisit: bool,
    pub instance_seed: Option<i64>,
    pub excluded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelEvent {
    pub id: i64,
    pub run_id: Option<i64>,
    pub progression_id: Option<i64>,
    pub segment_id: Option<i64>,
    pub character: String,
    pub class: Option<String>,
    pub level: i64,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathEvent {
    pub id: i64,
    pub run_id: Option<i64>,
    pub progression_id: Option<i64>,
    pub segment_id: Option<i64>,
    pub character: String,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub run: Run,
    pub segments: Vec<ZoneSegment>,
    pub levels: Vec<LevelEvent>,
    pub deaths: Vec<DeathEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaguePlan {
    pub id: i64,
    pub name: String,
    pub game: String,
    pub league_name: Option<String>,
    pub build_name: Option<String>,
    pub class: Option<String>,
    pub ascendancy: Option<String>,
    pub notes_md: Option<String>,
    pub created_at: i64,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PobCheckpoint {
    pub id: i64,
    pub plan_id: i64,
    pub label: String,
    pub sort_order: i64,
    pub pob_code: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub decoded_class: Option<String>,
    pub decoded_ascendancy: Option<String>,
    pub decoded_level: Option<i64>,
    pub decoded_main_skill: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideLink {
    pub id: i64,
    pub plan_id: i64,
    pub title: String,
    pub url: String,
    pub kind: String, // maxroll | youtube | forum | other
    pub notes: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasProgression {
    pub id: i64,
    pub plan_id: Option<i64>,
    pub run_id: Option<i64>,
    pub label: String,
    pub character_name: Option<String>,
    pub started_at: i64,
    pub active: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierMilestone {
    pub id: i64,
    pub progression_id: i64,
    pub tier: i64,
    pub status: String, // candidate | completed | dismissed
    pub map_area_id: Option<String>,
    pub map_name: Option<String>,
    pub char_level: Option<i64>,
    pub entered_at: i64,
    pub completed_at: Option<i64>,
    pub elapsed_ms: Option<i64>,
    pub died_in_map: bool,
    pub manual: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Voidstone {
    pub id: i64,
    pub progression_id: i64,
    pub stone: String, // decayed | grasping | omniscient | ceremonial
    pub acquired_at: i64,
    pub char_level: Option<i64>,
    pub elapsed_ms: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressionDetail {
    pub progression: AtlasProgression,
    pub milestones: Vec<TierMilestone>,
    pub voidstones: Vec<Voidstone>,
    pub levels: Vec<LevelEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneNote {
    pub id: i64,
    pub game: String,
    pub area_id: String,
    pub note_md: Option<String>,
    pub flagged: bool,
    pub updated_at: i64,
}

// ---- Analysis DTOs ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareRow {
    pub area_id: String,
    pub area_name: String,
    pub act: Option<i64>,
    pub order: Option<i64>,
    pub kind: String,
    /// Merged active ms (loads excluded) per requested run; None = not visited.
    pub per_run_ms: Vec<Option<i64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CumulativePoint {
    /// Index into `CompareData::rows` (canonical zone order).
    pub row_index: i64,
    pub cumulative_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelPoint {
    pub elapsed_ms: i64,
    pub level: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompareData {
    pub runs: Vec<Run>,
    pub rows: Vec<CompareRow>,
    pub cumulative: Vec<Vec<CumulativePoint>>,
    pub level_curves: Vec<Vec<LevelPoint>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneStat {
    pub area_id: String,
    pub area_name: String,
    pub act: Option<i64>,
    pub order: Option<i64>,
    pub runs_counted: i64,
    pub best_ms: i64,
    pub median_ms: i64,
    pub last_ms: i64,
    pub iqr_ms: i64,
    /// median_ms / (sum of median_ms across the same act), 0..1.
    pub share_of_act: f64,
    pub auto_flag: bool,
    pub flagged: bool,
    pub note_md: Option<String>,
}

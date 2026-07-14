use crate::db::models::{AtlasProgression, ProgressionDetail, TierMilestone, Voidstone};
use crate::db::now_ms;
use crate::db::repo::runs;
use crate::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};

fn prog_from_row(r: &Row) -> rusqlite::Result<AtlasProgression> {
    Ok(AtlasProgression {
        id: r.get("id")?,
        plan_id: r.get("plan_id")?,
        run_id: r.get("run_id")?,
        label: r.get("label")?,
        character_name: r.get("character_name")?,
        started_at: r.get("started_at")?,
        active: r.get::<_, i64>("active")? != 0,
        created_at: r.get("created_at")?,
    })
}

fn milestone_from_row(r: &Row) -> rusqlite::Result<TierMilestone> {
    Ok(TierMilestone {
        id: r.get("id")?,
        progression_id: r.get("progression_id")?,
        tier: r.get("tier")?,
        status: r.get("status")?,
        map_area_id: r.get("map_area_id")?,
        map_name: r.get("map_name")?,
        char_level: r.get("char_level")?,
        entered_at: r.get("entered_at")?,
        completed_at: r.get("completed_at")?,
        elapsed_ms: r.get("elapsed_ms")?,
        died_in_map: r.get::<_, i64>("died_in_map")? != 0,
        manual: r.get::<_, i64>("manual")? != 0,
    })
}

fn voidstone_from_row(r: &Row) -> rusqlite::Result<Voidstone> {
    Ok(Voidstone {
        id: r.get("id")?,
        progression_id: r.get("progression_id")?,
        stone: r.get("stone")?,
        acquired_at: r.get("acquired_at")?,
        char_level: r.get("char_level")?,
        elapsed_ms: r.get("elapsed_ms")?,
        notes: r.get("notes")?,
    })
}

pub fn create_progression(
    conn: &Connection,
    plan_id: Option<i64>,
    run_id: Option<i64>,
    label: &str,
    character_name: Option<&str>,
    started_at: i64,
) -> Result<AtlasProgression> {
    // Only one progression is actively tracked at a time.
    conn.execute("UPDATE atlas_progressions SET active = 0", [])?;
    conn.execute(
        "INSERT INTO atlas_progressions (plan_id, run_id, label, character_name, started_at, active, created_at)
         VALUES (?1,?2,?3,?4,?5,1,?6)",
        params![plan_id, run_id, label, character_name, started_at, now_ms()],
    )?;
    let id = conn.last_insert_rowid();
    Ok(get_progression(conn, id)?.expect("progression exists"))
}

pub fn get_progression(conn: &Connection, id: i64) -> Result<Option<AtlasProgression>> {
    Ok(conn
        .query_row(
            "SELECT * FROM atlas_progressions WHERE id=?1",
            params![id],
            prog_from_row,
        )
        .optional()?)
}

pub fn active_progression(conn: &Connection) -> Result<Option<AtlasProgression>> {
    Ok(conn
        .query_row(
            "SELECT * FROM atlas_progressions WHERE active=1 ORDER BY id DESC LIMIT 1",
            [],
            prog_from_row,
        )
        .optional()?)
}

pub fn list_progressions(conn: &Connection) -> Result<Vec<AtlasProgression>> {
    let mut stmt = conn.prepare("SELECT * FROM atlas_progressions ORDER BY created_at DESC")?;
    let rows = stmt.query_map([], prog_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set_progression_active(conn: &Connection, id: i64, active: bool) -> Result<()> {
    if active {
        conn.execute("UPDATE atlas_progressions SET active = 0", [])?;
    }
    conn.execute(
        "UPDATE atlas_progressions SET active=?2 WHERE id=?1",
        params![id, active as i64],
    )?;
    Ok(())
}

pub fn delete_progression(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM atlas_progressions WHERE id=?1", params![id])?;
    Ok(())
}

pub fn progression_detail(conn: &Connection, id: i64) -> Result<Option<ProgressionDetail>> {
    let Some(progression) = get_progression(conn, id)? else {
        return Ok(None);
    };
    Ok(Some(ProgressionDetail {
        milestones: milestones(conn, id)?,
        voidstones: voidstones(conn, id)?,
        levels: runs::levels_for_progression(conn, id)?,
        progression,
    }))
}

pub fn milestones(conn: &Connection, prog_id: i64) -> Result<Vec<TierMilestone>> {
    let mut stmt =
        conn.prepare("SELECT * FROM atlas_tier_milestones WHERE progression_id=?1 ORDER BY tier")?;
    let rows = stmt.query_map(params![prog_id], milestone_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn milestone_for_tier(
    conn: &Connection,
    prog_id: i64,
    tier: i64,
) -> Result<Option<TierMilestone>> {
    Ok(conn
        .query_row(
            "SELECT * FROM atlas_tier_milestones WHERE progression_id=?1 AND tier=?2",
            params![prog_id, tier],
            milestone_from_row,
        )
        .optional()?)
}

pub struct CandidateInput<'a> {
    pub progression_id: i64,
    pub tier: i64,
    pub map_area_id: Option<&'a str>,
    pub map_name: Option<&'a str>,
    pub char_level: Option<i64>,
    pub entered_at: i64,
    pub elapsed_ms: Option<i64>,
}

/// Record a candidate milestone for a tier. A previous non-completed attempt
/// for the same tier is replaced in place; a completed one is left alone.
pub fn upsert_candidate(conn: &Connection, c: &CandidateInput) -> Result<TierMilestone> {
    conn.execute(
        "INSERT INTO atlas_tier_milestones
           (progression_id, tier, status, map_area_id, map_name, char_level, entered_at, elapsed_ms)
         VALUES (?1,?2,'candidate',?3,?4,?5,?6,?7)
         ON CONFLICT(progression_id, tier) DO UPDATE SET
           status='candidate', map_area_id=excluded.map_area_id, map_name=excluded.map_name,
           char_level=excluded.char_level, entered_at=excluded.entered_at,
           elapsed_ms=excluded.elapsed_ms, completed_at=NULL, died_in_map=0, manual=0
         WHERE atlas_tier_milestones.status != 'completed'",
        params![
            c.progression_id,
            c.tier,
            c.map_area_id,
            c.map_name,
            c.char_level,
            c.entered_at,
            c.elapsed_ms
        ],
    )?;
    Ok(milestone_for_tier(conn, c.progression_id, c.tier)?.expect("milestone exists"))
}

pub fn set_milestone_died(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE atlas_tier_milestones SET died_in_map=1 WHERE id=?1",
        params![id],
    )?;
    Ok(())
}

pub fn complete_milestone(conn: &Connection, id: i64, completed_at: i64) -> Result<()> {
    conn.execute(
        "UPDATE atlas_tier_milestones SET status='completed', completed_at=?2 WHERE id=?1",
        params![id, completed_at],
    )?;
    Ok(())
}

/// Manual edit from the UI: set status (and mark manual).
pub fn set_milestone_status(conn: &Connection, id: i64, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE atlas_tier_milestones SET status=?2, manual=1,
            completed_at = CASE WHEN ?2='completed' AND completed_at IS NULL
                                THEN entered_at ELSE completed_at END
         WHERE id=?1",
        params![id, status],
    )?;
    Ok(())
}

pub fn voidstones(conn: &Connection, prog_id: i64) -> Result<Vec<Voidstone>> {
    let mut stmt =
        conn.prepare("SELECT * FROM voidstones WHERE progression_id=?1 ORDER BY acquired_at")?;
    let rows = stmt.query_map(params![prog_id], voidstone_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Toggle a voidstone: acquires it (with timestamp/level/elapsed) or removes it.
pub fn toggle_voidstone(
    conn: &Connection,
    prog_id: i64,
    stone: &str,
    char_level: Option<i64>,
) -> Result<Vec<Voidstone>> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM voidstones WHERE progression_id=?1 AND stone=?2",
            params![prog_id, stone],
            |r| r.get(0),
        )
        .optional()?;
    match existing {
        Some(id) => {
            conn.execute("DELETE FROM voidstones WHERE id=?1", params![id])?;
        }
        None => {
            let started_at: i64 = conn.query_row(
                "SELECT started_at FROM atlas_progressions WHERE id=?1",
                params![prog_id],
                |r| r.get(0),
            )?;
            let now = now_ms();
            conn.execute(
                "INSERT INTO voidstones (progression_id, stone, acquired_at, char_level, elapsed_ms)
                 VALUES (?1,?2,?3,?4,?5)",
                params![prog_id, stone, now, char_level, now - started_at],
            )?;
        }
    }
    voidstones(conn, prog_id)
}

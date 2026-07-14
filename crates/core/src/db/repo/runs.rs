use crate::db::models::{DeathEvent, LevelEvent, Run, RunDetail, ZoneSegment};
use crate::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};

fn run_from_row(r: &Row) -> rusqlite::Result<Run> {
    let goal_json: String = r.get("goal_json")?;
    Ok(Run {
        id: r.get("id")?,
        plan_id: r.get("plan_id")?,
        kind: r.get("kind")?,
        label: r.get("label")?,
        character_name: r.get("character_name")?,
        character_class: r.get("character_class")?,
        started_at: r.get("started_at")?,
        ended_at: r.get("ended_at")?,
        status: r.get("status")?,
        goal: serde_json::from_str(&goal_json).unwrap_or(serde_json::Value::Null),
        total_ms: r.get("total_ms")?,
        total_load_ms: r.get("total_load_ms")?,
        deaths: r.get("deaths")?,
        notes_md: r.get("notes_md")?,
        game: r.get("game")?,
        patch: r.get("patch")?,
    })
}

fn segment_from_row(r: &Row) -> rusqlite::Result<ZoneSegment> {
    Ok(ZoneSegment {
        id: r.get("id")?,
        run_id: r.get("run_id")?,
        seq: r.get("seq")?,
        area_id: r.get("area_id")?,
        client_area_id: r.get("client_area_id")?,
        area_name: r.get("area_name")?,
        act: r.get("act")?,
        area_level: r.get("area_level")?,
        kind: r.get("kind")?,
        entered_at: r.get("entered_at")?,
        exited_at: r.get("exited_at")?,
        load_ms: r.get("load_ms")?,
        is_revisit: r.get::<_, i64>("is_revisit")? != 0,
        instance_seed: r.get("instance_seed")?,
        excluded: r.get::<_, i64>("excluded")? != 0,
    })
}

fn level_from_row(r: &Row) -> rusqlite::Result<LevelEvent> {
    Ok(LevelEvent {
        id: r.get("id")?,
        run_id: r.get("run_id")?,
        progression_id: r.get("progression_id")?,
        segment_id: r.get("segment_id")?,
        character: r.get("character")?,
        class: r.get("class")?,
        level: r.get("level")?,
        at: r.get("at")?,
    })
}

fn death_from_row(r: &Row) -> rusqlite::Result<DeathEvent> {
    Ok(DeathEvent {
        id: r.get("id")?,
        run_id: r.get("run_id")?,
        progression_id: r.get("progression_id")?,
        segment_id: r.get("segment_id")?,
        character: r.get("character")?,
        at: r.get("at")?,
    })
}

pub struct NewRun<'a> {
    pub plan_id: Option<i64>,
    pub kind: &'a str,
    pub started_at: i64,
    pub goal: &'a serde_json::Value,
    pub game: &'a str,
    pub patch: &'a str,
}

pub fn insert_run(conn: &Connection, new: &NewRun) -> Result<Run> {
    conn.execute(
        "INSERT INTO runs (plan_id, kind, started_at, status, goal_json, game, patch)
         VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6)",
        params![
            new.plan_id,
            new.kind,
            new.started_at,
            new.goal.to_string(),
            new.game,
            new.patch
        ],
    )?;
    get_run(conn, conn.last_insert_rowid()).map(|r| r.expect("run just inserted"))
}

pub fn get_run(conn: &Connection, id: i64) -> Result<Option<Run>> {
    Ok(conn
        .query_row("SELECT * FROM runs WHERE id = ?1", params![id], run_from_row)
        .optional()?)
}

pub fn active_run(conn: &Connection) -> Result<Option<Run>> {
    Ok(conn
        .query_row(
            "SELECT * FROM runs WHERE status = 'active' ORDER BY id DESC LIMIT 1",
            [],
            run_from_row,
        )
        .optional()?)
}

pub fn list_runs(conn: &Connection) -> Result<Vec<Run>> {
    let mut stmt = conn.prepare("SELECT * FROM runs ORDER BY started_at DESC")?;
    let rows = stmt.query_map([], run_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn run_detail(conn: &Connection, id: i64) -> Result<Option<RunDetail>> {
    let Some(run) = get_run(conn, id)? else {
        return Ok(None);
    };
    Ok(Some(RunDetail {
        segments: segments(conn, id)?,
        levels: levels(conn, id)?,
        deaths: deaths(conn, id)?,
        run,
    }))
}

pub fn segments(conn: &Connection, run_id: i64) -> Result<Vec<ZoneSegment>> {
    let mut stmt =
        conn.prepare("SELECT * FROM zone_segments WHERE run_id = ?1 ORDER BY seq")?;
    let rows = stmt.query_map(params![run_id], segment_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn levels(conn: &Connection, run_id: i64) -> Result<Vec<LevelEvent>> {
    let mut stmt =
        conn.prepare("SELECT * FROM level_events WHERE run_id = ?1 ORDER BY at")?;
    let rows = stmt.query_map(params![run_id], level_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn levels_for_progression(conn: &Connection, prog_id: i64) -> Result<Vec<LevelEvent>> {
    let mut stmt =
        conn.prepare("SELECT * FROM level_events WHERE progression_id = ?1 ORDER BY at")?;
    let rows = stmt.query_map(params![prog_id], level_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn deaths(conn: &Connection, run_id: i64) -> Result<Vec<DeathEvent>> {
    let mut stmt = conn.prepare("SELECT * FROM deaths WHERE run_id = ?1 ORDER BY at")?;
    let rows = stmt.query_map(params![run_id], death_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set_run_character(
    conn: &Connection,
    run_id: i64,
    name: &str,
    class: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE runs SET character_name = ?2, character_class = ?3 WHERE id = ?1",
        params![run_id, name, class],
    )?;
    Ok(())
}

pub fn bump_deaths(conn: &Connection, run_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE runs SET deaths = deaths + 1 WHERE id = ?1",
        params![run_id],
    )?;
    Ok(())
}

/// Finish a run: sets status, ended_at and both totals.
pub fn finish_run(conn: &Connection, run_id: i64, status: &str, ended_at: i64) -> Result<Run> {
    let total_load: i64 = conn.query_row(
        "SELECT COALESCE(SUM(load_ms), 0) FROM zone_segments WHERE run_id = ?1",
        params![run_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "UPDATE runs SET status = ?2, ended_at = ?3,
            total_ms = ?3 - started_at, total_load_ms = ?4
         WHERE id = ?1",
        params![run_id, status, ended_at, total_load],
    )?;
    Ok(get_run(conn, run_id)?.expect("run exists"))
}

pub fn update_run_meta(
    conn: &Connection,
    run_id: i64,
    kind: &str,
    label: Option<&str>,
    plan_id: Option<i64>,
    notes_md: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE runs SET kind = ?2, label = ?3, plan_id = ?4, notes_md = ?5 WHERE id = ?1",
        params![run_id, kind, label, plan_id, notes_md],
    )?;
    Ok(())
}

pub fn delete_run(conn: &Connection, run_id: i64) -> Result<()> {
    conn.execute("DELETE FROM runs WHERE id = ?1", params![run_id])?;
    Ok(())
}

pub struct NewSegment<'a> {
    pub run_id: i64,
    pub area_id: &'a str,
    pub client_area_id: Option<&'a str>,
    pub area_name: &'a str,
    pub act: Option<i64>,
    pub area_level: Option<i64>,
    pub kind: &'a str,
    pub entered_at: i64,
    pub load_ms: i64,
    pub is_revisit: bool,
    pub instance_seed: Option<i64>,
}

pub fn insert_segment(conn: &Connection, s: &NewSegment) -> Result<ZoneSegment> {
    let seq: i64 = conn.query_row(
        "SELECT COALESCE(MAX(seq), 0) + 1 FROM zone_segments WHERE run_id = ?1",
        params![s.run_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO zone_segments
           (run_id, seq, area_id, client_area_id, area_name, act, area_level, kind,
            entered_at, load_ms, is_revisit, instance_seed)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![
            s.run_id,
            seq,
            s.area_id,
            s.client_area_id,
            s.area_name,
            s.act,
            s.area_level,
            s.kind,
            s.entered_at,
            s.load_ms,
            s.is_revisit as i64,
            s.instance_seed
        ],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT * FROM zone_segments WHERE id = ?1",
        params![id],
        segment_from_row,
    )?)
}

pub fn close_segment(conn: &Connection, segment_id: i64, exited_at: i64) -> Result<()> {
    conn.execute(
        "UPDATE zone_segments SET exited_at = ?2 WHERE id = ?1 AND exited_at IS NULL",
        params![segment_id, exited_at],
    )?;
    Ok(())
}

pub fn open_segment(conn: &Connection, run_id: i64) -> Result<Option<ZoneSegment>> {
    Ok(conn
        .query_row(
            "SELECT * FROM zone_segments
             WHERE run_id = ?1 AND exited_at IS NULL ORDER BY seq DESC LIMIT 1",
            params![run_id],
            segment_from_row,
        )
        .optional()?)
}

pub fn visited_area_ids(conn: &Connection, run_id: i64) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT DISTINCT area_id FROM zone_segments WHERE run_id = ?1")?;
    let rows = stmt.query_map(params![run_id], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set_segment_excluded(conn: &Connection, segment_id: i64, excluded: bool) -> Result<()> {
    conn.execute(
        "UPDATE zone_segments SET excluded = ?2 WHERE id = ?1",
        params![segment_id, excluded as i64],
    )?;
    Ok(())
}

pub struct NewLevelEvent<'a> {
    pub run_id: Option<i64>,
    pub progression_id: Option<i64>,
    pub segment_id: Option<i64>,
    pub character: &'a str,
    pub class: Option<&'a str>,
    pub level: i64,
    pub at: i64,
}

pub fn insert_level_event(conn: &Connection, e: &NewLevelEvent) -> Result<LevelEvent> {
    conn.execute(
        "INSERT INTO level_events (run_id, progression_id, segment_id, character, class, level, at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![e.run_id, e.progression_id, e.segment_id, e.character, e.class, e.level, e.at],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT * FROM level_events WHERE id = ?1",
        params![id],
        level_from_row,
    )?)
}

pub fn insert_death(
    conn: &Connection,
    run_id: Option<i64>,
    progression_id: Option<i64>,
    segment_id: Option<i64>,
    character: &str,
    at: i64,
) -> Result<DeathEvent> {
    conn.execute(
        "INSERT INTO deaths (run_id, progression_id, segment_id, character, at)
         VALUES (?1,?2,?3,?4,?5)",
        params![run_id, progression_id, segment_id, character, at],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row("SELECT * FROM deaths WHERE id = ?1", params![id], death_from_row)?)
}

/// Latest level seen for a character in a run or progression context.
pub fn last_level(conn: &Connection, character: &str) -> Result<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT level FROM level_events WHERE character = ?1 ORDER BY at DESC, id DESC LIMIT 1",
            params![character],
            |r| r.get(0),
        )
        .optional()?)
}

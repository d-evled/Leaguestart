use crate::db::models::{GuideLink, LeaguePlan, PobCheckpoint};
use crate::db::now_ms;
use crate::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Deserialize;

fn plan_from_row(r: &Row) -> rusqlite::Result<LeaguePlan> {
    Ok(LeaguePlan {
        id: r.get("id")?,
        name: r.get("name")?,
        game: r.get("game")?,
        league_name: r.get("league_name")?,
        build_name: r.get("build_name")?,
        class: r.get("class")?,
        ascendancy: r.get("ascendancy")?,
        notes_md: r.get("notes_md")?,
        created_at: r.get("created_at")?,
        archived: r.get::<_, i64>("archived")? != 0,
    })
}

fn checkpoint_from_row(r: &Row) -> rusqlite::Result<PobCheckpoint> {
    Ok(PobCheckpoint {
        id: r.get("id")?,
        plan_id: r.get("plan_id")?,
        label: r.get("label")?,
        sort_order: r.get("sort_order")?,
        pob_code: r.get("pob_code")?,
        url: r.get("url")?,
        notes: r.get("notes")?,
        decoded_class: r.get("decoded_class")?,
        decoded_ascendancy: r.get("decoded_ascendancy")?,
        decoded_level: r.get("decoded_level")?,
        decoded_main_skill: r.get("decoded_main_skill")?,
        created_at: r.get("created_at")?,
    })
}

fn link_from_row(r: &Row) -> rusqlite::Result<GuideLink> {
    Ok(GuideLink {
        id: r.get("id")?,
        plan_id: r.get("plan_id")?,
        title: r.get("title")?,
        url: r.get("url")?,
        kind: r.get("kind")?,
        notes: r.get("notes")?,
        sort_order: r.get("sort_order")?,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInput {
    pub id: Option<i64>,
    pub name: String,
    pub league_name: Option<String>,
    pub build_name: Option<String>,
    pub class: Option<String>,
    pub ascendancy: Option<String>,
    pub notes_md: Option<String>,
    #[serde(default)]
    pub archived: bool,
}

pub fn upsert_plan(conn: &Connection, p: &PlanInput) -> Result<LeaguePlan> {
    let id = match p.id {
        Some(id) => {
            conn.execute(
                "UPDATE league_plans SET name=?2, league_name=?3, build_name=?4,
                   class=?5, ascendancy=?6, notes_md=?7, archived=?8 WHERE id=?1",
                params![
                    id,
                    p.name,
                    p.league_name,
                    p.build_name,
                    p.class,
                    p.ascendancy,
                    p.notes_md,
                    p.archived as i64
                ],
            )?;
            id
        }
        None => {
            conn.execute(
                "INSERT INTO league_plans (name, league_name, build_name, class, ascendancy, notes_md, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![p.name, p.league_name, p.build_name, p.class, p.ascendancy, p.notes_md, now_ms()],
            )?;
            conn.last_insert_rowid()
        }
    };
    Ok(get_plan(conn, id)?.expect("plan exists"))
}

pub fn get_plan(conn: &Connection, id: i64) -> Result<Option<LeaguePlan>> {
    Ok(conn
        .query_row(
            "SELECT * FROM league_plans WHERE id=?1",
            params![id],
            plan_from_row,
        )
        .optional()?)
}

pub fn list_plans(conn: &Connection) -> Result<Vec<LeaguePlan>> {
    let mut stmt = conn.prepare("SELECT * FROM league_plans ORDER BY archived, created_at DESC")?;
    let rows = stmt.query_map([], plan_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_plan(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM league_plans WHERE id=?1", params![id])?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointInput {
    pub id: Option<i64>,
    pub plan_id: i64,
    pub label: String,
    pub pob_code: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
}

pub fn upsert_checkpoint(conn: &Connection, c: &CheckpointInput) -> Result<PobCheckpoint> {
    let id = match c.id {
        Some(id) => {
            conn.execute(
                "UPDATE pob_checkpoints SET label=?2, pob_code=?3, url=?4, notes=?5 WHERE id=?1",
                params![id, c.label, c.pob_code, c.url, c.notes],
            )?;
            id
        }
        None => {
            let next: i64 = conn.query_row(
                "SELECT COALESCE(MAX(sort_order),0)+1 FROM pob_checkpoints WHERE plan_id=?1",
                params![c.plan_id],
                |r| r.get(0),
            )?;
            conn.execute(
                "INSERT INTO pob_checkpoints (plan_id, label, sort_order, pob_code, url, notes, created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![c.plan_id, c.label, next, c.pob_code, c.url, c.notes, now_ms()],
            )?;
            conn.last_insert_rowid()
        }
    };
    Ok(conn.query_row(
        "SELECT * FROM pob_checkpoints WHERE id=?1",
        params![id],
        checkpoint_from_row,
    )?)
}

pub fn list_checkpoints(conn: &Connection, plan_id: i64) -> Result<Vec<PobCheckpoint>> {
    let mut stmt =
        conn.prepare("SELECT * FROM pob_checkpoints WHERE plan_id=?1 ORDER BY sort_order")?;
    let rows = stmt.query_map(params![plan_id], checkpoint_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_checkpoint(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM pob_checkpoints WHERE id=?1", params![id])?;
    Ok(())
}

/// Reorder checkpoints: `ids` is the full desired order for one plan.
pub fn reorder_checkpoints(conn: &Connection, ids: &[i64]) -> Result<()> {
    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE pob_checkpoints SET sort_order=?2 WHERE id=?1",
            params![id, (i + 1) as i64],
        )?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub id: Option<i64>,
    pub plan_id: i64,
    pub title: String,
    pub url: String,
    pub kind: String,
    pub notes: Option<String>,
}

pub fn upsert_link(conn: &Connection, l: &LinkInput) -> Result<GuideLink> {
    let id = match l.id {
        Some(id) => {
            conn.execute(
                "UPDATE guide_links SET title=?2, url=?3, kind=?4, notes=?5 WHERE id=?1",
                params![id, l.title, l.url, l.kind, l.notes],
            )?;
            id
        }
        None => {
            let next: i64 = conn.query_row(
                "SELECT COALESCE(MAX(sort_order),0)+1 FROM guide_links WHERE plan_id=?1",
                params![l.plan_id],
                |r| r.get(0),
            )?;
            conn.execute(
                "INSERT INTO guide_links (plan_id, title, url, kind, notes, sort_order)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![l.plan_id, l.title, l.url, l.kind, l.notes, next],
            )?;
            conn.last_insert_rowid()
        }
    };
    Ok(conn.query_row(
        "SELECT * FROM guide_links WHERE id=?1",
        params![id],
        link_from_row,
    )?)
}

pub fn list_links(conn: &Connection, plan_id: i64) -> Result<Vec<GuideLink>> {
    let mut stmt =
        conn.prepare("SELECT * FROM guide_links WHERE plan_id=?1 ORDER BY sort_order")?;
    let rows = stmt.query_map(params![plan_id], link_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_link(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM guide_links WHERE id=?1", params![id])?;
    Ok(())
}

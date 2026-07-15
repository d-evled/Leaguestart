//! User-defined run groups: buckets for organizing the run library
//! (per leveling setup, per league, etc.).

use crate::db::models::RunGroup;
use crate::Result;
use rusqlite::{params, Connection, Row};

fn group_from_row(r: &Row) -> rusqlite::Result<RunGroup> {
    Ok(RunGroup {
        id: r.get("id")?,
        name: r.get("name")?,
        created_at: r.get("created_at")?,
    })
}

pub fn list(conn: &Connection) -> Result<Vec<RunGroup>> {
    let mut stmt = conn.prepare("SELECT * FROM run_groups ORDER BY name COLLATE NOCASE")?;
    let rows = stmt.query_map([], group_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create(conn: &Connection, name: &str) -> Result<RunGroup> {
    conn.execute(
        "INSERT INTO run_groups (name, created_at) VALUES (?1, ?2)",
        params![name, crate::db::now_ms()],
    )?;
    let id = conn.last_insert_rowid();
    Ok(conn.query_row(
        "SELECT * FROM run_groups WHERE id = ?1",
        params![id],
        group_from_row,
    )?)
}

pub fn rename(conn: &Connection, id: i64, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE run_groups SET name = ?2 WHERE id = ?1",
        params![id, name],
    )?;
    Ok(())
}

/// Deleting a group keeps its runs — `runs.group_id` is set NULL by the FK.
pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM run_groups WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_run_group(conn: &Connection, run_id: i64, group_id: Option<i64>) -> Result<()> {
    conn.execute(
        "UPDATE runs SET group_id = ?2 WHERE id = ?1",
        params![run_id, group_id],
    )?;
    Ok(())
}

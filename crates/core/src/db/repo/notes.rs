use crate::db::models::ZoneNote;
use crate::db::now_ms;
use crate::Result;
use rusqlite::{params, Connection, Row};

fn note_from_row(r: &Row) -> rusqlite::Result<ZoneNote> {
    Ok(ZoneNote {
        id: r.get("id")?,
        game: r.get("game")?,
        area_id: r.get("area_id")?,
        note_md: r.get("note_md")?,
        flagged: r.get::<_, i64>("flagged")? != 0,
        updated_at: r.get("updated_at")?,
    })
}

pub fn list(conn: &Connection, game: &str) -> Result<Vec<ZoneNote>> {
    let mut stmt = conn.prepare("SELECT * FROM zone_notes WHERE game=?1")?;
    let rows = stmt.query_map(params![game], note_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set(
    conn: &Connection,
    game: &str,
    area_id: &str,
    note_md: Option<&str>,
    flagged: bool,
) -> Result<ZoneNote> {
    conn.execute(
        "INSERT INTO zone_notes (game, area_id, note_md, flagged, updated_at)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(game, area_id) DO UPDATE SET
           note_md=excluded.note_md, flagged=excluded.flagged, updated_at=excluded.updated_at",
        params![game, area_id, note_md, flagged as i64, now_ms()],
    )?;
    Ok(conn.query_row(
        "SELECT * FROM zone_notes WHERE game=?1 AND area_id=?2",
        params![game, area_id],
        note_from_row,
    )?)
}

use crate::Result;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

pub fn get_all(conn: &Connection) -> Result<HashMap<String, serde_json::Value>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        out.insert(
            k,
            serde_json::from_str(&v).unwrap_or(serde_json::Value::Null),
        );
    }
    Ok(out)
}

pub fn get(conn: &Connection, key: &str) -> Result<Option<serde_json::Value>> {
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?;
    Ok(v.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)))
}

pub fn get_string(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(get(conn, key)?.and_then(|v| v.as_str().map(str::to_string)))
}

pub fn set(conn: &Connection, key: &str, value: &serde_json::Value) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )?;
    Ok(())
}

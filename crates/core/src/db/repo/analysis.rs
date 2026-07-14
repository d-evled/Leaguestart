//! Read-side analysis: run comparison and per-zone bottleneck statistics.
//! Everything is computed on demand — at this scale (dozens of runs × ~120
//! segments) there is no need for rollup tables.

use crate::areas::AreaDb;
use crate::db::models::{CompareData, CompareRow, CumulativePoint, LevelPoint, ZoneStat};
use crate::db::repo::{notes, runs};
use crate::Result;
use std::collections::HashMap;

/// Display metadata for an area seen in a run: (name, act, kind).
type AreaMeta = (String, Option<i64>, String);

/// Merged active milliseconds per area for one run (loads excluded because
/// they are stored separately; open segments are ignored).
/// Returns (area_id -> ms) plus display metadata for areas seen in this run.
fn merged_zone_times(
    conn: &rusqlite::Connection,
    run_id: i64,
) -> Result<(HashMap<String, i64>, HashMap<String, AreaMeta>)> {
    let mut times: HashMap<String, i64> = HashMap::new();
    let mut meta: HashMap<String, AreaMeta> = HashMap::new();
    for s in runs::segments(conn, run_id)? {
        if s.excluded {
            continue;
        }
        let Some(exited) = s.exited_at else { continue };
        *times.entry(s.area_id.clone()).or_insert(0) += (exited - s.entered_at).max(0);
        meta.entry(s.area_id)
            .or_insert((s.area_name, s.act, s.kind));
    }
    Ok((times, meta))
}

fn canonical_order(areas: &AreaDb, area_id: &str) -> (i64, i64) {
    match areas.by_id(area_id) {
        Some(a) => (
            a.act.map(|x| x as i64).unwrap_or(98),
            a.order.unwrap_or(9_999),
        ),
        None => (99, 9_999),
    }
}

pub fn compare(
    conn: &rusqlite::Connection,
    areas: &AreaDb,
    run_ids: &[i64],
) -> Result<CompareData> {
    let mut run_rows = Vec::new();
    let mut per_run_times = Vec::new();
    let mut union_meta: HashMap<String, AreaMeta> = HashMap::new();
    let mut first_seen: HashMap<String, usize> = HashMap::new();

    for &id in run_ids {
        let Some(run) = runs::get_run(conn, id)? else {
            continue;
        };
        let (times, meta) = merged_zone_times(conn, id)?;
        for (aid, m) in meta {
            let idx = first_seen.len();
            first_seen.entry(aid.clone()).or_insert(idx);
            union_meta.entry(aid).or_insert(m);
        }
        run_rows.push(run);
        per_run_times.push(times);
    }

    let mut area_ids: Vec<String> = union_meta.keys().cloned().collect();
    area_ids.sort_by_key(|aid| {
        let (act, order) = canonical_order(areas, aid);
        (act, order, *first_seen.get(aid).unwrap_or(&usize::MAX))
    });

    let rows: Vec<CompareRow> = area_ids
        .iter()
        .map(|aid| {
            let (name, act, kind) = union_meta.get(aid).cloned().unwrap();
            let order = areas.by_id(aid).and_then(|a| a.order);
            CompareRow {
                area_id: aid.clone(),
                area_name: name,
                act,
                order,
                kind,
                per_run_ms: per_run_times.iter().map(|t| t.get(aid).copied()).collect(),
            }
        })
        .collect();

    let cumulative: Vec<Vec<CumulativePoint>> = per_run_times
        .iter()
        .map(|times| {
            let mut acc = 0i64;
            rows.iter()
                .enumerate()
                .filter_map(|(i, row)| {
                    times.get(&row.area_id).map(|ms| {
                        acc += ms;
                        CumulativePoint {
                            row_index: i as i64,
                            cumulative_ms: acc,
                        }
                    })
                })
                .collect()
        })
        .collect();

    let mut level_curves = Vec::new();
    for run in &run_rows {
        let levels = runs::levels(conn, run.id)?;
        level_curves.push(
            levels
                .iter()
                .map(|l| LevelPoint {
                    elapsed_ms: l.at - run.started_at,
                    level: l.level,
                })
                .collect(),
        );
    }

    Ok(CompareData {
        runs: run_rows,
        rows,
        cumulative,
        level_curves,
    })
}

fn percentile(sorted: &[i64], p: f64) -> i64 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = p * (sorted.len() - 1) as f64;
    let lo = idx.floor() as usize;
    let hi = idx.ceil() as usize;
    if lo == hi {
        sorted[lo]
    } else {
        let frac = idx - lo as f64;
        (sorted[lo] as f64 * (1.0 - frac) + sorted[hi] as f64 * frac).round() as i64
    }
}

pub fn zone_stats(
    conn: &rusqlite::Connection,
    areas: &AreaDb,
    plan_id: Option<i64>,
    game: &str,
) -> Result<Vec<ZoneStat>> {
    let all_runs = runs::list_runs(conn)?;
    let mut selected: Vec<_> = all_runs
        .into_iter()
        .filter(|r| r.game == game && plan_id.is_none_or(|p| r.plan_id == Some(p)))
        .collect();
    // Oldest first so "last" means the most recent run's time.
    selected.sort_by_key(|r| r.started_at);

    struct Acc {
        name: String,
        act: Option<i64>,
        values: Vec<i64>,
        last: i64,
    }
    let mut per_area: HashMap<String, Acc> = HashMap::new();
    for run in &selected {
        let (times, meta) = merged_zone_times(conn, run.id)?;
        for (aid, ms) in times {
            let (name, act, kind) = meta.get(&aid).cloned().unwrap();
            if kind != "campaign" && kind != "town" {
                continue;
            }
            let acc = per_area.entry(aid).or_insert(Acc {
                name,
                act,
                values: Vec::new(),
                last: 0,
            });
            acc.values.push(ms);
            acc.last = ms; // runs iterate oldest -> newest
        }
    }

    // Median per zone, then a typical (median) zone-median per act for flagging.
    let mut medians: HashMap<String, i64> = HashMap::new();
    for (aid, acc) in &mut per_area {
        acc.values.sort();
        medians.insert(aid.clone(), percentile(&acc.values, 0.5));
    }
    let mut act_zone_medians: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut act_totals: HashMap<i64, i64> = HashMap::new();
    for (aid, acc) in &per_area {
        if let Some(act) = acc.act {
            let m = medians[aid];
            act_zone_medians.entry(act).or_default().push(m);
            *act_totals.entry(act).or_insert(0) += m;
        }
    }
    let act_typical: HashMap<i64, i64> = act_zone_medians
        .into_iter()
        .map(|(act, mut v)| {
            v.sort();
            (act, percentile(&v, 0.5))
        })
        .collect();

    let note_map: HashMap<String, (bool, Option<String>)> = notes::list(conn, game)?
        .into_iter()
        .map(|n| (n.area_id, (n.flagged, n.note_md)))
        .collect();

    let mut out: Vec<ZoneStat> = per_area
        .into_iter()
        .map(|(aid, acc)| {
            let median = medians[&aid];
            let iqr = percentile(&acc.values, 0.75) - percentile(&acc.values, 0.25);
            let n = acc.values.len() as i64;
            let typical = acc
                .act
                .and_then(|a| act_typical.get(&a))
                .copied()
                .unwrap_or(0);
            let share = acc
                .act
                .and_then(|a| act_totals.get(&a))
                .filter(|&&t| t > 0)
                .map(|&t| median as f64 / t as f64)
                .unwrap_or(0.0);
            let auto_flag = (typical > 0 && median >= (typical as f64 * 1.4) as i64)
                || (n >= 3 && iqr * 2 > median && median > 0);
            let (flagged, note_md) = note_map.get(&aid).cloned().unwrap_or((false, None));
            let order = areas.by_id(&aid).and_then(|a| a.order);
            ZoneStat {
                area_name: acc.name,
                act: acc.act,
                order,
                runs_counted: n,
                best_ms: acc.values.first().copied().unwrap_or(0),
                median_ms: median,
                last_ms: acc.last,
                iqr_ms: iqr,
                share_of_act: share,
                auto_flag,
                flagged,
                note_md,
                area_id: aid,
            }
        })
        .collect();
    out.sort_by_key(|s| {
        let (act, order) = canonical_order(areas, &s.area_id);
        (act, order)
    });
    Ok(out)
}

import { useMemo, useState } from "react";
import DeltaBadge from "../components/DeltaBadge";
import { MultiLine, SERIES_COLORS } from "../components/charts";
import { useCompare, useRuns } from "../lib/queries";
import { fmtClock, fmtDur } from "../lib/time";

const MAX_RUNS = 4;

export default function ComparePage() {
  const { data: runs } = useRuns();
  const [selected, setSelected] = useState<number[]>([]);
  const [includeTowns, setIncludeTowns] = useState(true);
  const [includeOther, setIncludeOther] = useState(false);

  const candidates = (runs ?? []).filter((r) => r.status !== "active");
  const { data: cmp } = useCompare(selected);

  const toggle = (id: number) => {
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < MAX_RUNS
          ? [...cur, id]
          : cur,
    );
  };

  const rows = useMemo(() => {
    if (!cmp) return [];
    return cmp.rows.filter((r) => {
      if (r.kind === "campaign") return true;
      if (r.kind === "town") return includeTowns;
      return includeOther;
    });
  }, [cmp, includeTowns, includeOther]);

  const runLabel = (i: number) => {
    const r = cmp?.runs[i];
    if (!r) return `run ${i + 1}`;
    return r.label || r.characterName || fmtClock(r.startedAt);
  };

  // Cumulative chart data aligned on canonical row index.
  const cumulativeData = useMemo(() => {
    if (!cmp) return [];
    return cmp.rows.map((r, i) => {
      const point: Record<string, number | string | null> = {
        x: i,
        zone: r.areaName,
      };
      cmp.cumulative.forEach((series, si) => {
        const hit = series.find((p) => p.rowIndex === i);
        point[`run${si}`] = hit ? hit.cumulativeMs / 60000 : null;
      });
      return point;
    });
  }, [cmp]);

  // Level curves merged on a shared minute axis.
  const levelData = useMemo(() => {
    if (!cmp) return [];
    const xs = new Set<number>();
    for (const curve of cmp.levelCurves) {
      for (const p of curve) xs.add(Math.round(p.elapsedMs / 60000));
    }
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted.map((x) => {
      const point: Record<string, number | null> = { x };
      cmp.levelCurves.forEach((curve, si) => {
        const hit = curve.filter((p) => Math.round(p.elapsedMs / 60000) <= x).at(-1);
        point[`run${si}`] = hit ? hit.level : null;
      });
      return point;
    });
  }, [cmp]);

  const series =
    cmp?.runs.map((_, i) => ({ key: `run${i}`, label: runLabel(i) })) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compare runs</h1>

      <div className="panel p-4">
        <div className="label mb-2">
          Pick up to {MAX_RUNS} runs (colors stay with the pick order)
        </div>
        {!candidates.length && (
          <p className="text-ink-dim text-sm">No finished runs to compare yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {candidates.map((r) => {
            const idx = selected.indexOf(r.id);
            return (
              <button
                key={r.id}
                className="btn text-xs"
                style={
                  idx >= 0
                    ? { borderColor: SERIES_COLORS[idx], color: SERIES_COLORS[idx] }
                    : undefined
                }
                onClick={() => toggle(r.id)}
              >
                {r.label || r.characterName || fmtClock(r.startedAt)}
                <span className="opacity-60 ml-1">
                  {fmtDur(r.totalMs)} · {r.kind === "league_start" ? "LS" : "practice"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-sm text-ink-dim">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeTowns}
              onChange={(e) => setIncludeTowns(e.target.checked)}
            />
            include towns
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeOther}
              onChange={(e) => setIncludeOther(e.target.checked)}
            />
            include maps/hideouts/other
          </label>
        </div>
      </div>

      {cmp && selected.length >= 2 && (
        <>
          <div className="panel p-4">
            <h3 className="font-medium mb-2 text-sm">
              Cumulative time by campaign position (loads removed)
            </h3>
            <MultiLine
              data={cumulativeData}
              series={series}
              xKey="x"
              height={280}
              yTickFormatter={(v) => `${v.toFixed(0)}m`}
              valueFormatter={(v) => fmtDur(v * 60000)}
              labelFormatter={(v) =>
                cmp.rows[Number(v)]?.areaName ?? String(v)
              }
            />
          </div>

          <div className="panel p-4">
            <h3 className="font-medium mb-2 text-sm">Character level over time</h3>
            <MultiLine
              data={levelData}
              series={series}
              xKey="x"
              height={240}
              stepped
              xTickFormatter={(v) => `${v}m`}
              valueFormatter={(v) => `level ${v}`}
              labelFormatter={(v) => `${v} min`}
            />
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Zone</th>
                  <th className="th w-14">Act</th>
                  {cmp.runs.map((_, i) => (
                    <th key={i} className="th text-right" style={{ color: SERIES_COLORS[i] }}>
                      {runLabel(i)}
                    </th>
                  ))}
                  {cmp.runs.length > 1 && <th className="th text-right">Δ vs first</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const base = r.perRunMs[0];
                  const last = r.perRunMs[cmp.runs.length - 1];
                  const delta =
                    base != null && last != null && cmp.runs.length > 1
                      ? last - base
                      : null;
                  return (
                    <tr key={r.areaId} className="hover:bg-panel-2/40">
                      <td className="td">
                        {r.areaName}
                        {r.kind !== "campaign" && (
                          <span className="badge bg-panel-2 text-ink-dim ml-1.5">
                            {r.kind}
                          </span>
                        )}
                      </td>
                      <td className="td text-ink-dim">{r.act ?? "—"}</td>
                      {r.perRunMs.map((ms, i) => (
                        <td key={i} className="td text-right tabular-nums">
                          {fmtDur(ms)}
                        </td>
                      ))}
                      {cmp.runs.length > 1 && (
                        <td className="td text-right">
                          <DeltaBadge ms={delta} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selected.length < 2 && (
        <div className="panel p-6 text-ink-dim">
          Select at least two runs to see split deltas, cumulative pace, and
          level curves side by side.
        </div>
      )}
    </div>
  );
}

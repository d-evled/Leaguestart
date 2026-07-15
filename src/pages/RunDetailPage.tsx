import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { setRunGroup, setSegmentExcluded, updateRunMeta } from "../lib/ipc";
import {
  useInvalidatingMutation,
  usePlans,
  useRunDetail,
  useRunGroups,
} from "../lib/queries";
import { ACT_LABELS, fmtClock, fmtDur } from "../lib/time";
import type { ZoneSegment } from "../types/ipc";

const PAUSE_KIND_LABEL: Record<string, string> = {
  exit: "logged out / game closed",
  afk: "AFK",
  manual: "manual",
};

export default function RunDetailPage() {
  const { id } = useParams();
  const runId = id ? Number(id) : null;
  const { data: detail } = useRunDetail(runId);
  const { data: plans } = usePlans();
  const { data: runGroups } = useRunGroups();
  const [merged, setMerged] = useState(false);

  const save = useInvalidatingMutation(updateRunMeta, [["runs"], ["run"]]);
  const assignGroup = useInvalidatingMutation(
    ({ id, groupId }: { id: number; groupId: number | null }) =>
      setRunGroup(id, groupId),
    [["runs"], ["run"]],
  );
  const exclude = useInvalidatingMutation(
    ({ segId, value }: { segId: number; value: boolean }) =>
      setSegmentExcluded(segId, value),
    [["run"], ["runs"], ["compare"], ["zoneStats"]],
  );

  const derived = useMemo(() => {
    if (!detail) return null;
    const levelsBySegment = new Map<number, number[]>();
    for (const l of detail.levels) {
      if (l.segmentId != null)
        levelsBySegment.set(l.segmentId, [
          ...(levelsBySegment.get(l.segmentId) ?? []),
          l.level,
        ]);
    }
    const deathSegments = new Set(
      detail.deaths.map((d) => d.segmentId).filter((x) => x != null),
    );
    return { levelsBySegment, deathSegments };
  }, [detail]);

  if (!detail || !derived) {
    return (
      <div>
        <Link to="/runs" className="text-accent hover:underline">
          ← Runs
        </Link>
        <div className="panel p-6 mt-4 text-ink-dim">Run not found.</div>
      </div>
    );
  }
  const { run, segments } = detail;

  const dwell = (s: ZoneSegment) =>
    s.exitedAt != null ? s.exitedAt - s.enteredAt : null;

  // Act groups (chronological), each with subtotal of non-excluded dwell.
  const groups: { act: number | null; segs: ZoneSegment[] }[] = [];
  for (const s of segments) {
    const last = groups.at(-1);
    if (last && last.act === s.act) last.segs.push(s);
    else groups.push({ act: s.act, segs: [s] });
  }

  // Merged-by-zone rows.
  const mergedRows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; act: number | null; kind: string; ms: number; visits: number }
    >();
    for (const s of segments) {
      if (s.excluded) continue;
      const d = dwell(s);
      if (d == null) continue;
      const row = map.get(s.areaId) ?? {
        name: s.areaName,
        act: s.act,
        kind: s.kind,
        ms: 0,
        visits: 0,
      };
      row.ms += d;
      row.visits += 1;
      map.set(s.areaId, row);
    }
    return [...map.values()];
  }, [segments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/runs" className="text-accent hover:underline text-sm">
            ← Runs
          </Link>
          <h1 className="text-xl font-semibold">
            {run.label || run.characterName || "Run"} · {fmtClock(run.startedAt)}
          </h1>
        </div>
        <button className="btn" onClick={() => setMerged(!merged)}>
          {merged ? "Chronological view" : "Merged by zone"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat
          label="Time"
          value={run.totalMs != null ? fmtDur(run.totalMs - run.pausedMs) : "—"}
          title={`Wall clock ${fmtDur(run.totalMs)} minus pauses`}
        />
        <Stat label="Paused" value={run.pausedMs > 0 ? fmtDur(run.pausedMs) : "—"} />
        <Stat
          label="Load-removed"
          value={
            run.totalMs != null && run.totalLoadMs != null
              ? fmtDur(run.totalMs - run.pausedMs - run.totalLoadMs)
              : "—"
          }
        />
        <Stat label="Deaths" value={String(run.deaths)} />
        <Stat
          label="Final level"
          value={String(detail.levels.at(-1)?.level ?? "—")}
        />
      </div>

      <div className="panel p-4 grid md:grid-cols-5 gap-3">
        <div>
          <label className="label">Kind</label>
          <select
            className="input"
            value={run.kind}
            onChange={(e) =>
              save.mutate({
                id: run.id,
                kind: e.target.value,
                label: run.label,
                planId: run.planId,
                notesMd: run.notesMd,
              })
            }
          >
            <option value="practice">Practice</option>
            <option value="league_start">League start</option>
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            defaultValue={run.label ?? ""}
            placeholder={run.characterName ?? "e.g. attempt #3, new route"}
            onBlur={(e) =>
              save.mutate({
                id: run.id,
                kind: run.kind,
                label: e.target.value || null,
                planId: run.planId,
                notesMd: run.notesMd,
              })
            }
          />
        </div>
        <div>
          <label className="label">Plan</label>
          <select
            className="input"
            value={run.planId ?? ""}
            onChange={(e) =>
              save.mutate({
                id: run.id,
                kind: run.kind,
                label: run.label,
                planId: e.target.value ? Number(e.target.value) : null,
                notesMd: run.notesMd,
              })
            }
          >
            <option value="">— none —</option>
            {(plans ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Group</label>
          <select
            className="input"
            value={run.groupId ?? ""}
            onChange={(e) =>
              assignGroup.mutate({
                id: run.id,
                groupId: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">— none —</option>
            {(runGroups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <input
            className="input"
            defaultValue={run.notesMd ?? ""}
            placeholder="What went right / wrong?"
            onBlur={(e) =>
              save.mutate({
                id: run.id,
                kind: run.kind,
                label: run.label,
                planId: run.planId,
                notesMd: e.target.value || null,
              })
            }
          />
        </div>
      </div>

      {detail.pauses.length > 0 && (
        <div className="panel p-4">
          <div className="label mb-2">Pauses (excluded from run time)</div>
          <div className="space-y-1 text-sm">
            {detail.pauses.map((p) => (
              <div key={p.id} className="flex gap-3 tabular-nums">
                <span className="text-ink-dim w-36">{fmtClock(p.startedAt)}</span>
                <span className="w-20 text-right">
                  {p.endedAt != null ? fmtDur(p.endedAt - p.startedAt) : "open"}
                </span>
                <span className="text-ink-dim">
                  {PAUSE_KIND_LABEL[p.kind] ?? p.kind}
                  {p.auto ? " (auto)" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        {merged ? (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Zone</th>
                <th className="th">Act</th>
                <th className="th text-right">Visits</th>
                <th className="th text-right">Total time</th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((r, i) => (
                <tr key={i}>
                  <td className="td">{r.name}</td>
                  <td className="td text-ink-dim">
                    {r.act != null ? ACT_LABELS[r.act] : r.kind}
                  </td>
                  <td className="td text-right">{r.visits}</td>
                  <td className="td text-right tabular-nums">{fmtDur(r.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th w-10">#</th>
                <th className="th">Zone</th>
                <th className="th text-right">Time</th>
                <th className="th text-right">Load</th>
                <th className="th">Events</th>
                <th className="th w-16" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => {
                const subtotal = g.segs.reduce(
                  (a, s) => a + (s.excluded ? 0 : (dwell(s) ?? 0)),
                  0,
                );
                return (
                  <GroupBlock
                    key={gi}
                    group={g}
                    subtotal={subtotal}
                    dwell={dwell}
                    levelsBySegment={derived.levelsBySegment}
                    deathSegments={derived.deathSegments}
                    onToggleExclude={(segId, value) =>
                      exclude.mutate({ segId, value })
                    }
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="panel p-4" title={title}>
      <div className="label">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function GroupBlock({
  group,
  subtotal,
  dwell,
  levelsBySegment,
  deathSegments,
  onToggleExclude,
}: {
  group: { act: number | null; segs: ZoneSegment[] };
  subtotal: number;
  dwell: (s: ZoneSegment) => number | null;
  levelsBySegment: Map<number, number[]>;
  deathSegments: Set<number | null>;
  onToggleExclude: (segId: number, value: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-panel-2/60">
        <td className="td font-medium text-ink-dim" colSpan={2}>
          {group.act != null
            ? ACT_LABELS[group.act] ?? `Act ${group.act}`
            : "Endgame / other"}
        </td>
        <td className="td text-right text-ink-dim tabular-nums">{fmtDur(subtotal)}</td>
        <td className="td" colSpan={3} />
      </tr>
      {group.segs.map((s) => (
        <tr key={s.id} className={s.excluded ? "opacity-40" : ""}>
          <td className="td text-ink-dim">{s.seq}</td>
          <td className="td">
            {s.areaName}
            {s.isRevisit && <span className="text-ink-dim ml-1.5">↩</span>}
            {s.kind !== "campaign" && (
              <span className="badge bg-panel-2 text-ink-dim ml-1.5">{s.kind}</span>
            )}
          </td>
          <td className="td text-right tabular-nums">{fmtDur(dwell(s))}</td>
          <td className="td text-right tabular-nums text-ink-dim">
            {s.loadMs > 0 ? fmtDur(s.loadMs) : ""}
          </td>
          <td className="td">
            {(levelsBySegment.get(s.id) ?? []).map((l) => (
              <span key={l} className="badge bg-good/15 text-good mr-1">
                lvl {l}
              </span>
            ))}
            {deathSegments.has(s.id) && (
              <span className="badge bg-bad/15 text-bad">death</span>
            )}
          </td>
          <td className="td text-right">
            <button
              className="btn text-xs"
              title="Excluded segments don't count toward stats or comparisons"
              onClick={() => onToggleExclude(s.id, !s.excluded)}
            >
              {s.excluded ? "Include" : "Exclude"}
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

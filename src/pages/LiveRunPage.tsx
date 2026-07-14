import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTrackerStore } from "../stores/trackerStore";
import { stopActiveRun } from "../lib/ipc";
import { ACT_LABELS, fmtDur } from "../lib/time";
import type { ZoneSegment } from "../types/ipc";

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const KIND_BADGE: Record<string, string> = {
  town: "bg-panel-2 text-ink-dim",
  hideout: "bg-panel-2 text-ink-dim",
  map: "bg-accent/15 text-accent",
  lab: "bg-panel-2 text-ink-dim",
  unknown: "bg-bad/15 text-bad",
};

export default function LiveRunPage() {
  const status = useTrackerStore((s) => s.status);
  const detail = useTrackerStore((s) => s.activeRun);
  const now = useNow(detail != null);

  const derived = useMemo(() => {
    if (!detail) return null;
    const loadSum = detail.segments.reduce((a, s) => a + s.loadMs, 0);
    const elapsed = now - detail.run.startedAt;
    const level = detail.levels.at(-1)?.level ?? 1;
    const current = detail.segments.at(-1) ?? null;
    const levelsBySegment = new Map<number, number[]>();
    for (const l of detail.levels) {
      if (l.segmentId != null) {
        levelsBySegment.set(l.segmentId, [
          ...(levelsBySegment.get(l.segmentId) ?? []),
          l.level,
        ]);
      }
    }
    const deathSegments = new Set(
      detail.deaths.map((d) => d.segmentId).filter((x) => x != null),
    );
    return { loadSum, elapsed, level, current, levelsBySegment, deathSegments };
  }, [detail, now]);

  if (!detail || !derived) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Live</h1>
        <div className="panel p-6">
          <div className="text-lg">Waiting for The Twilight Strand…</div>
          <p className="text-ink-dim mt-2 max-w-xl">
            Create a new character and step onto the beach — the run starts
            (and times itself) automatically from the log. Loading screens are
            measured separately, level-ups and deaths are recorded as they
            happen.
          </p>
          {!status?.logPath && (
            <p className="mt-3">
              <Link className="text-accent hover:underline" to="/settings">
                Configure your Client.txt path first →
              </Link>
            </p>
          )}
        </div>
        {status?.activeProgressionId != null && (
          <div className="panel p-6">
            <div className="font-medium">Atlas watch is on</div>
            <p className="text-ink-dim mt-1">
              A progression is active — new-tier map completions are being
              recorded with your character level and elapsed time.
            </p>
            <Link className="text-accent hover:underline mt-2 inline-block" to="/atlas">
              Open Atlas →
            </Link>
          </div>
        )}
      </div>
    );
  }

  const { run, segments } = detail;
  const adjusted = derived.elapsed - derived.loadSum;

  // Group chronological segments by act (None -> "Endgame").
  const groups: { act: number | null; segs: ZoneSegment[] }[] = [];
  for (const s of segments) {
    const last = groups.at(-1);
    if (last && last.act === s.act) last.segs.push(s);
    else groups.push({ act: s.act, segs: [s] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Live run
          <span className="badge bg-accent/15 text-accent ml-2">
            {run.kind === "league_start" ? "LEAGUE START" : "practice"}
          </span>
        </h1>
        <div className="flex gap-2">
          <button className="btn" onClick={() => stopActiveRun(false)}>
            Finish run
          </button>
          <button className="btn-danger" onClick={() => stopActiveRun(true)}>
            Abandon
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="panel p-4 col-span-2">
          <div className="label">Elapsed / load-removed</div>
          <div className="text-2xl font-semibold tabular-nums">
            {fmtDur(derived.elapsed)}
            <span className="text-ink-dim text-lg"> / {fmtDur(adjusted)}</span>
          </div>
        </div>
        <div className="panel p-4">
          <div className="label">Character</div>
          <div className="text-lg">
            {run.characterName ?? "—"}
            <span className="text-ink-dim text-sm"> lvl {derived.level}</span>
          </div>
        </div>
        <div className="panel p-4">
          <div className="label">Zone</div>
          <div className="text-lg truncate">{derived.current?.areaName ?? "—"}</div>
          <div className="text-ink-dim text-xs">
            {derived.current?.act ? ACT_LABELS[derived.current.act] : ""}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label">Deaths</div>
          <div className={`text-2xl font-semibold ${run.deaths > 0 ? "text-bad" : ""}`}>
            {run.deaths}
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th w-10">#</th>
              <th className="th">Zone</th>
              <th className="th w-24 text-right">Time</th>
              <th className="th w-20 text-right">Load</th>
              <th className="th w-32">Events</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <GroupRows
                key={gi}
                group={g}
                now={now}
                levelsBySegment={derived.levelsBySegment}
                deathSegments={derived.deathSegments}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  now,
  levelsBySegment,
  deathSegments,
}: {
  group: { act: number | null; segs: ZoneSegment[] };
  now: number;
  levelsBySegment: Map<number, number[]>;
  deathSegments: Set<number | null>;
}) {
  const subtotal = group.segs.reduce(
    (a, s) => a + ((s.exitedAt ?? now) - s.enteredAt),
    0,
  );
  return (
    <>
      <tr className="bg-panel-2/60">
        <td className="td font-medium text-ink-dim" colSpan={2}>
          {group.act != null ? ACT_LABELS[group.act] ?? `Act ${group.act}` : "Endgame"}
        </td>
        <td className="td text-right text-ink-dim tabular-nums">{fmtDur(subtotal)}</td>
        <td className="td" colSpan={2} />
      </tr>
      {group.segs.map((s) => {
        const dwell = (s.exitedAt ?? now) - s.enteredAt;
        const live = s.exitedAt == null;
        const levels = levelsBySegment.get(s.id) ?? [];
        return (
          <tr key={s.id} className={live ? "bg-accent/5" : ""}>
            <td className="td text-ink-dim">{s.seq}</td>
            <td className="td">
              {s.areaName}
              {s.isRevisit && <span className="text-ink-dim ml-1.5">↩</span>}
              {KIND_BADGE[s.kind] && (
                <span className={`badge ml-1.5 ${KIND_BADGE[s.kind]}`}>{s.kind}</span>
              )}
            </td>
            <td className={`td text-right tabular-nums ${live ? "text-accent" : ""}`}>
              {fmtDur(dwell)}
            </td>
            <td className="td text-right tabular-nums text-ink-dim">
              {s.loadMs > 0 ? fmtDur(s.loadMs) : ""}
            </td>
            <td className="td">
              {levels.map((l) => (
                <span key={l} className="badge bg-good/15 text-good mr-1">
                  lvl {l}
                </span>
              ))}
              {deathSegments.has(s.id) && (
                <span className="badge bg-bad/15 text-bad">death</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

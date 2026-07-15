import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { setZoneNote } from "../lib/ipc";
import {
  useInvalidatingMutation,
  useLayouts,
  usePlans,
  useZoneStats,
} from "../lib/queries";
import { ACT_LABELS, fmtDur } from "../lib/time";
import { guideSearchUrl } from "./LayoutsPage";
import type { ZoneLayout, ZoneStat } from "../types/ipc";

export default function BottlenecksPage() {
  const { data: plans } = usePlans();
  const [planId, setPlanId] = useState<number | null>(null);
  const { data: stats } = useZoneStats(planId);
  const { data: layoutDb } = useLayouts();
  const [expanded, setExpanded] = useState<string | null>(null);
  const noteMut = useInvalidatingMutation(
    ({ areaId, noteMd, flagged }: { areaId: string; noteMd: string | null; flagged: boolean }) =>
      setZoneNote(areaId, noteMd, flagged),
    [["zoneStats"], ["zoneNotes"]],
  );

  const layoutsById = useMemo(() => {
    const m = new Map<string, ZoneLayout>();
    for (const z of layoutDb?.zones ?? []) m.set(z.areaId, z);
    return m;
  }, [layoutDb]);

  const flaggedCount = (stats ?? []).filter((s) => s.autoFlag || s.flagged).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Bottlenecks
          {flaggedCount > 0 && (
            <span className="badge bg-accent/15 text-accent ml-2">
              {flaggedCount} flagged
            </span>
          )}
        </h1>
        <select
          className="input w-56"
          value={planId ?? ""}
          onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All runs</option>
          {(plans ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              Plan: {p.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-ink-dim text-sm max-w-3xl">
        Per-zone time across your runs (loads excluded, revisits merged). A
        zone is auto-flagged when its median runs ≥1.4× the typical zone of its
        act, or when its spread (IQR) is large relative to its median — the
        classic “layout RNG” signature. Expand a slow zone to see its layout
        notes and study the full guide.
      </p>

      {!stats?.length ? (
        <div className="panel p-6 text-ink-dim">
          No zone data yet — finish a practice run first.
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Zone</th>
                <th className="th w-20">Act</th>
                <th className="th w-14 text-right">Runs</th>
                <th className="th w-20 text-right">Best</th>
                <th className="th w-20 text-right">Median</th>
                <th className="th w-20 text-right">Last</th>
                <th className="th w-20 text-right">IQR</th>
                <th className="th w-36">Share of act</th>
                <th className="th w-28">Flags</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <Row
                  key={s.areaId}
                  s={s}
                  layout={layoutsById.get(s.areaId)}
                  guideName={layoutDb?.source.name ?? "the guide"}
                  guideBase={layoutDb?.source.url}
                  expanded={expanded === s.areaId}
                  onExpand={() =>
                    setExpanded(expanded === s.areaId ? null : s.areaId)
                  }
                  onSave={(noteMd, flagged) =>
                    noteMut.mutate({ areaId: s.areaId, noteMd, flagged })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  s,
  layout,
  guideName,
  guideBase,
  expanded,
  onExpand,
  onSave,
}: {
  s: ZoneStat;
  layout: ZoneLayout | undefined;
  guideName: string;
  guideBase: string | undefined;
  expanded: boolean;
  onExpand: () => void;
  onSave: (noteMd: string | null, flagged: boolean) => void;
}) {
  const [draft, setDraft] = useState(s.noteMd ?? "");
  const sharePct = Math.round(s.shareOfAct * 100);
  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-panel-2/40 ${
          s.autoFlag || s.flagged ? "bg-accent/5" : ""
        }`}
        onClick={onExpand}
      >
        <td className="td">
          {s.areaName}
          {layout && (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ml-1.5 align-middle ${
                layout.consistency === 3
                  ? "bg-bad"
                  : layout.consistency === 2
                    ? "bg-accent"
                    : "bg-good"
              }`}
              title={`layout notes available (${
                layout.consistency === 3
                  ? "high variance"
                  : layout.consistency === 2
                    ? "rule-based"
                    : "fixed layout"
              })`}
            />
          )}
          {s.noteMd && <span className="text-ink-dim ml-1.5" title={s.noteMd}>✎</span>}
        </td>
        <td className="td text-ink-dim">
          {s.act != null ? ACT_LABELS[s.act] ?? `Act ${s.act}` : "—"}
        </td>
        <td className="td text-right">{s.runsCounted}</td>
        <td className="td text-right tabular-nums text-good">{fmtDur(s.bestMs)}</td>
        <td className="td text-right tabular-nums">{fmtDur(s.medianMs)}</td>
        <td className="td text-right tabular-nums">{fmtDur(s.lastMs)}</td>
        <td className="td text-right tabular-nums text-ink-dim">{fmtDur(s.iqrMs)}</td>
        <td className="td">
          <div className="flex items-center gap-2">
            <div className="h-1.5 rounded bg-panel-2 flex-1 overflow-hidden">
              <div
                className="h-full rounded bg-accent/70"
                style={{ width: `${Math.min(100, sharePct)}%` }}
              />
            </div>
            <span className="text-xs text-ink-dim w-8 text-right">{sharePct}%</span>
          </div>
        </td>
        <td className="td">
          {s.autoFlag && <span className="badge bg-accent/15 text-accent mr-1">auto</span>}
          {s.flagged && <span className="badge bg-bad/15 text-bad">mine</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-panel-2/30">
          <td className="td" colSpan={9}>
            {layout && (
              <div className="py-2 border-b border-line/60 mb-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Layout notes</span>
                  <span className="text-ink-dim">{layout.summary}</span>
                  <span className="flex-1" />
                  <Link
                    className="text-accent hover:underline text-xs shrink-0"
                    to={`/layouts?area=${encodeURIComponent(layout.areaId)}`}
                  >
                    open in Layouts
                  </Link>
                  {guideBase && (
                    <button
                      className="text-accent hover:underline text-xs shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        openUrl(
                          layout.guideUrl ??
                            guideSearchUrl(guideBase, layout.name, layout.act),
                        );
                      }}
                    >
                      {guideName} ↗
                    </button>
                  )}
                </div>
                <ul className="text-sm mt-1.5 space-y-1">
                  {layout.tips.map((t, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-accent shrink-0">›</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 items-start py-1">
              <textarea
                className="input min-h-16 flex-1"
                placeholder="Why is this zone slow for you? What's the plan next time?"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex flex-col gap-2">
                <button
                  className="btn-accent text-xs"
                  onClick={() => onSave(draft.trim() || null, s.flagged)}
                >
                  Save note
                </button>
                <button
                  className="btn text-xs"
                  onClick={() => onSave(draft.trim() || null, !s.flagged)}
                >
                  {s.flagged ? "Unflag" : "Flag as bottleneck"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

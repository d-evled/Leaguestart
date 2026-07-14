import { Link } from "react-router-dom";
import { deleteRun, updateRunMeta } from "../lib/ipc";
import { useInvalidatingMutation, usePlans, useRuns } from "../lib/queries";
import { fmtClock, fmtDur } from "../lib/time";
import type { Run } from "../types/ipc";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-accent/15 text-accent",
  completed: "bg-good/15 text-good",
  abandoned: "bg-panel-2 text-ink-dim",
};

export default function RunsPage() {
  const { data: runs } = useRuns();
  const { data: plans } = usePlans();
  const del = useInvalidatingMutation(deleteRun, [["runs"]]);
  const toggleKind = useInvalidatingMutation(
    (run: Run) =>
      updateRunMeta({
        id: run.id,
        kind: run.kind === "practice" ? "league_start" : "practice",
        label: run.label,
        planId: run.planId,
        notesMd: run.notesMd,
      }),
    [["runs"], ["run"]],
  );
  const planName = (id: number | null) =>
    plans?.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Runs</h1>
      {!runs?.length ? (
        <div className="panel p-6 text-ink-dim">
          No runs yet — start a new character with tracking on and they’ll
          appear here.
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Started</th>
                <th className="th">Kind</th>
                <th className="th">Character</th>
                <th className="th">Plan</th>
                <th className="th">Status</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">No loads</th>
                <th className="th text-right">Deaths</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-panel-2/50">
                  <td className="td">
                    <Link to={`/runs/${r.id}`} className="text-accent hover:underline">
                      {fmtClock(r.startedAt)}
                    </Link>
                    {r.label && <span className="text-ink-dim ml-2">{r.label}</span>}
                  </td>
                  <td className="td">
                    <button
                      className={`badge cursor-pointer ${
                        r.kind === "league_start"
                          ? "bg-accent/15 text-accent"
                          : "bg-panel-2 text-ink-dim"
                      }`}
                      title="Click to toggle practice / league start"
                      onClick={() => toggleKind.mutate(r)}
                    >
                      {r.kind === "league_start" ? "league start" : "practice"}
                    </button>
                  </td>
                  <td className="td">
                    {r.characterName ?? "—"}
                    {r.characterClass && (
                      <span className="text-ink-dim"> ({r.characterClass})</span>
                    )}
                  </td>
                  <td className="td text-ink-dim">{planName(r.planId)}</td>
                  <td className="td">
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="td text-right tabular-nums">{fmtDur(r.totalMs)}</td>
                  <td className="td text-right tabular-nums text-ink-dim">
                    {r.totalMs != null && r.totalLoadMs != null
                      ? fmtDur(r.totalMs - r.totalLoadMs)
                      : "—"}
                  </td>
                  <td className="td text-right">{r.deaths}</td>
                  <td className="td text-right">
                    {r.status !== "active" && (
                      <button
                        className="btn-danger text-xs"
                        onClick={() => {
                          if (confirm("Delete this run and all its data?"))
                            del.mutate(r.id);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

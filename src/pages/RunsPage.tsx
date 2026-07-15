import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createRunGroup,
  deleteRun,
  deleteRunGroup,
  renameRunGroup,
  setRunGroup,
  updateRunMeta,
} from "../lib/ipc";
import {
  useInvalidatingMutation,
  usePlans,
  useRunGroups,
  useRuns,
} from "../lib/queries";
import { fmtClock, fmtDur } from "../lib/time";
import type { RunGroup, RunListEntry } from "../types/ipc";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-accent/15 text-accent",
  completed: "bg-good/15 text-good",
  abandoned: "bg-panel-2 text-ink-dim",
};

type SortKey = "name" | "started" | "time" | "avgAct" | "deaths";
type SortDir = "asc" | "desc";

/** First-click direction per column. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  started: "desc",
  time: "asc", // fastest first
  avgAct: "asc",
  deaths: "desc",
};

/** Display name: user label first, character second. */
const runName = (r: RunListEntry) => r.label || r.characterName || "";

/** Run time with pauses removed (null while the run is still active). */
const netMs = (r: RunListEntry) =>
  r.totalMs != null ? r.totalMs - r.pausedMs : null;

const avgActMs = (r: RunListEntry) => {
  const net = netMs(r);
  return net != null && r.actsSeen > 0 ? net / r.actsSeen : null;
};

/** Null-last comparison of a nullable metric. */
function cmpNullable(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function sortRuns(runs: RunListEntry[], key: SortKey, dir: SortDir) {
  const sorted = [...runs].sort((a, b) => {
    let cmp: number;
    switch (key) {
      case "name":
        cmp =
          (runName(a) || "￿").localeCompare(runName(b) || "￿", undefined, {
            sensitivity: "base",
          }) || a.startedAt - b.startedAt;
        break;
      case "started":
        cmp = a.startedAt - b.startedAt;
        break;
      case "time":
        cmp = cmpNullable(netMs(a), netMs(b));
        break;
      case "avgAct":
        cmp = cmpNullable(avgActMs(a), avgActMs(b));
        break;
      case "deaths":
        cmp = a.deaths - b.deaths;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  // Null metrics always trail, regardless of direction.
  if (key === "time" || key === "avgAct") {
    const metric = key === "time" ? netMs : avgActMs;
    sorted.sort((a, b) => Number(metric(a) == null) - Number(metric(b) == null));
  }
  return sorted;
}

export default function RunsPage() {
  const { data: runs } = useRuns();
  const { data: plans } = usePlans();
  const { data: groups } = useRunGroups();

  const [sortKey, setSortKey] = useState<SortKey>("started");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<"all" | "none" | number>("all");

  const invalidate = [["runs"], ["run"], ["runGroups"]];
  const del = useInvalidatingMutation(deleteRun, [["runs"]]);
  const save = useInvalidatingMutation(updateRunMeta, [["runs"], ["run"]]);
  const assign = useInvalidatingMutation(
    ({ id, groupId }: { id: number; groupId: number | null }) =>
      setRunGroup(id, groupId),
    invalidate,
  );
  const createGroup = useInvalidatingMutation(createRunGroup, invalidate);
  const renameGroup = useInvalidatingMutation(
    ({ id, name }: { id: number; name: string }) => renameRunGroup(id, name),
    invalidate,
  );
  const removeGroup = useInvalidatingMutation(deleteRunGroup, invalidate);

  const toggleKind = useInvalidatingMutation(
    (run: RunListEntry) =>
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

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const onNewGroup = () => {
    const name = prompt("New group name:")?.trim();
    if (name) createGroup.mutate(name);
  };
  const onRenameGroup = (g: RunGroup) => {
    const name = prompt("Rename group:", g.name)?.trim();
    if (name && name !== g.name) renameGroup.mutate({ id: g.id, name });
  };
  const onDeleteGroup = (g: RunGroup) => {
    if (
      confirm(`Delete group "${g.name}"? Its runs are kept and become ungrouped.`)
    ) {
      removeGroup.mutate(g.id);
      setFilter("all");
    }
  };

  // Group filter -> ordered sections of sorted runs.
  const sections = useMemo(() => {
    const all = sortRuns(runs ?? [], sortKey, sortDir);
    const byGroup = (gid: number | null) => all.filter((r) => r.groupId === gid);
    if (filter === "none") return [{ group: null, runs: byGroup(null) }];
    if (filter !== "all") {
      const g = groups?.find((g) => g.id === filter);
      return g ? [{ group: g, runs: byGroup(g.id) }] : [];
    }
    const out: { group: RunGroup | null; runs: RunListEntry[] }[] = (
      groups ?? []
    ).map((g) => ({ group: g, runs: byGroup(g.id) }));
    const ungrouped = byGroup(null);
    // Plain list while no groups exist; otherwise ungrouped runs trail.
    if (out.length === 0 || ungrouped.length > 0)
      out.push({ group: null, runs: ungrouped });
    return out;
  }, [runs, groups, filter, sortKey, sortDir]);

  const selectedGroup =
    typeof filter === "number" ? groups?.find((g) => g.id === filter) : undefined;
  const showSectionHeaders = filter === "all" && (groups?.length ?? 0) > 0;

  const Th = ({
    label,
    k,
    right,
    title,
  }: {
    label: string;
    k?: SortKey;
    right?: boolean;
    title?: string;
  }) => (
    <th className={`th ${right ? "text-right" : ""}`} title={title}>
      {k ? (
        <button
          className="cursor-pointer hover:text-ink inline-flex items-center gap-1"
          onClick={() => onSort(k)}
        >
          {label}
          {sortKey === k && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Runs</h1>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto"
            value={typeof filter === "number" ? String(filter) : filter}
            onChange={(e) => {
              const v = e.target.value;
              setFilter(v === "all" || v === "none" ? v : Number(v));
            }}
          >
            <option value="all">All groups</option>
            <option value="none">Ungrouped</option>
            {(groups ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {selectedGroup && (
            <>
              <button className="btn text-xs" onClick={() => onRenameGroup(selectedGroup)}>
                Rename group
              </button>
              <button className="btn-danger text-xs" onClick={() => onDeleteGroup(selectedGroup)}>
                Delete group
              </button>
            </>
          )}
          <button className="btn text-xs" onClick={onNewGroup}>
            + New group
          </button>
        </div>
      </div>
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
                <Th label="Name" k="name" />
                <Th label="Started" k="started" />
                <Th label="Kind" />
                <Th label="Group" />
                <Th label="Plan" />
                <Th label="Status" />
                <Th label="Time" k="time" right title="Run time with pauses removed" />
                <Th
                  label="Avg/act"
                  k="avgAct"
                  right
                  title="Time (pauses removed) per campaign act reached"
                />
                <Th label="Deaths" k="deaths" right />
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {sections.map(({ group, runs: rows }, si) => (
                <Section
                  key={group?.id ?? `none-${si}`}
                  group={group}
                  rows={rows}
                  showHeader={showSectionHeaders}
                  groups={groups ?? []}
                  planName={planName}
                  onToggleKind={(r) => toggleKind.mutate(r)}
                  onRename={(r, label) =>
                    save.mutate({
                      id: r.id,
                      kind: r.kind,
                      label,
                      planId: r.planId,
                      notesMd: r.notesMd,
                    })
                  }
                  onAssign={(r, groupId) => assign.mutate({ id: r.id, groupId })}
                  onDelete={(r) => {
                    if (confirm("Delete this run and all its data?")) del.mutate(r.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Section({
  group,
  rows,
  showHeader,
  groups,
  planName,
  onToggleKind,
  onRename,
  onAssign,
  onDelete,
}: {
  group: RunGroup | null;
  rows: RunListEntry[];
  showHeader: boolean;
  groups: RunGroup[];
  planName: (id: number | null) => string;
  onToggleKind: (r: RunListEntry) => void;
  onRename: (r: RunListEntry, label: string | null) => void;
  onAssign: (r: RunListEntry, groupId: number | null) => void;
  onDelete: (r: RunListEntry) => void;
}) {
  return (
    <>
      {showHeader && (
        <tr className="bg-panel-2/60">
          <td className="td font-medium text-ink-dim" colSpan={10}>
            {group ? group.name : "Ungrouped"}
            <span className="ml-2 text-xs">
              {rows.length} run{rows.length === 1 ? "" : "s"}
            </span>
          </td>
        </tr>
      )}
      {rows.length === 0 && showHeader && (
        <tr>
          <td className="td text-ink-dim text-xs" colSpan={10}>
            No runs in this group yet — assign one with the Group dropdown.
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <RunRow
          key={r.id}
          r={r}
          groups={groups}
          planName={planName}
          onToggleKind={onToggleKind}
          onRename={onRename}
          onAssign={onAssign}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

function RunRow({
  r,
  groups,
  planName,
  onToggleKind,
  onRename,
  onAssign,
  onDelete,
}: {
  r: RunListEntry;
  groups: RunGroup[];
  planName: (id: number | null) => string;
  onToggleKind: (r: RunListEntry) => void;
  onRename: (r: RunListEntry, label: string | null) => void;
  onAssign: (r: RunListEntry, groupId: number | null) => void;
  onDelete: (r: RunListEntry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const commit = (value: string) => {
    setEditing(false);
    const label = value.trim() || null;
    if (label !== r.label) onRename(r, label);
  };
  const net = netMs(r);
  const avg = avgActMs(r);

  return (
    <tr className="hover:bg-panel-2/50 group">
      <td className="td">
        {editing ? (
          <input
            className="input py-0.5"
            autoFocus
            defaultValue={r.label ?? ""}
            placeholder={r.characterName ?? "Run name"}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value);
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <>
            <Link to={`/runs/${r.id}`} className="text-accent hover:underline">
              {runName(r) || fmtClock(r.startedAt)}
            </Link>
            {r.label && r.characterName && (
              <span className="text-ink-dim ml-2">{r.characterName}</span>
            )}
            {r.characterClass && (
              <span className="text-ink-dim"> ({r.characterClass})</span>
            )}
            <button
              className="ml-2 text-ink-dim opacity-0 group-hover:opacity-100 cursor-pointer hover:text-ink"
              title="Rename run"
              onClick={() => setEditing(true)}
            >
              ✎
            </button>
          </>
        )}
      </td>
      <td className="td text-ink-dim whitespace-nowrap">{fmtClock(r.startedAt)}</td>
      <td className="td">
        <button
          className={`badge cursor-pointer ${
            r.kind === "league_start"
              ? "bg-accent/15 text-accent"
              : "bg-panel-2 text-ink-dim"
          }`}
          title="Click to toggle practice / league start"
          onClick={() => onToggleKind(r)}
        >
          {r.kind === "league_start" ? "league start" : "practice"}
        </button>
      </td>
      <td className="td">
        <select
          className="input py-0.5 w-auto max-w-32 text-xs"
          value={r.groupId ?? ""}
          onChange={(e) =>
            onAssign(r, e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">—</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </td>
      <td className="td text-ink-dim">{planName(r.planId)}</td>
      <td className="td">
        <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
      </td>
      <td className="td text-right tabular-nums">
        {fmtDur(net)}
        {r.pausedMs > 0 && (
          <span
            className="text-ink-dim text-xs ml-1"
            title={`${fmtDur(r.pausedMs)} paused (wall clock ${fmtDur(r.totalMs)})`}
          >
            ⏸
          </span>
        )}
      </td>
      <td className="td text-right tabular-nums text-ink-dim">{fmtDur(avg)}</td>
      <td className="td text-right">{r.deaths}</td>
      <td className="td text-right">
        {r.status !== "active" && (
          <button className="btn-danger text-xs" onClick={() => onDelete(r)}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

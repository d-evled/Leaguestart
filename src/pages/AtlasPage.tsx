import { useEffect, useMemo, useState } from "react";
import {
  createProgression,
  deleteProgression,
  setMilestoneStatus,
  setProgressionActive,
  toggleVoidstone,
} from "../lib/ipc";
import {
  useInvalidatingMutation,
  useProgressionDetail,
  useProgressions,
} from "../lib/queries";
import { fmtClock, fmtDur } from "../lib/time";
import { MultiLine } from "../components/charts";
import type { TierMilestone } from "../types/ipc";

const STONES: { key: string; name: string; source: string }[] = [
  { key: "omniscient", name: "Omniscient", source: "The Maven" },
  { key: "decayed", name: "Decayed", source: "Shaper & Elder" },
  { key: "grasping", name: "Grasping", source: "Eater of Worlds" },
  { key: "ceremonial", name: "Ceremonial", source: "Searing Exarch" },
];

export default function AtlasPage() {
  const { data: progressions } = useProgressions();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId == null && progressions?.length) {
      setSelectedId(progressions.find((p) => p.active)?.id ?? progressions[0].id);
    }
  }, [progressions, selectedId]);

  const { data: detail } = useProgressionDetail(selectedId);
  const createMut = useInvalidatingMutation(
    (label: string) => createProgression(label),
    [["progressions"]],
  );
  const activeMut = useInvalidatingMutation(
    ({ id, active }: { id: number; active: boolean }) =>
      setProgressionActive(id, active),
    [["progressions"], ["progression"]],
  );
  const deleteMut = useInvalidatingMutation(deleteProgression, [
    ["progressions"],
    ["progression"],
  ]);
  const milestoneMut = useInvalidatingMutation(
    ({ id, status }: { id: number; status: string }) => setMilestoneStatus(id, status),
    [["progression"]],
  );
  const stoneMut = useInvalidatingMutation(
    ({ id, stone }: { id: number; stone: string }) => toggleVoidstone(id, stone),
    [["progression"]],
  );

  const byTier = useMemo(() => {
    const m = new Map<number, TierMilestone>();
    for (const ms of detail?.milestones ?? []) m.set(ms.tier, ms);
    return m;
  }, [detail]);

  const chartData = useMemo(
    () =>
      (detail?.milestones ?? [])
        .filter((m) => m.status === "completed")
        .map((m) => ({
          tier: m.tier,
          hours: m.elapsedMs != null ? m.elapsedMs / 3_600_000 : null,
          level: m.charLevel,
        })),
    [detail],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Atlas progression</h1>
        <div className="flex gap-2 items-center">
          <select
            className="input w-64"
            value={selectedId ?? ""}
            onChange={(e) =>
              setSelectedId(e.target.value ? Number(e.target.value) : null)
            }
          >
            {(progressions ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.active ? " ●" : ""}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => {
              const label = prompt("Progression label", "My atlas run");
              if (label) createMut.mutate(label);
            }}
          >
            + New
          </button>
        </div>
      </div>

      {!detail ? (
        <div className="panel p-6 text-ink-dim">
          <p>
            No atlas progression yet. One is created automatically when a{" "}
            <span className="text-ink">league start</span> run finishes the
            campaign — or create one manually to start recording tier
            milestones from your current character.
          </p>
          <p className="mt-2">
            While a progression is active, entering a map of a new tier records
            a milestone with your character level and elapsed time; leaving it
            alive marks the tier completed.
          </p>
        </div>
      ) : (
        <>
          <div className="panel p-4 flex items-center gap-4 text-sm">
            <div>
              <span className="label">Character</span>
              {detail.progression.characterName ?? "—"}
            </div>
            <div>
              <span className="label">Anchored at</span>
              {fmtClock(detail.progression.startedAt)}
            </div>
            <span className="flex-1" />
            <button
              className={detail.progression.active ? "btn-accent" : "btn"}
              onClick={() =>
                activeMut.mutate({
                  id: detail.progression.id,
                  active: !detail.progression.active,
                })
              }
            >
              {detail.progression.active ? "Tracking (click to pause)" : "Resume tracking"}
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm("Delete this progression and its milestones?")) {
                  deleteMut.mutate(detail.progression.id);
                  setSelectedId(null);
                }
              }}
            >
              Delete
            </button>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((tier) => (
              <TierCell
                key={tier}
                tier={tier}
                m={byTier.get(tier) ?? null}
                onStatus={(id, status) => milestoneMut.mutate({ id, status })}
              />
            ))}
          </div>

          <div className="grid md:grid-cols-4 gap-2">
            {STONES.map((s) => {
              const owned = detail.voidstones.find((v) => v.stone === s.key);
              return (
                <button
                  key={s.key}
                  className={`panel p-3 text-left transition-colors ${
                    owned ? "border-accent/70" : "hover:border-line/80 opacity-80"
                  }`}
                  onClick={() =>
                    stoneMut.mutate({ id: detail.progression.id, stone: s.key })
                  }
                  title={owned ? "Click to un-record" : "Click when you earn it"}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        owned ? "bg-accent" : "bg-line"
                      }`}
                    />
                    <span className="font-medium">{s.name} Voidstone</span>
                  </div>
                  <div className="text-xs text-ink-dim mt-1">{s.source}</div>
                  {owned && (
                    <div className="text-xs mt-1.5 tabular-nums">
                      {fmtDur(owned.elapsedMs)} in
                      {owned.charLevel != null && ` · lvl ${owned.charLevel}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {chartData.length >= 2 && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="panel p-4">
                <h3 className="font-medium mb-2 text-sm">
                  Time to first completion by tier
                </h3>
                <MultiLine
                  data={chartData}
                  series={[{ key: "hours", label: "elapsed" }]}
                  xKey="tier"
                  height={220}
                  yTickFormatter={(v) => `${v.toFixed(0)}h`}
                  valueFormatter={(v) => fmtDur(v * 3_600_000)}
                  labelFormatter={(v) => `Tier ${v}`}
                />
              </div>
              <div className="panel p-4">
                <h3 className="font-medium mb-2 text-sm">Character level at tier</h3>
                <MultiLine
                  data={chartData}
                  series={[{ key: "level", label: "level" }]}
                  xKey="tier"
                  height={220}
                  valueFormatter={(v) => `level ${v}`}
                  labelFormatter={(v) => `Tier ${v}`}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TierCell({
  tier,
  m,
  onStatus,
}: {
  tier: number;
  m: TierMilestone | null;
  onStatus: (id: number, status: string) => void;
}) {
  const cls =
    m?.status === "completed"
      ? "border-good/60"
      : m?.status === "candidate"
        ? "border-accent/60"
        : "border-line opacity-70";
  return (
    <div className={`panel p-2.5 ${cls}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">T{tier}</span>
        {m?.status === "completed" && <span className="text-good text-xs">✓</span>}
        {m?.status === "candidate" && (
          <span className="text-accent text-xs">{m.diedInMap ? "died" : "?"}</span>
        )}
      </div>
      {m ? (
        <div className="mt-1 text-[11px] leading-4 text-ink-dim">
          <div className="truncate text-ink">{m.mapName ?? "—"}</div>
          {m.charLevel != null && <div>lvl {m.charLevel}</div>}
          <div className="tabular-nums">{fmtDur(m.elapsedMs)}</div>
          {m.status === "candidate" && (
            <div className="flex gap-1 mt-1">
              <button
                className="btn text-[10px] px-1.5 py-0.5"
                onClick={() => onStatus(m.id, "completed")}
              >
                ✓ done
              </button>
              <button
                className="btn text-[10px] px-1.5 py-0.5"
                onClick={() => onStatus(m.id, "dismissed")}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-ink-dim">not reached</div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  deleteCheckpoint,
  deleteLink,
  deletePlan,
  importPob,
  reorderCheckpoints,
  upsertCheckpoint,
  upsertLink,
  upsertPlan,
} from "../lib/ipc";
import {
  useCheckpoints,
  useInvalidatingMutation,
  useLinks,
  usePlans,
  useSettings,
  useSetSetting,
} from "../lib/queries";
import { ASCENDANCIES, CLASSES, LEAGUE_PRESETS } from "../lib/poe";
import type { GuideLink, PobImport } from "../types/ipc";

const LINK_KINDS = ["maxroll", "youtube", "forum", "other"] as const;

export default function PlanPage() {
  const { data: plans } = usePlans();
  const { data: settings } = useSettings();
  const setSetting = useSetSetting();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const activePlanId = (settings?.["active_plan_id"] as number | null) ?? null;
  useEffect(() => {
    if (selectedId == null && plans?.length) {
      setSelectedId(activePlanId ?? plans[0].id);
    }
  }, [plans, activePlanId, selectedId]);

  const plan = plans?.find((p) => p.id === selectedId) ?? null;
  const savePlan = useInvalidatingMutation(upsertPlan, [["plans"]]);
  const removePlan = useInvalidatingMutation(deletePlan, [["plans"]]);

  const applyImport = (r: PobImport) => {
    if (!plan || !r.class) return;
    savePlan.mutate({
      ...planInput(plan),
      class: r.class,
      ascendancy: r.ascendancy,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Plan</h1>
        <div className="flex gap-2 items-center">
          <select
            className="input w-56"
            value={selectedId ?? ""}
            onChange={(e) =>
              setSelectedId(e.target.value ? Number(e.target.value) : null)
            }
          >
            {(plans ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === activePlanId ? " ●" : ""}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={async () => {
              const created = await upsertPlan({ name: "New plan" });
              setSelectedId(created.id);
              savePlan.mutate({ id: created.id, name: "New plan" }); // refresh list
            }}
          >
            + New
          </button>
        </div>
      </div>

      {!plan ? (
        <div className="panel p-6 text-ink-dim">
          Create a plan to aggregate your league starter: build info, PoB
          progression checkpoints, and guide links.
        </div>
      ) : (
        <>
          <section className="panel p-4 space-y-3">
            <div className="grid md:grid-cols-5 gap-3">
              <Field
                label="Plan name"
                value={plan.name}
                onSave={(v) => savePlan.mutate({ ...planInput(plan), name: v || plan.name })}
              />
              <LeagueSelect
                value={plan.leagueName}
                onSave={(v) => savePlan.mutate({ ...planInput(plan), leagueName: v })}
              />
              <Field
                label="Build"
                value={plan.buildName ?? ""}
                placeholder="e.g. RF Chieftain"
                onSave={(v) => savePlan.mutate({ ...planInput(plan), buildName: v || null })}
              />
              <SelectField
                label="Class"
                value={plan.class}
                options={[...CLASSES]}
                onChange={(v) => {
                  const keepAsc =
                    v != null &&
                    plan.ascendancy != null &&
                    (ASCENDANCIES[v] ?? []).includes(plan.ascendancy);
                  savePlan.mutate({
                    ...planInput(plan),
                    class: v,
                    ascendancy: keepAsc ? plan.ascendancy : null,
                  });
                }}
              />
              <SelectField
                label="Ascendancy"
                value={plan.ascendancy}
                options={plan.class ? (ASCENDANCIES[plan.class] ?? []) : []}
                disabled={!plan.class}
                placeholder={plan.class ? "—" : "pick a class first"}
                onChange={(v) => savePlan.mutate({ ...planInput(plan), ascendancy: v })}
              />
            </div>
            <PobImportBox onApply={applyImport} />
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input min-h-20"
                defaultValue={plan.notesMd ?? ""}
                placeholder="Gearing priorities, league mechanic plan, day-1 currency strategy…"
                onBlur={(e) =>
                  savePlan.mutate({ ...planInput(plan), notesMd: e.target.value || null })
                }
              />
            </div>
            <div className="flex gap-2">
              {plan.id !== activePlanId ? (
                <button
                  className="btn-accent"
                  onClick={() => setSetting.mutate({ key: "active_plan_id", value: plan.id })}
                >
                  Set as active plan
                </button>
              ) : (
                <span className="badge bg-accent/15 text-accent self-center">
                  active plan — new runs attach here
                </span>
              )}
              <button
                className="btn-danger ml-auto"
                onClick={() => {
                  if (confirm(`Delete plan "${plan.name}" (checkpoints and links included)?`)) {
                    removePlan.mutate(plan.id);
                    setSelectedId(null);
                  }
                }}
              >
                Delete plan
              </button>
            </div>
          </section>

          <Checkpoints
            planId={plan.id}
            onDecoded={(r) => {
              // A decoded checkpoint fills the plan's class/ascendancy if
              // they're still empty — never overwrites a manual choice.
              if (!plan.class && r.class) applyImport(r);
            }}
          />
          <Links planId={plan.id} />
        </>
      )}
    </div>
  );
}

function planInput(p: {
  id: number;
  name: string;
  leagueName: string | null;
  buildName: string | null;
  class: string | null;
  ascendancy: string | null;
  notesMd: string | null;
}) {
  return {
    id: p.id,
    name: p.name,
    leagueName: p.leagueName,
    buildName: p.buildName,
    class: p.class,
    ascendancy: p.ascendancy,
    notesMd: p.notesMd,
  };
}

function Field({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== value) onSave(e.target.value.trim());
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "—",
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  // Keep a value that's not in the list (legacy ascendancy names, imports
  // from future patches) selectable instead of silently dropping it.
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div>
      <label className="label">{label}</label>
      <select
        className="input"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

const CUSTOM = "__custom";

function LeagueSelect({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const presets =
    value && !LEAGUE_PRESETS.includes(value)
      ? [value, ...LEAGUE_PRESETS]
      : LEAGUE_PRESETS;
  if (customMode) {
    return (
      <div>
        <label className="label">League</label>
        <input
          className="input"
          autoFocus
          defaultValue={value ?? ""}
          placeholder="e.g. Mercenaries HC"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setCustomMode(false);
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onSave(v);
            setCustomMode(false);
          }}
        />
      </div>
    );
  }
  return (
    <div>
      <label className="label">League</label>
      <select
        className="input"
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === CUSTOM) setCustomMode(true);
          else onSave(e.target.value || null);
        }}
      >
        <option value="">—</option>
        {presets.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
        <option value={CUSTOM}>Custom… (challenge league)</option>
      </select>
    </div>
  );
}

type ImportState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; msg: string }
  | { kind: "error"; msg: string };

function PobImportBox({ onApply }: { onApply: (r: PobImport) => void }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<ImportState>({ kind: "idle" });

  const run = async (text: string) => {
    const input = text.trim();
    if (!input) return;
    setState({ kind: "busy" });
    try {
      const r = await importPob(input);
      if (!r.class) {
        setState({ kind: "error", msg: "Decoded the build, but it has no class set." });
        return;
      }
      onApply(r);
      setState({
        kind: "done",
        msg: `Detected ${r.class}${r.ascendancy ? ` · ${r.ascendancy}` : ""}${
          r.level ? ` · level ${r.level}` : ""
        } — class & ascendancy filled. (League isn't stored in PoB.)`,
      });
    } catch (e) {
      setState({ kind: "error", msg: String(e) });
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input font-mono text-xs"
          placeholder="Auto-fill from PoB: paste an import code or a pastebin.com / pobb.in link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!text.trim()) return;
            e.preventDefault();
            setValue(text);
            run(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(value);
          }}
        />
        <button
          className="btn shrink-0"
          disabled={!value.trim() || state.kind === "busy"}
          onClick={() => run(value)}
        >
          {state.kind === "busy" ? "Importing…" : "Import"}
        </button>
      </div>
      {state.kind === "done" && <p className="text-good text-xs mt-1">✓ {state.msg}</p>}
      {state.kind === "error" && <p className="text-bad text-xs mt-1">✗ {state.msg}</p>}
    </div>
  );
}

function Checkpoints({
  planId,
  onDecoded,
}: {
  planId: number;
  onDecoded: (r: PobImport) => void;
}) {
  const { data: checkpoints } = useCheckpoints(planId);
  const save = useInvalidatingMutation(upsertCheckpoint, [["checkpoints"]]);
  const remove = useInvalidatingMutation(deleteCheckpoint, [["checkpoints"]]);
  const reorder = useInvalidatingMutation(reorderCheckpoints, [["checkpoints"]]);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    if (!checkpoints) return;
    const ids = checkpoints.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <section className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">
          PoB progression checkpoints
          <span className="text-ink-dim text-sm ml-2">
            Path of Building snapshots for each stage (Act 5, maps, endgame…)
          </span>
        </h2>
        <button className="btn" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add checkpoint"}
        </button>
      </div>

      {adding && (
        <CheckpointForm
          onSubmit={(v, decoded) => {
            save.mutate({ planId, ...v });
            if (decoded) onDecoded(decoded);
            setAdding(false);
          }}
        />
      )}

      {!checkpoints?.length && !adding && (
        <p className="text-ink-dim text-sm">
          Paste PoB import codes and/or pobb.in links from your build guide, in
          the order you’ll use them while leveling.
        </p>
      )}

      <div className="space-y-2">
        {(checkpoints ?? []).map((c, i) => (
          <div key={c.id} className="border border-line rounded-md p-3 bg-panel-2/40">
            <div className="flex items-center gap-2">
              <span className="badge bg-panel-2 text-ink-dim">{i + 1}</span>
              <span className="font-medium">{c.label}</span>
              {c.decodedClass && (
                <span className="badge bg-panel-2 text-ink-dim">
                  {c.decodedClass}
                  {c.decodedAscendancy ? ` · ${c.decodedAscendancy}` : ""}
                  {c.decodedLevel ? ` · lvl ${c.decodedLevel}` : ""}
                </span>
              )}
              {c.url && (
                <button
                  className="text-accent hover:underline text-sm"
                  onClick={() => openUrl(c.url!)}
                >
                  open link ↗
                </button>
              )}
              {c.pobCode && (
                <button
                  className="btn text-xs"
                  onClick={async () => {
                    await navigator.clipboard.writeText(c.pobCode!);
                    setCopied(c.id);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === c.id ? "copied!" : "copy PoB code"}
                </button>
              )}
              <span className="flex-1" />
              <button className="btn text-xs" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button
                className="btn text-xs"
                onClick={() => move(i, 1)}
                disabled={i === (checkpoints?.length ?? 0) - 1}
              >
                ↓
              </button>
              <button
                className="btn-danger text-xs"
                onClick={() => remove.mutate(c.id)}
              >
                ✕
              </button>
            </div>
            {c.notes && <p className="text-ink-dim text-sm mt-1.5">{c.notes}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function CheckpointForm({
  onSubmit,
}: {
  onSubmit: (
    v: {
      label: string;
      pobCode: string | null;
      url: string | null;
      notes: string | null;
      decodedClass: string | null;
      decodedAscendancy: string | null;
      decodedLevel: number | null;
    },
    decoded: PobImport | null,
  ) => void;
}) {
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    // Best-effort decode of the code (or link) so the card can show
    // class/ascendancy/level; the checkpoint saves fine without it.
    let decoded: PobImport | null = null;
    const source = code.trim() || url.trim();
    if (source) {
      try {
        decoded = await importPob(source);
      } catch {
        decoded = null;
      }
    }
    onSubmit(
      {
        label: label.trim(),
        pobCode: code.trim() || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
        decodedClass: decoded?.class ?? null,
        decodedAscendancy: decoded?.ascendancy ?? null,
        decodedLevel: decoded?.level ?? null,
      },
      decoded,
    );
    setBusy(false);
  };

  return (
    <div className="border border-line rounded-md p-3 grid gap-2">
      <div className="grid md:grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="Label (e.g. End of Act 5)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder="Link (pobb.in / Maxroll planner) — optional"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <textarea
        className="input font-mono text-xs min-h-16"
        placeholder="PoB import code — optional"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        className="input"
        placeholder="Notes (gem swaps, gear goals at this point…) — optional"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div>
        <button
          className="btn-accent"
          disabled={busy || !label.trim() || (!code.trim() && !url.trim())}
          onClick={add}
        >
          {busy ? "Adding…" : "Add checkpoint"}
        </button>
      </div>
    </div>
  );
}

function Links({ planId }: { planId: number }) {
  const { data: links } = useLinks(planId);
  const save = useInvalidatingMutation(upsertLink, [["links"]]);
  const remove = useInvalidatingMutation(deleteLink, [["links"]]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<string>("maxroll");

  const grouped = LINK_KINDS.map((k) => ({
    kind: k,
    items: (links ?? []).filter((l) => l.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Guide links</h2>
        <button className="btn" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add link"}
        </button>
      </div>
      {adding && (
        <div className="border border-line rounded-md p-3 grid md:grid-cols-4 gap-2">
          <input
            className="input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input md:col-span-2"
            placeholder="https://maxroll.gg/poe/build-guides/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              className="btn-accent shrink-0"
              disabled={!title.trim() || !url.trim()}
              onClick={() => {
                save.mutate({ planId, title: title.trim(), url: url.trim(), kind });
                setTitle("");
                setUrl("");
                setAdding(false);
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
      {!grouped.length && !adding && (
        <p className="text-ink-dim text-sm">
          Collect the build guide, leveling guide videos, and forum threads for
          this starter in one place.
        </p>
      )}
      {grouped.map((g) => (
        <div key={g.kind}>
          <div className="label">{g.kind}</div>
          <ul className="space-y-1">
            {g.items.map((l: GuideLink) => (
              <li key={l.id} className="flex items-center gap-2">
                <button
                  className="text-accent hover:underline text-sm"
                  onClick={() => openUrl(l.url)}
                >
                  {l.title} ↗
                </button>
                <span className="text-ink-dim text-xs truncate flex-1">{l.url}</span>
                <button className="btn-danger text-xs" onClick={() => remove.mutate(l.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

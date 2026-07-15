import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkForUpdate, recentParsedEvents, validateLogPath } from "../lib/ipc";
import { usePlans, useSettings, useSetSetting } from "../lib/queries";
import { useTrackerStore } from "../stores/trackerStore";
import { fmtAgo } from "../lib/time";
import type { LogPathValidation, UpdateInfo } from "../types/ipc";

export default function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: plans } = usePlans();
  const setSetting = useSetSetting();
  const status = useTrackerStore((s) => s.status);

  const [logPath, setLogPath] = useState("");
  const [character, setCharacter] = useState("");
  const [validation, setValidation] = useState<LogPathValidation | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const persistedPath = (settings?.["client_log_path"] as string) ?? "";
  useEffect(() => {
    if (settings) {
      setLogPath((settings["client_log_path"] as string) ?? "");
      setCharacter((settings["active_character"] as string) ?? "");
    }
  }, [settings]);

  const goal =
    ((settings?.["run_goal"] as { type?: string } | undefined)?.type as string) ??
    "first_map";
  const runKind = (settings?.["default_run_kind"] as string) ?? "practice";
  const activePlanId = (settings?.["active_plan_id"] as number | null) ?? null;
  const updateCheckEnabled =
    (settings?.["update_check_enabled"] as boolean | null) ?? true;

  const dirty = logPath.trim() !== persistedPath;

  const saveLogPath = async () => {
    const path = logPath.trim();
    setSetting.mutate({ key: "client_log_path", value: path || null });
    setValidation(path ? await validateLogPath(path) : null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const browse = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Client.txt", extensions: ["txt"] }],
    });
    if (typeof picked === "string") {
      setLogPath(picked);
      setValidation(null);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="panel p-5 space-y-3">
        <h2 className="font-medium">Game log (Client.txt)</h2>
        <p className="text-ink-dim text-sm">
          The tracker only ever <em>reads</em> this file — usually{" "}
          <code className="text-xs">
            …\Steam\steamapps\common\Path of Exile\logs\Client.txt
          </code>
          . In-game <strong>local chat must be enabled</strong> or zone changes
          don’t get logged.
        </p>
        <div className="flex gap-2">
          <input
            className="input font-mono text-xs"
            value={logPath}
            placeholder="C:\...\Path of Exile\logs\Client.txt"
            onChange={(e) => {
              setLogPath(e.target.value);
              setValidation(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLogPath();
            }}
          />
          <button className="btn shrink-0" onClick={browse}>
            Browse…
          </button>
          <button
            className={`shrink-0 ${dirty ? "btn-accent" : "btn"}`}
            onClick={saveLogPath}
            disabled={!dirty && !logPath.trim()}
          >
            {justSaved ? "✓ Saved" : "Save"}
          </button>
        </div>
        {dirty && (
          <p className="text-xs text-accent">
            Path changed — click Save to apply it to the tracker.
          </p>
        )}
        {validation && (
          <div className="text-sm">
            {validation.exists ? (
              <ul className="space-y-0.5">
                <li className="text-good">
                  ✓ Saved — file exists ({(validation.size / 1024 / 1024).toFixed(1)} MB),
                  last written {fmtAgo(validation.modifiedAgoMs)}
                </li>
                <li className={validation.sampleEvents > 0 ? "text-good" : "text-accent"}>
                  {validation.sampleEvents > 0
                    ? `✓ ${validation.sampleEvents} trackable events in the recent log`
                    : "⚠ No trackable events found recently — is this the right file, and is local chat on?"}
                </li>
              </ul>
            ) : (
              <span className="text-bad">
                ✗ Saved, but no file exists at this path yet — the tracker will
                pick it up when it appears.
              </span>
            )}
          </div>
        )}
        <div className="text-xs text-ink-dim">
          Tracker: {status?.state ?? "—"}
          {status?.lastEventAt != null &&
            ` · last event ${fmtAgo(Date.now() - status.lastEventAt)}`}
        </div>
      </section>

      <section className="panel p-5 space-y-4">
        <h2 className="font-medium">Tracking behavior</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Character filter (optional)</label>
            <input
              className="input"
              value={character}
              placeholder="Only track this character name"
              onChange={(e) => setCharacter(e.target.value)}
              onBlur={(e) =>
                setSetting.mutate({
                  key: "active_character",
                  value: e.target.value.trim() || null,
                })
              }
            />
            <p className="text-xs text-ink-dim mt-1">
              Ignores level-ups/deaths from mules or party members sharing the log.
            </p>
          </div>
          <div>
            <label className="label">Run ends when</label>
            <select
              className="input"
              value={goal}
              onChange={(e) =>
                setSetting.mutate({
                  key: "run_goal",
                  value: { type: e.target.value },
                })
              }
            >
              <option value="first_map">Entering the first map</option>
              <option value="complete_act10">Reaching Karui Shores (Act 10 done)</option>
              <option value="manual">Manually (I’ll click Finish)</option>
            </select>
          </div>
          <div>
            <label className="label">New runs count as</label>
            <select
              className="input"
              value={runKind}
              onChange={(e) =>
                setSetting.mutate({ key: "default_run_kind", value: e.target.value })
              }
            >
              <option value="practice">Practice</option>
              <option value="league_start">League start (starts atlas tracking on finish)</option>
            </select>
          </div>
          <div>
            <label className="label">Active plan (stamped on new runs)</label>
            <select
              className="input"
              value={activePlanId ?? ""}
              onChange={(e) =>
                setSetting.mutate({
                  key: "active_plan_id",
                  value: e.target.value ? Number(e.target.value) : null,
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
        </div>
      </section>

      <UpdatesSection
        enabled={updateCheckEnabled}
        onToggle={(v) => setSetting.mutate({ key: "update_check_enabled", value: v })}
      />

      <DebugPanel />

      <p className="text-xs text-ink-dim">
        Leaguestart is a fan-made tool, not affiliated with or endorsed by
        Grinding Gear Games. It never modifies the game, reads its memory, or
        sends input — it only reads Client.txt.
      </p>
    </div>
  );
}

type CheckState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "latest" }
  | { kind: "update"; info: UpdateInfo }
  | { kind: "error"; msg: string };

function UpdatesSection({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });

  const checkNow = async () => {
    setCheck({ kind: "busy" });
    try {
      const info = await checkForUpdate();
      setCheck(info ? { kind: "update", info } : { kind: "latest" });
    } catch (e) {
      setCheck({ kind: "error", msg: String(e) });
    }
  };

  return (
    <section className="panel p-5 space-y-3">
      <h2 className="font-medium">Updates</h2>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Check for new versions on launch and once a day
      </label>
      <p className="text-xs text-ink-dim">
        Checks the project’s GitHub releases (one request to api.github.com);
        nothing about you or your runs is sent.
      </p>
      <div className="flex items-center gap-3">
        <button className="btn" onClick={checkNow} disabled={check.kind === "busy"}>
          {check.kind === "busy" ? "Checking…" : "Check now"}
        </button>
        {check.kind === "latest" && (
          <span className="text-good text-sm">✓ You’re on the latest version</span>
        )}
        {check.kind === "update" && (
          <button
            className="text-accent hover:underline text-sm"
            onClick={() => openUrl(check.info.url)}
          >
            v{check.info.latest} is available — open the release page ↗
          </button>
        )}
        {check.kind === "error" && (
          <span className="text-bad text-sm">✗ {check.msg}</span>
        )}
      </div>
    </section>
  );
}

function DebugPanel() {
  const [show, setShow] = useState(false);
  const { data, refetch } = useQuery({
    queryKey: ["recentEvents"],
    queryFn: recentParsedEvents,
    enabled: show,
    refetchInterval: show ? 2000 : false,
  });
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Debug: recent parsed log events</h2>
        <div className="flex gap-2">
          {show && (
            <button className="btn" onClick={() => refetch()}>
              Refresh
            </button>
          )}
          <button className="btn" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {show && (
        <pre className="mt-3 text-[11px] text-ink-dim bg-bg rounded-md p-3 max-h-64 overflow-auto whitespace-pre-wrap">
          {(data ?? []).slice(-40).join("\n") || "No events parsed yet."}
        </pre>
      )}
    </section>
  );
}

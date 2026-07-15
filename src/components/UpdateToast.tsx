// New-version notice living in the sidebar's empty bottom-left corner.
// Checks GitHub releases on app open and every 24h while running; a
// dismissed version stays dismissed (localStorage) until a newer one ships.
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkForUpdate } from "../lib/ipc";
import { useSettings } from "../lib/queries";
import type { UpdateInfo } from "../types/ipc";

const DISMISSED_KEY = "leaguestart.dismissedUpdate";
const DAY_MS = 24 * 60 * 60 * 1000;

export default function UpdateToast() {
  const { data: settings } = useSettings();
  // Only start checking once settings are loaded, so an opt-out is honored
  // before the first request.
  const enabled = settings
    ? ((settings["update_check_enabled"] as boolean | null) ?? true)
    : false;

  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (!enabled) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const check = () =>
      checkForUpdate()
        .then((u) => {
          if (cancelled || !u) return;
          if (localStorage.getItem(DISMISSED_KEY) === u.latest) return;
          setInfo(u);
        })
        .catch(() => {}); // offline / rate-limited — try again next round
    check();
    const timer = setInterval(check, DAY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  if (!info) return null;

  return (
    <div className="mx-2 mb-2 rounded-md border border-accent/50 bg-panel-2 p-2.5 text-xs space-y-1.5">
      <div className="font-medium">Update available</div>
      <div className="text-ink-dim">
        v{info.current} → <span className="text-accent">v{info.latest}</span>
      </div>
      <div className="flex gap-1.5">
        <button className="btn-accent text-xs px-2 py-0.5" onClick={() => openUrl(info.url)}>
          Download
        </button>
        <button
          className="btn text-xs px-2 py-0.5"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, info.latest);
            setInfo(null);
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}

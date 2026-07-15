// Custom window chrome: the OS titlebar is disabled (decorations: false)
// and min/max/close live inside the app UI. The bar itself is the drag
// region; double-clicking it toggles maximize (handled natively by Tauri).
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = getCurrentWindow();

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const sync = () => win.isMaximized().then((m) => !cancelled && setMaximized(m));
    sync();
    win.onResized(sync).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-stretch bg-panel border-b border-line select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-3.5">
        <LogoMark />
        <span data-tauri-drag-region className="text-accent font-semibold tracking-wide text-sm">
          Leaguestart
        </span>
        <span data-tauri-drag-region className="text-[11px] text-ink-dim mt-px">
          PoE 1 league-start prep
        </span>
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex items-stretch">
        <button className="titlebar-btn" aria-label="Minimize" onClick={() => win.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
        <button
          className="titlebar-btn"
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="0.55"
                y="0.55"
                width="8.9"
                height="8.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          )}
        </button>
        <button className="titlebar-btn titlebar-close" aria-label="Close" onClick={() => win.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function LogoMark() {
  // Tiny "splits bars" glyph matching the app icon.
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1" y="8" width="3" height="5" rx="0.5" className="fill-accent/60" />
      <rect x="5.5" y="4" width="3" height="9" rx="0.5" className="fill-accent/80" />
      <rect x="10" y="1" width="3" height="12" rx="0.5" className="fill-accent" />
    </svg>
  );
}

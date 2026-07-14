import { useEffect } from "react";
import { useTrackerStore } from "../stores/trackerStore";

/** Bottom-right toast stack fed by tracker notices and run events. */
export default function Notices() {
  const notices = useTrackerStore((s) => s.notices);
  const dismiss = useTrackerStore((s) => s.dismissNotice);

  useEffect(() => {
    if (notices.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      for (const n of notices) {
        if (now - n.at > 8000) dismiss(n.id);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [notices, dismiss]);

  if (notices.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80">
      {notices.map((n) => (
        <div
          key={n.id}
          className="panel px-4 py-3 text-sm shadow-lg flex items-start gap-2"
        >
          <span className="flex-1">{n.text}</span>
          <button
            className="text-ink-dim hover:text-ink"
            onClick={() => dismiss(n.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

import { Link } from "react-router-dom";
import { useTrackerStore } from "../stores/trackerStore";

/** Persistent warnings that affect tracking correctness. */
export default function StatusBanner() {
  const status = useTrackerStore((s) => s.status);
  if (!status) return null;

  if (status.state === "idle" || !status.logPath) {
    return (
      <div className="bg-panel-2 border-b border-line px-5 py-2 text-sm text-ink-dim">
        No Client.txt configured — tracking is off.{" "}
        <Link to="/settings" className="text-accent hover:underline">
          Set it up in Settings →
        </Link>
      </div>
    );
  }
  if (status.state === "no_file") {
    return (
      <div className="bg-bad/10 border-b border-bad/40 px-5 py-2 text-sm text-bad">
        The configured Client.txt can’t be read right now: {status.logPath}
      </div>
    );
  }
  if (status.chatWarning) {
    return (
      <div className="bg-accent/10 border-b border-accent/40 px-5 py-2 text-sm text-accent">
        Zones are generating but no “You have entered” lines are appearing —
        local chat is probably disabled in-game. Enable it (chat settings) or
        the tracker can’t see zone changes.
      </div>
    );
  }
  return null;
}

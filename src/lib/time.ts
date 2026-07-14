/** Format a duration in ms as h:mm:ss (or m:ss under an hour). */
export function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const body =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return neg ? `−${body}` : body;
}

/** Signed delta, e.g. "+1:23" / "−0:45". */
export function fmtDelta(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
  return sign + fmtDur(Math.abs(ms));
}

export function fmtClock(tsMs: number | null | undefined): string {
  if (tsMs == null) return "—";
  return new Date(tsMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtAgo(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export const ACT_LABELS: Record<number, string> = {
  1: "Act 1", 2: "Act 2", 3: "Act 3", 4: "Act 4", 5: "Act 5",
  6: "Act 6", 7: "Act 7", 8: "Act 8", 9: "Act 9", 10: "Act 10",
  11: "Epilogue",
};

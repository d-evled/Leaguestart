import { fmtDelta } from "../lib/time";

/** Green/red split delta (negative = faster = good). */
export default function DeltaBadge({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="text-ink-dim">—</span>;
  if (Math.abs(ms) < 500) return <span className="text-ink-dim">±0:00</span>;
  const cls = ms < 0 ? "text-good" : "text-bad";
  return <span className={`${cls} tabular-nums`}>{fmtDelta(ms)}</span>;
}

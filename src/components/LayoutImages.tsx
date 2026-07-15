import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { LayoutZoneImages } from "../types/ipc";

/** Thumbnail strip + click-to-enlarge lightbox for a zone's locally cached
 *  guide images. Renders nothing when the zone has no cached files. */
export default function LayoutImageStrip({
  entry,
  sourceName,
  compact,
}: {
  entry: LayoutZoneImages;
  sourceName: string;
  /** Show only the first thumbnail (Bottlenecks expansion). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const count = entry.files.length;

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : Math.min(count - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);

  if (!count) return null;
  const thumbs = compact ? entry.files.slice(0, 1) : entry.files;
  const current = open != null ? entry.files[open] : null;

  return (
    <>
      <div className="flex items-end gap-1.5 flex-wrap">
        {thumbs.map((f, i) => (
          <button
            key={f.path}
            className="block border border-line rounded overflow-hidden hover:border-accent transition-colors"
            title="Click to enlarge"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(i);
            }}
          >
            <img
              src={convertFileSrc(f.path)}
              alt={`${entry.pageTitle} layout`}
              loading="lazy"
              className={`w-auto object-cover ${compact ? "h-16 max-w-44" : "h-20 max-w-60"}`}
            />
          </button>
        ))}
        {compact && count > 1 && (
          <button
            className="text-xs text-ink-dim hover:text-ink pb-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(1);
            }}
          >
            +{count - 1} more
          </button>
        )}
      </div>
      {current && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-6"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(null);
          }}
        >
          <img
            src={convertFileSrc(current.path)}
            alt={entry.pageTitle}
            className="max-h-[85vh] max-w-[92vw] object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="mt-3 text-xs text-white/80 flex items-center gap-3 flex-wrap justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <span>
              {entry.pageTitle} — image © {sourceName}, cached locally for personal use
            </span>
            <button
              className="text-accent hover:underline"
              onClick={() => openUrl(entry.pageUrl)}
            >
              source page ↗
            </button>
            {count > 1 && open != null && (
              <span className="tabular-nums">
                {open + 1}/{count} (←/→)
              </span>
            )}
            <button
              className="text-white/70 hover:text-white"
              onClick={() => setOpen(null)}
            >
              close ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { clearLayoutImages, fetchLayoutImages } from "../lib/ipc";
import { useLayoutImages, useLayouts } from "../lib/queries";
import { ACT_LABELS } from "../lib/time";
import LayoutImageStrip from "../components/LayoutImages";
import type {
  LayoutImagesProgress,
  LayoutZoneImages,
  ZoneLayout,
} from "../types/ipc";

const CONSISTENCY = {
  1: { label: "fixed layout", cls: "bg-good" },
  2: { label: "rule-based", cls: "bg-accent" },
  3: { label: "high variance", cls: "bg-bad" },
} as const;

/** Site-scoped web search — resolves to the zone's page without us having
 *  to hardcode (and maintain) the guide's URL scheme. */
export const guideSearchUrl = (siteUrl: string, name: string, act: number) => {
  const host = new URL(siteUrl).hostname.replace(/^www\./, "");
  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${host} ${name} act ${act}`)}`;
};

const PHASE_LABELS: Record<string, string> = {
  robots: "checking robots.txt",
  index: "reading the guide index",
  pages: "reading zone pages",
  images: "downloading images",
  done: "finishing up",
};

/** Download / status panel for the personal layout-image cache. Images are
 *  fetched by the app on this machine only — never bundled or re-shared. */
function ImagesPanel() {
  const { data: manifest, isLoading } = useLayoutImages();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<LayoutImagesProgress | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const un = listen<LayoutImagesProgress>("layoutimages://progress", (e) =>
      setProgress(e.payload),
    );
    return () => {
      un.then((f) => f());
    };
  }, []);

  const fetchMut = useMutation({
    mutationFn: fetchLayoutImages,
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["layoutImages"] });
    },
  });
  const clearMut = useMutation({
    mutationFn: clearLayoutImages,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["layoutImages"] }),
  });

  if (isLoading) return null;

  if (fetchMut.isPending) {
    const label = progress
      ? `${PHASE_LABELS[progress.phase] ?? progress.phase}${
          progress.total > 0
            ? ` (${Math.min(progress.done + 1, progress.total)}/${progress.total})`
            : ""
        } — ${progress.message}`
      : "starting…";
    return (
      <div className="panel px-3.5 py-2.5 text-sm flex items-center gap-2.5">
        <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
        <span className="text-ink-dim truncate">
          Downloading layout images: {label}
        </span>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="panel p-3.5 space-y-2">
        <div className="font-medium text-sm">Layout images</div>
        <p className="text-sm text-ink-dim max-w-3xl">
          The guide’s images are its strongest part. Download them into a
          personal cache to see them inline on every zone card. They are saved
          only on this machine — never bundled with the app or re-shared —
          every image keeps a link back to its source page, and the site’s
          robots.txt is honored.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-accent text-sm" onClick={() => fetchMut.mutate()}>
            Download layout images
          </button>
          <span className="text-xs text-ink-dim">
            one-time, rate-limited download (a few minutes) — works offline
            afterwards
          </span>
        </div>
        {fetchMut.isError && (
          <p className="text-bad text-sm">{String(fetchMut.error)}</p>
        )}
      </div>
    );
  }

  const cachedZones = manifest.zones.filter((z) => z.files.length > 0).length;
  const gaps =
    manifest.zonesWithoutImages.length > 0 || manifest.unmatchedPages.length > 0;
  return (
    <div className="panel px-3.5 py-2.5 text-sm space-y-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        <span>
          <span className="text-good">✓</span> images cached for {cachedZones}{" "}
          zones
          <span className="text-ink-dim">
            {" "}
            · fetched {new Date(manifest.fetchedAt).toLocaleDateString()}
          </span>
        </span>
        <span className="flex-1" />
        <button
          className="btn text-xs"
          title="Re-crawl the guide; already-downloaded images are kept"
          onClick={() => fetchMut.mutate()}
        >
          Refresh
        </button>
        {confirmClear ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-ink-dim text-xs">delete the local cache?</span>
            <button
              className="btn text-xs text-bad"
              onClick={() => {
                setConfirmClear(false);
                clearMut.mutate();
              }}
            >
              Yes, clear
            </button>
            <button className="btn text-xs" onClick={() => setConfirmClear(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="btn text-xs" onClick={() => setConfirmClear(true)}>
            Clear cache
          </button>
        )}
      </div>
      {fetchMut.data && (
        <p className="text-xs text-ink-dim">
          last run: {fetchMut.data.imagesDownloaded} new images ·{" "}
          {fetchMut.data.pagesCrawled} pages crawled
          {fetchMut.data.errors.length > 0 &&
            ` · ${fetchMut.data.errors.length} errors`}
        </p>
      )}
      {gaps && (
        <details className="text-xs text-ink-dim">
          <summary className="cursor-pointer">
            coverage report: {manifest.zonesWithoutImages.length} zones without
            images · {manifest.unmatchedPages.length} guide pages not matched
          </summary>
          {manifest.zonesWithoutImages.length > 0 && (
            <p className="mt-1.5">
              <span className="text-ink">No images:</span>{" "}
              {manifest.zonesWithoutImages.join(", ")}
            </p>
          )}
          {manifest.unmatchedPages.length > 0 && (
            <p className="mt-1.5">
              <span className="text-ink">Unmatched pages:</span>{" "}
              {manifest.unmatchedPages.join(", ")}
            </p>
          )}
        </details>
      )}
      {fetchMut.isError && <p className="text-bad">{String(fetchMut.error)}</p>}
    </div>
  );
}

export default function LayoutsPage() {
  const { data: db } = useLayouts();
  const { data: imageManifest } = useLayoutImages();
  const [params, setParams] = useSearchParams();
  const focus = params.get("area");
  const [q, setQ] = useState("");

  const imagesById = useMemo(() => {
    const m = new Map<string, LayoutZoneImages>();
    for (const z of imageManifest?.zones ?? []) m.set(z.areaId, z);
    return m;
  }, [imageManifest]);

  const zones = useMemo(() => {
    const all = db?.zones ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((z) =>
      [z.name, `act ${z.act}`, ACT_LABELS[z.act] ?? "", z.summary, ...z.tips]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [db, q]);

  const byAct = useMemo(() => {
    const m = new Map<number, ZoneLayout[]>();
    for (const z of zones) {
      const list = m.get(z.act) ?? [];
      list.push(z);
      m.set(z.act, list);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [zones]);

  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focus && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center" });
    }
  }, [focus, db]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Layouts</h1>
        <input
          className="input max-w-md"
          placeholder="Search zones, acts, or tips… (e.g. “trial”, “act 7”, “waypoint”)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <p className="text-ink-dim text-sm max-w-3xl">
        Condensed layout notes for every campaign zone — the shape to expect,
        the rule to follow, and the stops worth making. For full maps and
        image guides, each zone links into{" "}
        {db && (
          <button
            className="text-accent hover:underline"
            onClick={() => openUrl(db.source.url)}
          >
            {db.source.name} ↗
          </button>
        )}
        . Zones your runs flag as bottlenecks link straight here.
      </p>

      <ImagesPanel />

      <div className="flex gap-4 text-xs text-ink-dim">
        {Object.entries(CONSISTENCY).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${c.cls}`} />
            {c.label}
          </span>
        ))}
      </div>

      {!db ? (
        <div className="panel p-6 text-ink-dim">Loading…</div>
      ) : zones.length === 0 ? (
        <div className="panel p-6 text-ink-dim">
          No zones match “{q}”. Try a zone name, an act, or a keyword like
          “trial”.
        </div>
      ) : (
        byAct.map(([act, list]) => (
          <section key={act} className="space-y-2">
            <h2 className="font-medium text-ink-dim text-sm uppercase tracking-wider">
              {ACT_LABELS[act] ?? `Act ${act}`}
            </h2>
            <div className="grid md:grid-cols-2 gap-2">
              {list.map((z) => {
                const focused = z.areaId === focus;
                const imgs = imagesById.get(z.areaId);
                return (
                  <div
                    key={z.areaId}
                    ref={focused ? focusRef : undefined}
                    className={`panel p-3.5 space-y-1.5 ${
                      focused ? "border-accent ring-1 ring-accent/40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${CONSISTENCY[z.consistency].cls}`}
                        title={CONSISTENCY[z.consistency].label}
                      />
                      <span className="font-medium">{z.name}</span>
                      {z.side && (
                        <span className="badge bg-panel-2 text-ink-dim">side</span>
                      )}
                      {z.waypoint && (
                        <span className="badge bg-panel-2 text-ink-dim" title="has waypoint">
                          wp
                        </span>
                      )}
                      <span className="flex-1" />
                      <button
                        className="text-accent hover:underline text-xs shrink-0"
                        onClick={() =>
                          openUrl(
                            z.guideUrl ??
                              imgs?.pageUrl ??
                              guideSearchUrl(db.source.url, z.name, z.act),
                          )
                        }
                        title={`Find ${z.name} in ${db.source.name}`}
                      >
                        full guide ↗
                      </button>
                      {focused && (
                        <button
                          className="text-ink-dim hover:text-ink text-xs shrink-0"
                          onClick={() => setParams({}, { replace: true })}
                          title="Clear highlight"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-ink-dim">{z.summary}</p>
                    <ul className="text-sm space-y-1">
                      {z.tips.map((t, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-accent shrink-0">›</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                    {imgs && (
                      <LayoutImageStrip entry={imgs} sourceName={db.source.name} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

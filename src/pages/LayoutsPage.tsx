import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLayouts } from "../lib/queries";
import { ACT_LABELS } from "../lib/time";
import type { ZoneLayout } from "../types/ipc";

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

export default function LayoutsPage() {
  const { data: db } = useLayouts();
  const [params, setParams] = useSearchParams();
  const focus = params.get("area");
  const [q, setQ] = useState("");

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
                          openUrl(z.guideUrl ?? guideSearchUrl(db.source.url, z.name, z.act))
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

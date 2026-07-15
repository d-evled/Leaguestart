# Leaguestart — Project Handoff

_Last updated: 2026-07-15 · working branch: `claude/poe-league-start-tool-t3oayb` (no PR opened yet)_

Companion to the [README](../README.md): where the project stands, the decisions that must outlive any one contributor, what is deliberately **not** done, and what to do next.

## 30-second overview

Tauri 2 desktop app for Path of Exile 1 league-start preparation: plan the build, auto-track practice campaign runs by tailing the game's `Client.txt`, record atlas milestones, surface bottleneck zones, study zone layouts, and compare runs. Data flow:

```
Client.txt → watcher (poll tail) → parser (regex → LogEvent) → tracker state machine
          → SQLite (rusqlite) + Tauri events → React UI (TanStack Query / zustand)
```

Everything game-adjacent lives in `crates/core` and is fully testable headless on Linux (the game is Windows-only). `src-tauri` is a thin command/event shell; `src/` is React + TypeScript + Tailwind v4.

## Feature state — all shipped and CI-verified

| Feature | Entry points |
|---|---|
| Plan: league/class/asc dropdowns, PoB auto-fill (code / pastebin / pobb.in / poe.ninja), checkpoints, guide links | `src/pages/PlanPage.tsx`, `src-tauri/src/commands/pob.rs`, `crates/core/src/pob.rs` |
| Live run tracking: per-zone splits, load removal, revisits, levels, deaths, goals | `crates/core/src/tracker/mod.rs`, `crates/core/src/log/`, `src/pages/LiveRunPage.tsx` |
| Atlas: tier 1–16 milestones (candidate/complete heuristic) + manual voidstones | `crates/core/src/tracker/mod.rs`, `src/pages/AtlasPage.tsx` |
| Run history / detail / compare (delta splits, cumulative + level charts) | `src/pages/{Runs,RunDetail,Compare}Page.tsx`, `crates/core/src/db/repo/analysis.rs` |
| Bottlenecks: per-zone stats, auto-flagging, notes, layout cross-links | `src/pages/BottlenecksPage.tsx` |
| Layouts: 138 original zone notes, searchable, deep-linkable (`/layouts?area=…`) | `crates/core/src/layouts.rs`, `scripts/gen-layouts.mjs`, `src/pages/LayoutsPage.tsx` |
| Layout images: user-initiated personal local cache (crawler + lightbox UI) | `src-tauri/src/commands/layout_images.rs`, `src/components/LayoutImages.tsx` |
| Custom frameless titlebar | `src/components/TitleBar.tsx`, `src-tauri/capabilities/default.json` |
| Update check: on launch + daily vs GitHub Releases, dismissible sidebar toast | `src-tauri/src/commands/update.rs`, `src/components/UpdateToast.tsx` |
| Settings: log path save/validate, character filter, run goal, update toggle, event debug | `src/pages/SettingsPage.tsx` |

Verification gates are listed in the README (Development section); all were green at handoff. CI (`.github/workflows/build-windows.yml`) runs tests + builds Windows installers per push (`leaguestart-windows` artifact) and publishes a GitHub Release on `v*` tags.

## Non-negotiable constraints

These are product commitments, not implementation details. Do not trade them away for features.

1. **GGG ToS compliance by construction.** The app only ever *reads* `logs/Client.txt` (opened shared/read-only). It must never send input to the game, read game memory, touch game network traffic, modify game files, scrape pathofexile.com, or bundle GGG assets. Any feature that would automate gameplay is permanently out of scope. The non-affiliation disclaimer stays in the README and app.
2. **Definitiv Guide copyright.** The in-app layout notes are original condensed summaries (provenance documented in the `scripts/gen-layouts.mjs` header) — no guide text may be copied or closely paraphrased into the repo. Guide *images* are handled via the personal local cache only: fetched by the user's explicit click, on their machine, into their app data, honoring robots.txt, rate-limited, with an honest User-Agent and per-image source attribution. **Nothing of theirs ships in the repo or installer** unless the author grants permission (see backlog), at which point the fetcher can become a bundler.
3. **Network behavior stays enumerable.** Exactly three request kinds, all user-controlled, none to GGG servers: explicit paste-link fetch, daily update check (toggleable), and the optional image crawl. The README documents all three; keep that list exhaustive if you add network calls.

## Known gaps and risks (ordered by likelihood of biting)

1. **The image crawler has never run against the live site.** definitivguide.com 403-blocks datacenter/non-browser clients, so the crawler was written against synthetic Docusaurus-style HTML (6 unit tests cover robots parsing, act extraction, zone matching, HTML extraction). First real run happens on a user's machine. If coverage is poor: the Layouts panel's coverage report and the returned error strings say exactly what failed; adjust the selectors in `extract_doc_links` / `extract_title` / `extract_image_urls` / `match_zone` in `src-tauri/src/commands/layout_images.rs`. If the CDN blocks the app's HTTP client outright, the planned (unbuilt) fallback is an in-app webview browser of the guide pages.
2. **All tracker fixtures are synthetic.** The parser and `areas.json` need validation against a real `Client.txt` (paste a snippet, fix regexes/ids if needed), and the current patch string should be confirmed — the data is stamped `3.26`.
3. **No GitHub Release exists yet**, so the in-app update check finds nothing until the first `v*` tag is pushed (README → "Releasing a new version").
4. **English game client only.** Parser patterns are table-driven to allow future locales, but none are implemented.
5. **Guide deep links are indirect by default.** `guideUrl` in `layouts.json` is null everywhere, so "full guide" falls back to a site-scoped DuckDuckGo search; after a user runs the image crawl, the resolved per-zone `pageUrl`s take over automatically.
6. **Map completion is a heuristic** (left the map without dying → completed) and voidstones are manual by design — the log contains neither.

## Backlog (rough order)

1. **Ship v0.1.0**: bump the version in `src-tauri/tauri.conf.json`, `package.json`, and the workspace `Cargo.toml`, then `git tag v0.1.0 && git push origin v0.1.0`. This activates the update loop for installed apps.
2. **Real-log validation session** (gap #2 above).
3. **Ask Definitiv for permission** to bundle images/richer content with attribution (draft below). If granted: extend `scripts/gen-layouts.mjs` / repurpose the fetcher, and populate `guideUrl`s.
4. Polish leftovers from the original plan (M6): AFK/pause annotation, segment exclusion + mule detection UI, `single-instance` + `window-state` plugins, league-vs-league atlas overlay.
5. Optional: in-app guide browser fallback (gap #1 contingency).

## Draft: permission request to Definitiv

> Hi — I'm building Leaguestart, a free, open-source league-start practice tracker for PoE 1 (github.com/d-evled/Leaguestart). It has a layouts section with my own short zone notes, and every zone links out to your guide, which I think is the best layout resource there is. Would you be OK with the app bundling your layout images (with clear attribution and a link back on every image)? Currently users can only fetch them into a private local cache themselves. Happy to credit you however you prefer, or respect a no — thanks for making the guide!

## Dev notes

- **App data** lives in the platform app-data dir under `com.leaguestart.app/`: `leaguestart.db3` (SQLite, WAL) and `layout-images/` (cache + `manifest.json`). Both are safe to delete; the schema migrates via `PRAGMA user_version` on startup.
- **E2E without the game**: `npm run replay` streams a fixture into a temp log (see README → "Simulating a play session").
- **Log-line reference**: `docs/log-format.md`. **Data provenance**: `crates/core/data/poe1/SOURCES.md` and the `scripts/gen-*.mjs` headers.
- **Duplicate zone names** (Acts 1–5 vs 6–10) are the recurring trap: never match a zone by display name alone — pair it with the `Generating` client id or act context (`crates/core/src/tracker/mod.rs` shows the pattern; `layout_images.rs::match_zone` repeats it for crawled pages).

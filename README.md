# Leaguestart

A desktop companion for **Path of Exile 1** league-start preparation. Plan your league starter, practice the campaign, and let the app measure everything — then compare runs to see exactly what went right or wrong.

> Leaguestart is a fan-made tool. It is **not affiliated with or endorsed by Grinding Gear Games**.

## What it does

- **Plan** — aggregate your league-start character in one place: league/class/ascendancy dropdowns that auto-fill from a pasted PoB import code or pastebin.com / pobb.in / poe.ninja link, ordered Path of Building progression checkpoints (codes and/or links, decoded into class/ascendancy/level badges), build-guide links (Maxroll, YouTube, forums), and notes.
- **Live run tracking** — the app tails PoE's `logs/Client.txt` and records campaign runs automatically: per-zone splits with loading screens measured separately (load removal), level-ups, deaths, and backtracking. No interaction needed while you play.
- **Atlas progression** — when you enter a map of a new tier for the first time, the app records your character level and elapsed time as a milestone (with a completion heuristic you can confirm or edit). The four Voidstones are one-click manual milestones.
- **Bottlenecks** — per-zone statistics across all your runs (best / median / last / spread / share of act time), automatic flagging of zones that consistently eat your time, plus your own flags and notes.
- **Layouts** — searchable layout notes for every campaign zone (the shape to expect, the rule to follow, trials and quest stops, and a consistency rating). Zones your runs flag as bottlenecks link straight to their layout notes, and every zone links out to the community [Definitiv Guide](https://www.definitivguide.com/docs/category/path-of-exile-1) for full maps and images. Optionally, the app can download the guide's layout images into a **personal, local-only cache** so they show inline on zone cards and bottleneck rows (see the network section below). The in-app notes are original condensed summaries of common routing knowledge — external guide content is linked or cached locally for personal use, never copied into the app (see `scripts/gen-layouts.mjs` for provenance and how to extend entries).
- **Compare** — run-vs-run split deltas aligned by campaign order, cumulative time charts, and level-vs-time curves; practice runs vs the real league start.

## How tracking works (and GGG Terms of Service)

Leaguestart only ever **reads** the game's text log (`logs/Client.txt`), the same passive mechanism used for years by tools like Awakened PoE Trade, TraXile, mapwatch, and LiveSplit autosplitters. It never modifies game files, never reads game memory, never touches the network traffic, and never sends any input to the game — nothing to configure, nothing that can violate the [Terms of Use](https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy).

The app makes exactly three kinds of network requests, none to GGG servers, and all under your control:

- **PoB import**: pasting a pastebin.com / pobb.in / poe.ninja link in the Plan page fetches that one paste to decode it (pasting the PoB code itself is fully offline).
- **Update check**: on launch and once a day it asks GitHub whether a newer release exists (one request to `api.github.com`; nothing about you or your runs is sent). Toggle it off in Settings → Updates.
- **Layout images (optional)**: clicking *Download layout images* on the Layouts page crawls the guide site once, on your machine, and caches its images in your local app-data folder for personal use. The crawl honors the site's robots.txt, is rate-limited, identifies itself honestly, and every image keeps a link to its source page. The images are never bundled with the app, committed to this repo, or re-shared — your copy stays yours, like a browser cache.

Requirements:

- **In-game local chat must be enabled** (the log lines the tracker depends on are missing otherwise). The app warns when it detects this.
- Point the app at your `Client.txt` once (Settings), e.g.
  `C:\Program Files (x86)\Steam\steamapps\common\Path of Exile\logs\Client.txt`

## Stack

Tauri 2 desktop app:

- `crates/core` — headless Rust engine: log parser, file watcher, run/atlas tracker state machine, SQLite (rusqlite) persistence. Fully testable without the game or a GUI.
- `src-tauri` — thin Tauri shell: commands, events, tracker thread.
- `src/` — React + TypeScript + Vite + Tailwind frontend (TanStack Query, zustand, Recharts).

## Development

> Project status, design decisions, known gaps, and the forward backlog live in [docs/HANDOFF.md](docs/HANDOFF.md).

Prerequisites: Rust (stable), Node 20+, and on Linux the Tauri system deps (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, etc. — see [Tauri docs](https://v2.tauri.app/start/prerequisites/)).

```sh
npm install
npm run tauri dev      # run the app
```

Verification gates — everything below must pass before a change ships (CI runs the same on every push):

```sh
cargo test -p leaguestart-core            # headless engine tests
cargo test -p leaguestart-app --lib       # Tauri shell unit tests
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
npm run typecheck && npm run build
```

### Simulating a play session (no game needed)

`scripts/replay-log.mjs` streams a fixture log into a temp file as if the game were writing it live:

```sh
node scripts/replay-log.mjs --src crates/core/tests/fixtures/full_run.txt --dest /tmp/poe/Client.txt --speed 60 --rewrite-ts
```

Point the app's Settings at `/tmp/poe/Client.txt` and watch a full campaign run tick by at 60× speed.

### Static area data

`crates/core/data/poe1/<patch>/areas.json` (embedded at compile time) maps zone names to act/order/level/kind and powers split alignment and duplicate-name disambiguation (Acts 1–5 vs 6–10 reuse names). It is generated by `npm run gen:areas` — see `crates/core/data/poe1/SOURCES.md` for provenance and how observed client ids are collected from real logs to refine it.

Zone-layout notes (`crates/core/data/poe1/layouts.json`, also embedded) are generated by `npm run gen:layouts`; the script's header documents provenance (original condensed summaries, no guide text copied) and `crates/core/tests/layouts_test.rs` enforces exact coverage of every campaign zone.

### CI

`.github/workflows/build-windows.yml` runs the headless tests and builds the Windows installers (NSIS `.exe` + MSI) on every push, uploading them as the `leaguestart-windows` artifact. Pushing a `v*` tag additionally publishes the installers as a GitHub Release (see below).

### Releasing a new version

The in-app update check compares the running version against the latest GitHub Release. To ship one:

1. Bump the version in `src-tauri/tauri.conf.json`, `package.json`, and the workspace `Cargo.toml` (`[workspace.package] version`).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. CI builds the Windows installers and publishes them on a GitHub Release for that tag — running apps will surface the update within a day.

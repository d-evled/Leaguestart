// One-time subscription of Tauri events into the zustand store + React Query.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { QueryClient } from "@tanstack/react-query";
import { useTrackerStore } from "../stores/trackerStore";
import type { Run, RunDetail, TrackerStatus } from "../types/ipc";
import { getActiveRun, getTrackerStatus } from "./ipc";
import { fmtDur } from "./time";

const DOMAIN_KEYS: Record<string, string[][]> = {
  runs: [["runs"], ["run"], ["compare"], ["zoneStats"]],
  atlas: [["progressions"], ["progression"]],
  plans: [["plans"], ["checkpoints"], ["links"]],
  notes: [["zoneNotes"], ["zoneStats"]],
  settings: [["settings"]],
};

export async function bootstrapEvents(queryClient: QueryClient): Promise<UnlistenFn[]> {
  const store = useTrackerStore.getState();

  // Initial hydration (events only cover changes from now on).
  getTrackerStatus().then(store.setStatus).catch(() => {});
  getActiveRun().then(store.setActiveRun).catch(() => {});

  const subs = await Promise.all([
    listen<TrackerStatus>("tracker://status", (e) => {
      useTrackerStore.getState().setStatus(e.payload);
    }),
    listen<RunDetail | null>("run://active", (e) => {
      useTrackerStore.getState().setActiveRun(e.payload);
    }),
    listen<Run>("run://finished", (e) => {
      const run = e.payload;
      const verb = run.status === "completed" ? "completed" : "abandoned";
      useTrackerStore
        .getState()
        .addNotice(`Run ${verb} — ${fmtDur(run.totalMs)} (${run.deaths} deaths)`);
    }),
    listen<{ text: string }>("notice://message", (e) => {
      useTrackerStore.getState().addNotice(e.payload.text);
    }),
    listen<{ domain: string }>("data://changed", (e) => {
      for (const key of DOMAIN_KEYS[e.payload.domain] ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }),
  ]);
  return subs;
}

// Typed wrappers around Tauri invoke — one function per backend command.
import { invoke } from "@tauri-apps/api/core";
import type {
  AtlasProgression,
  CompareData,
  GuideLink,
  LeaguePlan,
  LogPathValidation,
  PobCheckpoint,
  ProgressionDetail,
  Run,
  RunDetail,
  Settings,
  TrackerStatus,
  Voidstone,
  ZoneNote,
  ZoneStat,
} from "../types/ipc";

// settings
export const getSettings = () => invoke<Settings>("get_settings");
export const setSetting = (key: string, value: unknown) =>
  invoke<void>("set_setting", { key, value });
export const validateLogPath = (path: string) =>
  invoke<LogPathValidation>("validate_log_path", { path });
export const getTrackerStatus = () => invoke<TrackerStatus>("get_tracker_status");
export const recentParsedEvents = () => invoke<string[]>("recent_parsed_events");

// plans
export const listPlans = () => invoke<LeaguePlan[]>("list_plans");
export const upsertPlan = (input: {
  id?: number | null;
  name: string;
  leagueName?: string | null;
  buildName?: string | null;
  class?: string | null;
  ascendancy?: string | null;
  notesMd?: string | null;
  archived?: boolean;
}) => invoke<LeaguePlan>("upsert_plan", { input });
export const deletePlan = (id: number) => invoke<void>("delete_plan", { id });
export const listCheckpoints = (planId: number) =>
  invoke<PobCheckpoint[]>("list_checkpoints", { planId });
export const upsertCheckpoint = (input: {
  id?: number | null;
  planId: number;
  label: string;
  pobCode?: string | null;
  url?: string | null;
  notes?: string | null;
}) => invoke<PobCheckpoint>("upsert_checkpoint", { input });
export const deleteCheckpoint = (id: number) => invoke<void>("delete_checkpoint", { id });
export const reorderCheckpoints = (ids: number[]) =>
  invoke<void>("reorder_checkpoints", { ids });
export const listLinks = (planId: number) => invoke<GuideLink[]>("list_links", { planId });
export const upsertLink = (input: {
  id?: number | null;
  planId: number;
  title: string;
  url: string;
  kind: string;
  notes?: string | null;
}) => invoke<GuideLink>("upsert_link", { input });
export const deleteLink = (id: number) => invoke<void>("delete_link", { id });

// runs
export const listRuns = () => invoke<Run[]>("list_runs");
export const getRunDetail = (id: number) => invoke<RunDetail | null>("get_run_detail", { id });
export const getActiveRun = () => invoke<RunDetail | null>("get_active_run");
export const updateRunMeta = (args: {
  id: number;
  kind: string;
  label?: string | null;
  planId?: number | null;
  notesMd?: string | null;
}) => invoke<void>("update_run_meta", args);
export const deleteRun = (id: number) => invoke<void>("delete_run", { id });
export const stopActiveRun = (abandon: boolean) =>
  invoke<void>("stop_active_run", { abandon });
export const setSegmentExcluded = (id: number, excluded: boolean) =>
  invoke<void>("set_segment_excluded", { id, excluded });

// atlas
export const listProgressions = () => invoke<AtlasProgression[]>("list_progressions");
export const getProgressionDetail = (id: number) =>
  invoke<ProgressionDetail | null>("get_progression_detail", { id });
export const createProgression = (label: string, planId?: number | null) =>
  invoke<AtlasProgression>("create_progression", { label, planId });
export const setProgressionActive = (id: number, active: boolean) =>
  invoke<void>("set_progression_active", { id, active });
export const deleteProgression = (id: number) =>
  invoke<void>("delete_progression", { id });
export const setMilestoneStatus = (id: number, status: string) =>
  invoke<void>("set_milestone_status", { id, status });
export const toggleVoidstone = (progressionId: number, stone: string) =>
  invoke<Voidstone[]>("toggle_voidstone", { progressionId, stone });

// analysis
export const compareRuns = (runIds: number[]) =>
  invoke<CompareData>("compare_runs", { runIds });
export const zoneStats = (planId?: number | null) =>
  invoke<ZoneStat[]>("zone_stats", { planId: planId ?? null });

// notes
export const getZoneNotes = () => invoke<ZoneNote[]>("get_zone_notes");
export const setZoneNote = (areaId: string, noteMd: string | null, flagged: boolean) =>
  invoke<ZoneNote>("set_zone_note", { areaId, noteMd, flagged });

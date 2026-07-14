// React Query hooks per domain. Cache keys are invalidated centrally by the
// data://changed event (see events.ts) and after local mutations.
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as ipc from "./ipc";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: ipc.getSettings });
}

export function useSetSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      ipc.setSetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: ipc.listPlans });
}

export function useCheckpoints(planId: number | null) {
  return useQuery({
    queryKey: ["checkpoints", planId],
    queryFn: () => ipc.listCheckpoints(planId!),
    enabled: planId != null,
  });
}

export function useLinks(planId: number | null) {
  return useQuery({
    queryKey: ["links", planId],
    queryFn: () => ipc.listLinks(planId!),
    enabled: planId != null,
  });
}

/** Generic mutation that just invalidates the given keys on success. */
export function useInvalidatingMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  keys: string[][],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRuns() {
  return useQuery({ queryKey: ["runs"], queryFn: ipc.listRuns });
}

export function useRunDetail(id: number | null) {
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => ipc.getRunDetail(id!),
    enabled: id != null,
  });
}

export function useProgressions() {
  return useQuery({ queryKey: ["progressions"], queryFn: ipc.listProgressions });
}

export function useProgressionDetail(id: number | null) {
  return useQuery({
    queryKey: ["progression", id],
    queryFn: () => ipc.getProgressionDetail(id!),
    enabled: id != null,
  });
}

export function useCompare(runIds: number[]) {
  return useQuery({
    queryKey: ["compare", ...runIds],
    queryFn: () => ipc.compareRuns(runIds),
    enabled: runIds.length >= 1,
  });
}

export function useZoneStats(planId: number | null) {
  return useQuery({
    queryKey: ["zoneStats", planId],
    queryFn: () => ipc.zoneStats(planId),
  });
}

export function useZoneNotes() {
  return useQuery({ queryKey: ["zoneNotes"], queryFn: ipc.getZoneNotes });
}

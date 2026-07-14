import { create } from "zustand";
import type { RunDetail, TrackerStatus } from "../types/ipc";

export interface Notice {
  id: number;
  text: string;
  at: number;
}

interface TrackerStore {
  status: TrackerStatus | null;
  activeRun: RunDetail | null;
  notices: Notice[];
  setStatus: (s: TrackerStatus) => void;
  setActiveRun: (r: RunDetail | null) => void;
  addNotice: (text: string) => void;
  dismissNotice: (id: number) => void;
}

let noticeId = 0;

export const useTrackerStore = create<TrackerStore>((set) => ({
  status: null,
  activeRun: null,
  notices: [],
  setStatus: (status) => set({ status }),
  setActiveRun: (activeRun) => set({ activeRun }),
  addNotice: (text) =>
    set((s) => ({
      notices: [...s.notices.slice(-4), { id: ++noticeId, text, at: Date.now() }],
    })),
  dismissNotice: (id) =>
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));

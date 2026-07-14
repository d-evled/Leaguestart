import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createHashRouter,
  NavLink,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { bootstrapEvents } from "./lib/events";
import { useTrackerStore } from "./stores/trackerStore";
import StatusBanner from "./components/StatusBanner";
import Notices from "./components/Notices";
import LiveRunPage from "./pages/LiveRunPage";
import PlanPage from "./pages/PlanPage";
import RunsPage from "./pages/RunsPage";
import RunDetailPage from "./pages/RunDetailPage";
import AtlasPage from "./pages/AtlasPage";
import ComparePage from "./pages/ComparePage";
import BottlenecksPage from "./pages/BottlenecksPage";
import SettingsPage from "./pages/SettingsPage";

const NAV = [
  { to: "/", label: "Live", end: true },
  { to: "/plan", label: "Plan" },
  { to: "/runs", label: "Runs" },
  { to: "/atlas", label: "Atlas" },
  { to: "/compare", label: "Compare" },
  { to: "/bottlenecks", label: "Bottlenecks" },
  { to: "/settings", label: "Settings" },
];

function AppShell() {
  const status = useTrackerStore((s) => s.status);
  return (
    <div className="flex h-full">
      <aside className="w-44 shrink-0 border-r border-line bg-panel flex flex-col">
        <div className="px-4 py-4">
          <div className="text-accent font-semibold tracking-wide text-lg">
            Leaguestart
          </div>
          <div className="text-[11px] text-ink-dim">PoE 1 league-start prep</div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-panel-2 text-accent"
                    : "text-ink-dim hover:text-ink hover:bg-panel-2/60"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 text-[11px] text-ink-dim border-t border-line">
          <span
            className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
              status?.state === "watching"
                ? "bg-good"
                : status?.state === "no_file"
                  ? "bg-bad"
                  : "bg-ink-dim"
            }`}
          />
          {status?.state === "watching"
            ? "watching log"
            : status?.state === "no_file"
              ? "log missing"
              : "no log set"}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <StatusBanner />
        <div className="p-5 max-w-6xl">
          <Outlet />
        </div>
      </main>
      <Notices />
    </div>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LiveRunPage /> },
      { path: "plan", element: <PlanPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "runs/:id", element: <RunDetailPage /> },
      { path: "atlas", element: <AtlasPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "bottlenecks", element: <BottlenecksPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

export default function App() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let subs: UnlistenFn[] = [];
    bootstrapEvents(queryClient).then((s) => {
      subs = s;
    });
    return () => {
      for (const un of subs) un();
    };
  }, [queryClient]);
  return <RouterProvider router={router} />;
}

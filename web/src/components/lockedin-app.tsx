"use client";

// Dashboard root (T1): wires the bridge lifecycle to the panels. The extension
// owns the live session; this component polls getState every second, pings for
// connection status, and runs the drain/save/ack sync cycle on load and every
// 30 seconds (SPEC 8.17).
import { useCallback, useEffect, useRef, useState } from "react";
import { callExtension } from "@/lib/bridge-client";
import type { DashboardData } from "@/lib/dashboard-data";
import type { ExtensionSession, LockMode } from "@/lib/extension-session";
import { runSyncCycle } from "@/lib/sync-cycle";
import { BlockedSitesPanel } from "./blocked-sites-panel";
import { ProjectsPanel } from "./projects-panel";
import { SessionPanel } from "./session-panel";
import { StartSessionDialog } from "./start-session-dialog";
import { StatsStrip } from "./stats-strip";

type ConnectionState = "checking" | "connected" | "disconnected";

function connectionDot(state: ConnectionState): { background: string; text: string } {
  if (state === "connected") return { background: "var(--ok)", text: "Extension connected" };
  if (state === "disconnected") return { background: "var(--warn)", text: "Extension not connected" };
  return { background: "var(--muted)", text: "Checking extension..." };
}

export function LockedInApp({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [startOpen, setStartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const refetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      if (!response.ok) return;
      setData((await response.json()) as DashboardData);
    } catch {
      // Network hiccup: keep the current data; the next cycle refetches.
    }
  }, []);

  const pushBlockedSites = useCallback((domains: string[]) => {
    void callExtension("setBlockedSites", { domains });
  }, []);

  // Connection ping every 3s.
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const reply = await callExtension("ping");
      if (alive) setConnection(reply.ok ? "connected" : "disconnected");
    };
    void ping();
    const timer = setInterval(ping, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Live state poll every 1s while the tab is visible (SPEC 8.17).
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const reply = await callExtension("getState");
      if (reply.ok) {
        const state = (reply.data ?? {}) as { session?: ExtensionSession | null };
        setSession(state.session ?? null);
      }
      setNowMs(Date.now());
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync cycle on load and every 30s; refetch stats when something was saved.
  useEffect(() => {
    let alive = true;
    const cycle = async () => {
      const result = await runSyncCycle();
      if (!alive) return;
      if (!result.ok && result.error) showToast(result.error);
      if (result.savedSessions > 0 || result.savedInfractions > 0) {
        await refetchData();
        if (result.savedSessions > 0) showToast("Session saved");
      }
    };
    void cycle();
    const timer = setInterval(cycle, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refetchData, showToast]);

  // On load, push the blocked list to the extension (SPEC 8.5).
  useEffect(() => {
    pushBlockedSites(initialData.blockedSites.map((site) => site.domain));
    // Only on mount: the list is pushed again after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiCall = useCallback(
    async (input: string, init: RequestInit): Promise<boolean> => {
      try {
        const response = await fetch(input, init);
        if (response.ok) {
          await refetchData();
          return true;
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? `Request failed (${response.status})`);
        return false;
      } catch {
        showToast("Network request failed.");
        return false;
      }
    },
    [refetchData, showToast],
  );

  const startSession = useCallback(
    async (spec: { projectId: string | null; taskId: string | null; minutes: number; lockMode: LockMode }) => {
      setStartOpen(false);
      // Make sure the extension has the newest block list before locking.
      pushBlockedSites(data.blockedSites.map((site) => site.domain));
      const task = spec.taskId ? data.projects.flatMap((p) => p.tasks).find((t) => t.id === spec.taskId) : null;
      const project = spec.projectId ? data.projects.find((p) => p.id === spec.projectId) : null;
      const label = task?.title ?? project?.name ?? "Focus session";
      const reply = await callExtension("startSession", {
        id: crypto.randomUUID(),
        projectId: spec.projectId,
        taskId: spec.taskId,
        label,
        lockMode: spec.lockMode,
        plannedSeconds: spec.minutes * 60,
      });
      if (reply.ok) {
        showToast("Session started");
      } else {
        showToast(reply.error);
      }
    },
    [data.blockedSites, data.projects, pushBlockedSites, showToast],
  );

  // Row timer buttons open the same start dialog; pre-selecting the task lands
  // with the full timer-icon work in T3.
  const startOnTask = useCallback(() => {
    setStartOpen(true);
  }, []);

  const controlSession = useCallback(
    async (method: "pause" | "resume" | "addTime" | "requestEnd" | "cancelEnd", payload?: unknown) => {
      const reply = await callExtension(method, payload);
      if (!reply.ok) showToast(reply.error);
    },
    [showToast],
  );

  const addManualInfraction = useCallback(
    async (text: string) => {
      const reply = await callExtension("addManualInfraction", { text });
      if (reply.ok) {
        showToast("Distraction recorded");
        await refetchData();
      } else {
        showToast(reply.error);
      }
    },
    [refetchData, showToast],
  );

  const addSites = useCallback(
    async (body: { inputs?: string[]; socialPack?: boolean }) => {
      setSitesError(null);
      try {
        const response = await fetch("/api/blocked-sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          sites?: DashboardData["blockedSites"];
          error?: string;
        };
        if (!response.ok) {
          setSitesError(payload.error ?? `Request failed (${response.status})`);
          return;
        }
        if (payload.sites) {
          setData((prev) => ({ ...prev, blockedSites: payload.sites! }));
          pushBlockedSites(payload.sites.map((site) => site.domain));
        }
      } catch {
        setSitesError("Network request failed.");
      }
    },
    [pushBlockedSites],
  );

  const dot = connectionDot(connection);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1760px] flex-col gap-6 px-[clamp(16px,2.6vw,40px)] py-6">
      <header className="sticky top-0 z-10 -mx-[clamp(16px,2.6vw,40px)] flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-[clamp(16px,2.6vw,40px)] py-3 backdrop-blur">
        <span className="text-lg font-semibold text-[var(--fg)]">LockedIn</span>
        <span className="hidden text-sm text-[var(--muted)] sm:inline">Welcome back</span>
        <span
          className="ml-auto flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-xs"
          style={{ color: dot.background }}
        >
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: dot.background }} />
          {dot.text}
        </span>
        <form action="/api/logout" method="post">
          <button
            type="submit"
            aria-label="Lock the dashboard and clear the session"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--fg)]"
          >
            Lock
          </button>
        </form>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,12fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-4">
          <StatsStrip
            sessions={data.todaySessions}
            infractions={data.todayInfractions}
            projects={data.projects}
            liveSession={session}
            nowMs={nowMs}
          />
          {session ? (
            <SessionPanel session={session} nowMs={nowMs} onControl={controlSession} onManualInfraction={addManualInfraction} />
          ) : (
            <button
              type="button"
              onClick={() => setStartOpen(true)}
              disabled={connection === "disconnected"}
              className="rounded-md px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              Start working
            </button>
          )}
          {connection === "disconnected" && (
            <p className="text-xs text-[var(--warn)]">
              The extension is not connected, so sessions and blocking are unavailable. Check the Dashboard URL in the
              extension popup.
            </p>
          )}
        </div>

        <ProjectsPanel
          projects={data.projects}
          onCreateProject={(name) =>
            void apiCall("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            })
          }
          onCreateTask={(projectId, title) =>
            void apiCall("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId, title }),
            })
          }
          onToggleTask={(taskId, done) =>
            void apiCall(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ done }),
            })
          }
          onDeleteProject={(projectId) => void apiCall(`/api/projects/${projectId}`, { method: "DELETE" })}
          onDeleteTask={(taskId) => void apiCall(`/api/tasks/${taskId}`, { method: "DELETE" })}
          onStartTask={startOnTask}
        />

        <div className="flex flex-col gap-4">
          <BlockedSitesPanel
            sites={data.blockedSites}
            onAdd={(input) => void addSites({ inputs: [input] })}
            onAddSocialPack={() => void addSites({ socialPack: true })}
            onDelete={(id) => {
              void apiCall(`/api/blocked-sites/${id}`, { method: "DELETE" }).then(() => {
                pushBlockedSites(data.blockedSites.filter((site) => site.id !== id).map((site) => site.domain));
              });
            }}
            error={sitesError}
          />
        </div>
      </div>

      {startOpen && (
        <StartSessionDialog
          projects={data.projects}
          onClose={() => setStartOpen(false)}
          onStart={(spec) => void startSession(spec)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--fg)] shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

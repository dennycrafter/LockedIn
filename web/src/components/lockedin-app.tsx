"use client";

// Dashboard root (T1 + T2): wires the bridge lifecycle to the panels. The
// extension owns the live session; this component polls getState every second,
// pings for connection status, and runs the drain/save/ack sync cycle on load
// and every 30 seconds (SPEC 8.17). T2 adds the full tree handlers, links,
// settings, and the completion celebration (SPEC 8.2, 8.3, 8.10).
import { useCallback, useEffect, useRef, useState } from "react";
import { callExtension } from "@/lib/bridge-client";
import type { CelebrationStyle, DashboardData, SettingsData } from "@/lib/dashboard-data";
import type { ExtensionSession, LockMode } from "@/lib/extension-session";
import { shouldCelebrate } from "@/lib/celebration";
import { projectOfTask, projectProgress, withTaskDone } from "@/lib/tree";
import { runSyncCycle } from "@/lib/sync-cycle";
import { toExtensionTree } from "@/lib/extension-tree";
import { BlockedSitesPanel } from "./blocked-sites-panel";
import { CelebrationOverlay } from "./celebration-overlay";
import { MiscTasksPanel } from "./misc-tasks-panel";
import { NotesPanel } from "./notes-panel";
import { OpenLoopsPanel } from "./open-loops-panel";
import { OrganizeModal } from "./organize-modal";
import { ProfileMenu } from "./profile-menu";
import { ProjectsPanel, type ProjectsPanelHandlers } from "./projects-panel";
import { SessionPanel } from "./session-panel";
import { StartSessionDialog } from "./start-session-dialog";
import { StuckModal } from "./stuck-modal";
import { StatsStrip } from "./stats-strip";
import { TimeStudyPanel } from "./time-study-panel";
import { TimeStudyPromptCard } from "./time-study-prompt";

type ConnectionState = "checking" | "connected" | "disconnected";

const JSON_HEADERS = { "Content-Type": "application/json" };

function connectionDot(state: ConnectionState): { background: string; text: string } {
  if (state === "connected") return { background: "var(--ok)", text: "Extension connected" };
  if (state === "disconnected") return { background: "var(--warn)", text: "Extension not connected" };
  return { background: "var(--muted)", text: "Checking extension..." };
}

export function LockedInApp({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [softUnlockAt, setSoftUnlockAt] = useState<number | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [startOpen, setStartOpen] = useState(false);
  // Misc task row timers open the same dialog with the misc task pre-targeted
  // (SPEC 8.9); null means the dialog was opened from "Start working".
  const [startMiscTask, setStartMiscTask] = useState<{ id: string; title: string } | null>(null);
  // Row timer buttons pre-select project/task in the start dialog.
  const [startWith, setStartWith] = useState<{ projectId: string | null; taskId: string | null } | null>(null);
  // True right after a session ends, so the main button reads "Start another
  // session" (SPEC 8.4) until a new one starts.
  const [justEnded, setJustEnded] = useState(false);
  // Global "Float timer" toggle (SPEC 8.6), mirrored from the extension.
  const [floatEnabled, setFloatEnabled] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ name: string; style: CelebrationStyle } | null>(null);
  // Pending time study check-in surfaced by getState (SPEC 8.11); null = none.
  const [timeStudyPrompt, setTimeStudyPrompt] = useState<{ id: string } | null>(null);
  const [timeStudySaving, setTimeStudySaving] = useState(false);
  const [timeStudyError, setTimeStudyError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionRef = useRef<ExtensionSession | null>(null);

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

  // Push the project tree to the extension (SPEC 8.17 setTree) so the
  // right-click capture picker works with no dashboard tab open: on load and
  // on every change, because refetchData refreshes this state.
  useEffect(() => {
    if (!data) return;
    void callExtension("setTree", toExtensionTree(data.projects));
  }, [data]);

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
        const state = (reply.data ?? {}) as {
          session?: ExtensionSession | null;
          softUnlockAt?: number | null;
          timeStudyPrompt?: { id: string } | null;
          floatEnabled?: boolean;
        };
        setSession(state.session ?? null);
        setSoftUnlockAt(state.softUnlockAt ?? null);
        setTimeStudyPrompt(state.timeStudyPrompt ?? null);
        if (typeof state.floatEnabled === "boolean") setFloatEnabled(state.floatEnabled);
      }
      setNowMs(Date.now());
    };
    void poll();
    const timer = setInterval(poll, 1000);
    return () => clearInterval(timer);
  }, []);

  // Detect a session that just ended (poll went from a session to null) so
  // the main button offers "Start another session" (SPEC 8.4).
  useEffect(() => {
    const previous = lastSessionRef.current;
    lastSessionRef.current = session;
    if (session) {
      setJustEnded(false);
      return;
    }
    if (previous) setJustEnded(true);
  }, [session]);

  // Sync cycle on load and every 30s; refetch stats when something was saved.
  useEffect(() => {
    let alive = true;
    const cycle = async () => {
      const result = await runSyncCycle();
      if (!alive) return;
      if (!result.ok && result.error) showToast(result.error);
      if (result.savedSessions > 0 || result.savedInfractions > 0 || result.savedTimeStudies > 0) {
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
    async (spec: {
      projectId: string | null;
      taskId: string | null;
      miscTaskId: string | null;
      minutes: number;
      lockMode: LockMode;
    }) => {
      setStartOpen(false);
      // Make sure the extension has the newest block list before locking.
      pushBlockedSites(data.blockedSites.map((site) => site.domain));
      const task = spec.taskId ? data.projects.flatMap((p) => p.tasks).find((t) => t.id === spec.taskId) : null;
      const project = spec.projectId ? data.projects.find((p) => p.id === spec.projectId) : null;
      const miscTask = spec.miscTaskId ? data.miscTasks.find((t) => t.id === spec.miscTaskId) : null;
      const label = miscTask?.title ?? task?.title ?? project?.name ?? "Focus session";
      const reply = await callExtension("startSession", {
        id: crypto.randomUUID(),
        projectId: spec.projectId,
        taskId: spec.taskId,
        miscTaskId: spec.miscTaskId,
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
    [data.blockedSites, data.miscTasks, data.projects, pushBlockedSites, showToast],
  );

  // Row timer buttons (SPEC 8.4): open the start dialog with the project and
  // task (or subtask's parent) pre-selected.
  const startOnTask = useCallback(
    (taskId: string) => {
      for (const project of data.projects) {
        for (const task of project.tasks) {
          if (task.id === taskId) {
            setStartWith({ projectId: project.id, taskId });
            setStartOpen(true);
            return;
          }
          if (task.subtasks.some((sub) => sub.id === taskId)) {
            setStartWith({ projectId: project.id, taskId });
            setStartOpen(true);
            return;
          }
        }
      }
      setStartOpen(true);
    },
    [data.projects],
  );

  const startOnProject = useCallback((projectId: string) => {
    setStartWith({ projectId, taskId: null });
    setStartOpen(true);
  }, []);

  const controlSession = useCallback(
    async (method: "pause" | "resume" | "addTime" | "requestEnd" | "cancelEnd", payload?: unknown) => {
      const reply = await callExtension(method, payload);
      if (!reply.ok) showToast(reply.error);
    },
    [showToast],
  );

  // Global "Float timer" toggle (SPEC 8.6): optimistic, reconciled by the poll.
  const toggleFloat = useCallback(
    async (enabled: boolean) => {
      setFloatEnabled(enabled);
      const reply = await callExtension("setFloat", { enabled });
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
          headers: JSON_HEADERS,
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

  // T2 handlers (SPEC 8.2, 8.3): every mutation posts to its API route and the
  // refetch in apiCall reconciles positions and progress from the database.
  const panelHandlers: ProjectsPanelHandlers = {
    onCreateProject: (name) => {
      void apiCall("/api/projects", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) });
    },
    onRenameProject: (projectId, name) => {
      void apiCall(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
    },
    onUpdateProjectNotes: (projectId, notes) => {
      void apiCall(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ notes }),
      });
    },
    onDeleteProject: (projectId) => {
      void apiCall(`/api/projects/${projectId}`, { method: "DELETE" });
    },
    // Reorder refetches even on failure so a rejected drag does not leave the
    // panel showing an order the database refused.
    onReorder: async (kind, orderedIds) => {
      try {
        const response = await fetch("/api/reorder", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ kind, ids: orderedIds }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          showToast(body.error ?? `Request failed (${response.status})`);
        }
        await refetchData();
      } catch {
        showToast("Network request failed.");
        await refetchData();
      }
    },
    onCreateTask: (projectId, parentId, title) => {
      void apiCall("/api/tasks", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ projectId, parentId, title }),
      });
    },
    onRenameTask: (taskId, title) => {
      void apiCall(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ title }),
      });
    },
    onToggleTask: async (taskId, done) => {
      const projectsBefore = data.projects;
      const ownerBefore = projectOfTask(projectsBefore, taskId);
      const progressBefore = ownerBefore ? projectProgress(ownerBefore) : null;
      const ok = await apiCall(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ done }),
      });
      if (!ok || !done || !ownerBefore || !progressBefore) return;
      // Celebrate when this tick completed the project (SPEC 8.10), judged on
      // the local projection so a race with refetch cannot double-fire it.
      const ownerAfter = projectOfTask(withTaskDone(projectsBefore, taskId, done), taskId);
      if (ownerAfter && shouldCelebrate(progressBefore, projectProgress(ownerAfter))) {
        setCelebration({ name: data.settings.display_name, style: data.settings.completion_style });
      }
    },
    onDeleteTask: (taskId) => {
      void apiCall(`/api/tasks/${taskId}`, { method: "DELETE" });
    },
    onUpdateTaskNotes: (taskId, notes) => {
      void apiCall(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ notes }),
      });
    },
    onStartTask: startOnTask,
    onStartProject: startOnProject,
    // Returns true on success so the links modal closes (design rule: add
    // actions close on success with a toast, stay open on error).
    onAddLink: async (ownerType, ownerId, name, url) => {
      setLinksError(null);
      try {
        const response = await fetch("/api/links", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ ownerType, ownerId, name, url }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setLinksError(payload.error ?? `Request failed (${response.status})`);
          return false;
        }
        showToast("Link added");
        await refetchData();
        return true;
      } catch {
        setLinksError("Network request failed.");
        return false;
      }
    },
    onDeleteLink: (linkId) => {
      void apiCall(`/api/links/${linkId}`, { method: "DELETE" });
    },
  };

  // Open loops (SPEC 8.8): quick-capture items are their own concern, not
  // part of the project tree; the apiCall refetch reconciles counts.
  const createLoop = useCallback(
    (kind: "loop" | "decision", text: string) => {
      void apiCall("/api/open-loops", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ kind, text }),
      });
    },
    [apiCall],
  );

  const deleteLoop = useCallback(
    (loopId: string) => {
      void apiCall(`/api/open-loops/${loopId}`, { method: "DELETE" });
    },
    [apiCall],
  );

  // Misc tasks (SPEC 8.9): one-line items; no notes, no links, never in wind
  // down. Same shape as the other panel handlers: post, then the apiCall
  // refetch reconciles from the database.
  const createMiscTask = useCallback(
    (title: string) => {
      void apiCall("/api/misc-tasks", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title }) });
    },
    [apiCall],
  );

  const toggleMiscTask = useCallback(
    (id: string, done: boolean) => {
      void apiCall(`/api/misc-tasks/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ done }),
      });
    },
    [apiCall],
  );

  const deleteMiscTask = useCallback(
    (id: string) => {
      void apiCall(`/api/misc-tasks/${id}`, { method: "DELETE" });
    },
    [apiCall],
  );

  const reorderMiscTasks = useCallback(
    (orderedIds: string[]) => {
      void apiCall("/api/reorder", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ kind: "misc_tasks", orderedIds }),
      });
    },
    [apiCall],
  );

  const saveSettings = useCallback(
    async (next: { display_name?: string; completion_style?: CelebrationStyle; time_study_minutes?: number | null }) => {
      setSettingsError(null);
      try {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify(next),
        });
        const payload = (await response.json().catch(() => ({}))) as { settings?: SettingsData; error?: string };
        if (!response.ok) {
          setSettingsError(payload.error ?? `Request failed (${response.status})`);
          return false;
        }
        if (payload.settings) {
          const saved = payload.settings;
          setData((prev) => ({ ...prev, settings: saved }));
          showToast("Settings saved");
        }
        return true;
      } catch {
        setSettingsError("Network request failed.");
        return false;
      }
    },
    [showToast],
  );

  // Time study interval (SPEC 8.11): persist the setting, then tell the
  // extension so its chrome.alarms schedule follows immediately.
  const changeTimeStudyInterval = useCallback(
    async (minutes: number | null) => {
      const saved = await saveSettings({ time_study_minutes: minutes });
      if (saved) {
        const reply = await callExtension("setTimeStudy", { minutes });
        if (!reply.ok) showToast(reply.error);
      }
    },
    [saveSettings, showToast],
  );

  // A check-in answer queues in the extension; flush right away so today's
  // list updates without waiting for the 30s sync cycle.
  const answerTimeStudy = useCallback(
    async (text: string) => {
      setTimeStudySaving(true);
      setTimeStudyError(null);
      const reply = await callExtension("answerTimeStudy", { text });
      if (!reply.ok) {
        setTimeStudySaving(false);
        setTimeStudyError(reply.error);
        return;
      }
      setTimeStudyPrompt(null);
      setTimeStudySaving(false);
      const result = await runSyncCycle();
      if (!result.ok && result.error) {
        showToast(result.error);
        return;
      }
      await refetchData();
      showToast("Check-in saved");
    },
    [refetchData, showToast],
  );

  const dot = connectionDot(connection);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1760px] flex-col gap-6 px-[clamp(16px,2.6vw,40px)] py-6">
      <header className="sticky top-0 z-10 -mx-[clamp(16px,2.6vw,40px)] flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-[clamp(16px,2.6vw,40px)] py-3 backdrop-blur">
        <span className="text-lg font-semibold text-[var(--fg)]">LockedIn</span>
        <span className="hidden text-sm text-[var(--muted)] sm:inline">
          Welcome back, {data.settings.display_name}
        </span>
        <span
          className="ml-auto flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-xs"
          style={{ color: dot.background }}
        >
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: dot.background }} />
          {dot.text}
        </span>
        <ProfileMenu settings={data.settings} error={settingsError} onSave={saveSettings} />
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
            <SessionPanel
              session={session}
              nowMs={nowMs}
              softUnlockAtMs={softUnlockAt}
              floatEnabled={floatEnabled}
              onToggleFloat={toggleFloat}
              onControl={controlSession}
              onManualInfraction={addManualInfraction}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setJustEnded(false);
                setStartWith(null);
                setStartMiscTask(null);
                setStartOpen(true);
              }}
              disabled={connection === "disconnected"}
              className="rounded-md px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {justEnded ? "Start another session" : "Start working"}
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
          handlers={panelHandlers}
          addLinkError={linksError}
          sessionActive={session !== null}
        />

        <div className="flex flex-col gap-4">
          <MiscTasksPanel
            miscTasks={data.miscTasks}
            startDisabled={session !== null}
            onCreate={createMiscTask}
            onToggle={toggleMiscTask}
            onDelete={deleteMiscTask}
            onReorder={reorderMiscTasks}
            onStart={(id) => {
              const task = data.miscTasks.find((t) => t.id === id);
              if (task) {
                setStartMiscTask({ id: task.id, title: task.title });
                setStartOpen(true);
              }
            }}
          />
          <OpenLoopsPanel loops={data.openLoops} onCreate={createLoop} onDelete={deleteLoop} />
          <TimeStudyPanel
            entries={data.todayTimeStudies}
            intervalMinutes={data.settings.time_study_minutes}
            onChangeInterval={(minutes) => void changeTimeStudyInterval(minutes)}
          />
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
          <NotesPanel
            projects={data.projects}
            onAttached={() => {
              showToast("Snippet attached");
              void refetchData();
            }}
          />
          <OrganizeModal
            projects={data.projects}
            miscTasks={data.miscTasks}
            onToast={showToast}
            onChanged={() => void refetchData()}
            onStartItem={(item) => {
              // Existing dialog only pre-targets misc items; task targeting
              // lands with T3's row timer work (SPEC 8.4).
              if (item.kind === "misc") setStartMiscTask({ id: item.id, title: item.title });
              setStartOpen(true);
            }}
          />
          <StuckModal
            projects={data.projects}
            onToast={showToast}
            onChanged={() => void refetchData()}
            onStartTask={(taskId) => {
              // Same handoff the organize flow uses: pre-target the existing
              // start dialog; with no task picked, open it clean.
              setStartMiscTask(null);
              if (taskId) startOnTask(taskId);
              else setStartWith(null);
              setStartOpen(true);
            }}
          />
        </div>
      </div>

      {startOpen && (
        <StartSessionDialog
          projects={data.projects}
          miscTask={startMiscTask}
          initialProjectId={startWith?.projectId ?? null}
          initialTaskId={startWith?.taskId ?? null}
          onClose={() => {
            setStartOpen(false);
            setStartWith(null);
            setStartMiscTask(null);
          }}
          onStart={(spec) => void startSession(spec)}
        />
      )}

      {celebration && (
        <CelebrationOverlay name={celebration.name} style={celebration.style} onClose={() => setCelebration(null)} />
      )}

      {timeStudyPrompt && (
        <TimeStudyPromptCard
          prompt={timeStudyPrompt}
          onSave={(text) => void answerTimeStudy(text)}
          saving={timeStudySaving}
          error={timeStudyError}
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

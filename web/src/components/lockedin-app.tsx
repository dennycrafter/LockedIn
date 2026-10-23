"use client";

// Dashboard root (T1 + T2): wires the bridge lifecycle to the panels. The
// extension owns the live session; this component polls getState every second,
// pings for connection status, and runs the drain/save/ack sync cycle on load
// and every 30 seconds (SPEC 8.17). T2 adds the full tree handlers, links,
// settings, and the completion celebration (SPEC 8.2, 8.3, 8.10).
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callExtension } from "@/lib/bridge-client";
import type { CelebrationStyle, DashboardData, HelperMode, SettingsData } from "@/lib/dashboard-data";
import type { ExtensionSession, LockMode } from "@/lib/extension-session";
import { shouldCelebrate } from "@/lib/celebration";
import { projectOfTask, projectProgress, withTaskDone } from "@/lib/tree";
import { runSyncCycle } from "@/lib/sync-cycle";
import { UNDO_WINDOW_MS, hidePending, undoLabel } from "@/lib/pending-delete";
import { toExtensionTree } from "@/lib/extension-tree";
import { BlockedSitesPanel } from "./blocked-sites-panel";
import { BoardView } from "./board-view";
import { CelebrationOverlay } from "./celebration-overlay";
import EodSection from "./EodPreviewModal";
import { ChevronIcon } from "./icons";
import { Modal } from "./modal";
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
import { ThemeToggle } from "./theme-toggle";
import { TimeStudyPromptCard } from "./time-study-prompt";
import { PlanPanel } from "./tomorrow-plan-panel";
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, CARD, CARD_TITLE, RowMenu, TOAST } from "./ui";
import WindDownSection from "./wind-down-modal";

type ConnectionState = "checking" | "connected" | "disconnected";

// Top bar sections (Oct 2026). The Board lives at #board so a refresh or the
// back button keeps you where you were.
type View = "today" | "board";
const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: "today", label: "Today" },
  { id: "board", label: "Board" },
];

function viewFromHash(): View {
  return window.location.hash === "#board" ? "board" : "today";
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// One accent button per screen ("Start working"), the rest neutral.
const WIDE_BUTTON = `${BTN_SECONDARY} w-full`;
const GUTTER = "px-[clamp(16px,2.6vw,40px)]";

type ToastState = { message: string; action?: { label: string; onClick: () => void } };
type PendingDelete = { timer: ReturnType<typeof setTimeout>; url: string };

function connectionDot(state: ConnectionState): { background: string; text: string } {
  if (state === "connected") return { background: "var(--ok)", text: "Extension connected" };
  if (state === "disconnected") return { background: "var(--warn)", text: "Extension not connected" };
  return { background: "var(--muted)", text: "Checking extension..." };
}

export function LockedInApp({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [section, setSection] = useState<View>("today");
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
  const [toast, setToast] = useState<ToastState | null>(null);
  // Deletes wait out an undo window before they reach the database; their ids
  // stay hidden from every panel meanwhile (UI polish, Oct 2026).
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef<Map<string, PendingDelete>>(new Map());
  // Tools menu opens these windows by bumping a counter.
  const [organizeRequest, setOrganizeRequest] = useState(0);
  const [stuckRequest, setStuckRequest] = useState(0);
  const connectionRef = useRef<ConnectionState>("checking");
  // Top bar tools that open in a floating window.
  const [tool, setTool] = useState<"sites" | "study" | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  // SPEC 8.15: whether the Anthropic key is configured, from the server's
  // computed GET /api/settings flag (the browser cannot read env vars).
  const [aiAvailable, setAiAvailable] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ name: string; style: CelebrationStyle } | null>(null);
  // Pending time study check-in surfaced by getState (SPEC 8.11); null = none.
  const [timeStudyPrompt, setTimeStudyPrompt] = useState<{ id: string } | null>(null);
  const [timeStudySaving, setTimeStudySaving] = useState(false);
  const [timeStudyError, setTimeStudyError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSessionRef = useRef<ExtensionSession | null>(null);

  useEffect(() => {
    const sync = () => setSection(viewFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const openView = useCallback((next: View) => {
    setSection(next);
    const url = next === "board" ? "#board" : `${window.location.pathname}${window.location.search}`;
    window.history.pushState(null, "", url);
  }, []);

  const showToast = useCallback((message: string, action?: ToastState["action"]) => {
    setToast({ message, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? UNDO_WINDOW_MS : 4000);
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
      if (!alive) return;
      const next: ConnectionState = reply.ok ? "connected" : "disconnected";
      connectionRef.current = next;
      setConnection(next);
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
      // While the extension is not connected the banner already says so; a
      // toast with the same news every 30 seconds would only repeat it.
      if (!result.ok && result.error && connectionRef.current !== "disconnected") showToast(result.error);
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

  // Delete with undo: hide now, send the DELETE when the undo window closes.
  const scheduleDelete = useCallback(
    (id: string, name: string, url: string) => {
      const pending = pendingRef.current;
      const existing = pending.get(id);
      if (existing) clearTimeout(existing.timer);
      setHiddenIds((prev) => new Set(prev).add(id));
      const unhide = () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      const timer = setTimeout(() => {
        pending.delete(id);
        void apiCall(url, { method: "DELETE" }).then(unhide);
      }, UNDO_WINDOW_MS);
      pending.set(id, { timer, url });
      showToast(undoLabel(name), {
        label: "Undo",
        onClick: () => {
          const entry = pending.get(id);
          if (!entry) return;
          clearTimeout(entry.timer);
          pending.delete(id);
          unhide();
          setToast(null);
        },
      });
    },
    [apiCall, showToast],
  );

  // Closing the tab mid-window still deletes: keepalive lets the request finish.
  useEffect(() => {
    const flush = () => {
      for (const [id, entry] of pendingRef.current) {
        clearTimeout(entry.timer);
        void fetch(entry.url, { method: "DELETE", keepalive: true }).catch(() => undefined);
        pendingRef.current.delete(id);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  const view = useMemo(() => hidePending(data, hiddenIds), [data, hiddenIds]);

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
      const name = data.projects.find((project) => project.id === projectId)?.name ?? "project";
      scheduleDelete(projectId, name, `/api/projects/${projectId}`);
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
      const all = data.projects.flatMap((project) => project.tasks.flatMap((task) => [task, ...task.subtasks]));
      const name = all.find((task) => task.id === taskId)?.title ?? "task";
      scheduleDelete(taskId, name, `/api/tasks/${taskId}`);
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
      const name = data.openLoops.find((loop) => loop.id === loopId)?.text ?? "open loop";
      scheduleDelete(loopId, name, `/api/open-loops/${loopId}`);
    },
    [data.openLoops, scheduleDelete],
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
      const name = data.miscTasks.find((task) => task.id === id)?.title ?? "misc task";
      scheduleDelete(id, name, `/api/misc-tasks/${id}`);
    },
    [data.miscTasks, scheduleDelete],
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

  // SPEC 8.15: the settings toggle needs the server's computed key-presence
  // flag; fetched once on mount because the browser cannot read env vars.
  // On failure the toggle stays in its safe scripted-only state until reload.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { aiAvailable?: boolean } | null) => {
        if (!cancelled && payload?.aiAvailable) setAiAvailable(true);
      })
      .catch(() => {
        // Degrade to scripted-only; no dashboard surface reports a settings
        // fetch failure and the AI opt-ins inside the modals still work.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSettings = useCallback(
    async (next: {
      display_name?: string;
      completion_style?: CelebrationStyle;
      helper_mode?: HelperMode;
      time_study_minutes?: number | null;
    }) => {
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
  const sessionProject = session?.projectId ? (data.projects.find((p) => p.id === session.projectId)?.name ?? null) : null;

  const startButton = (
    <button
      type="button"
      onClick={() => {
        setJustEnded(false);
        setStartWith(null);
        setStartMiscTask(null);
        setStartOpen(true);
      }}
      disabled={connection === "disconnected"}
      title={connection === "disconnected" ? "Connect the extension to start a session" : undefined}
      // With no projects yet, "Create a project" is the main action, so this one steps back.
      className={`${data.projects.length === 0 ? BTN_SECONDARY : BTN_PRIMARY} w-full py-2.5`}
    >
      {justEnded ? "Start another session" : "Start working"}
    </button>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--line)]">
        {/* The frosted layer sits behind the bar, not on it: a blur on the bar itself would trap the pop-up windows inside it. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur"
        />
        <div className={`mx-auto flex h-14 max-w-[1760px] items-center gap-2 sm:h-16 ${GUTTER}`}>
          <span className="flex items-center gap-2.5 text-[17px] font-semibold text-[var(--fg)]">
            {/* Brand mark: the pink eyes icon, same file as the favicon. */}
            <Image src="/icon.png" alt="" width={32} height={32} priority className="h-8 w-8 shrink-0 rounded-[6px] sm:h-[34px] sm:w-[34px]" />
            <span className="hidden sm:inline">LockedIn</span>
          </span>
          {/* Section tabs: white underline on the active one (design rules). */}
          <nav aria-label="Sections" className="ml-3 flex h-full items-stretch gap-1 sm:ml-6 sm:gap-2">
            {VIEWS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => openView(item.id)}
                  className={`relative px-2 text-sm font-medium transition-colors ${
                    active ? "text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {item.label}
                  {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--fg)]" />}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* Wrapped so "hidden" is not overridden by the button's own display class. On phones it lives in Tools. */}
            <span className="hidden sm:block">
              <button type="button" onClick={() => setStuckRequest((n) => n + 1)} className={BTN_QUIET}>
                I&apos;m stuck
              </button>
            </span>
            <RowMenu
              label="Tools"
              buttonClassName={`${BTN_QUIET} text-[var(--fg)]`}
              buttonContent={
                <>
                  Tools
                  <ChevronIcon size={14} className="rotate-90 text-[var(--muted)]" />
                </>
              }
              items={[
                { label: "Organize my task list", onSelect: () => setOrganizeRequest((n) => n + 1) },
                { label: "I'm stuck, help me start", onSelect: () => setStuckRequest((n) => n + 1) },
                { label: "Time study", onSelect: () => setTool("study") },
                { label: "Edit blocked sites", onSelect: () => setTool("sites") },
              ]}
            />
            <ThemeToggle />
            <span className="ml-1 sm:ml-2">
              <ProfileMenu
                settings={data.settings}
                aiAvailable={aiAvailable}
                error={settingsError}
                onSave={saveSettings}
                align="right"
                statusColor={dot.background}
                statusText={dot.text}
              />
            </span>
          </div>
        </div>
      </header>

      <OrganizeModal
        trigger="none"
        openRequest={organizeRequest}
        projects={data.projects}
        miscTasks={data.miscTasks}
        initialMode={data.settings.helper_mode}
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
        trigger="none"
        openRequest={stuckRequest}
        projects={data.projects}
        initialMode={data.settings.helper_mode}
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

      {section === "board" && <BoardView />}

      <main
        hidden={section === "board"}
        className={`mx-auto flex max-w-[1760px] flex-col gap-5 pb-10 pt-5 sm:gap-6 sm:pt-6 ${GUTTER}`}
      >
        {connection === "disconnected" && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[color-mix(in_srgb,var(--warn)_35%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_6%,var(--surface))] px-4 py-3 text-sm"
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--warn)]" />
            <span className="font-medium text-[var(--fg)]">The extension is not connected.</span>
            <span className="text-[var(--muted)]">
              Sessions and blocking are off. Open the LockedIn extension and check its Dashboard URL.
            </span>
          </div>
        )}

        {session && (
          <SessionPanel
            session={session}
            projectName={sessionProject}
            nowMs={nowMs}
            softUnlockAtMs={softUnlockAt}
            floatEnabled={floatEnabled}
            onToggleFloat={toggleFloat}
            onControl={controlSession}
            onManualInfraction={addManualInfraction}
          />
        )}

        <StatsStrip
          sessions={data.todaySessions}
          infractions={data.todayInfractions}
          projects={data.projects}
          liveSession={session}
          nowMs={nowMs}
          startSlot={session ? null : startButton}
        />

        {/* Desktop: Projects on the left, Evening then the plan on the right.
            Phones: the plan comes first, then Projects, then Evening. */}
        <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr]">
          <div className="order-2 min-w-0 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <ProjectsPanel
              projects={view.projects}
              handlers={panelHandlers}
              addLinkError={linksError}
              sessionActive={session !== null}
            />
          </div>

          <section aria-label="Evening" className={`${CARD} order-3 lg:order-none lg:col-start-2 lg:row-start-1`}>
            <h2 className={CARD_TITLE}>Evening</h2>
            <p className="mt-0.5 text-[13px] text-[var(--muted)]">Wind down sets up tomorrow. Send EOD emails your day.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <WindDownSection buttonClassName={WIDE_BUTTON} />
              <EodSection buttonClassName={WIDE_BUTTON} />
            </div>
          </section>

          <div className="order-1 min-w-0 lg:order-none lg:col-start-2 lg:row-start-2">
            <PlanPanel
              startDisabled={session !== null}
              onToggleTask={panelHandlers.onToggleTask}
              onStartTask={startOnTask}
              onPlanCompleted={() =>
                setCelebration((prev) => prev ?? { name: data.settings.display_name, style: data.settings.completion_style })
              }
              miscTasks={view.miscTasks}
              onCreateMisc={createMiscTask}
              onToggleMisc={toggleMiscTask}
              onDeleteMisc={deleteMiscTask}
              onReorderMisc={reorderMiscTasks}
              onStartMisc={(id) => {
                const task = data.miscTasks.find((t) => t.id === id);
                if (task) {
                  setStartMiscTask({ id: task.id, title: task.title });
                  setStartOpen(true);
                }
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 sm:gap-6 lg:grid-cols-2">
          <NotesPanel
            projects={data.projects}
            onAttached={() => {
              showToast("Snippet attached");
              void refetchData();
            }}
          />
          <OpenLoopsPanel loops={view.openLoops} onCreate={createLoop} onDelete={deleteLoop} />
        </div>
      </main>

      {tool === "sites" && (
        <Modal title="Edit blocked sites" onClose={() => setTool(null)}>
          <BlockedSitesPanel
            bare
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
        </Modal>
      )}

      {tool === "study" && (
        <Modal title="Time study" onClose={() => setTool(null)}>
          <TimeStudyPanel
            bare
            entries={data.todayTimeStudies}
            intervalMinutes={data.settings.time_study_minutes}
            onChangeInterval={(minutes) => void changeTimeStudyInterval(minutes)}
          />
        </Modal>
      )}

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
        <div role="status" className={TOAST}>
          <span className="min-w-0 truncate">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="-my-1 shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-[var(--fg)] underline decoration-[var(--muted)] underline-offset-4 hover:bg-[var(--line)]"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

import type { LockMode } from "./messages";

// Re-exported so the popup and tests can share the one definition.
export type { LockMode };

// Live session state owned by the extension (SPEC 4): it lives only in
// chrome.storage.local so locks survive service worker restarts and a closed
// dashboard tab. All times are epoch milliseconds.

export interface ActiveSession {
  id: string;
  projectId: string | null;
  taskId: string | null;
  miscTaskId: string | null;
  label: string;
  lockMode: LockMode;
  plannedSeconds: number;
  addedSeconds: number;
  startedAtMs: number;
  endAtMs: number;
  pausedAtMs: number | null;
  pausedTotalMs: number;
}

// Completed session queued for the database (SPEC 6 sessions table).
export interface CompletedSession {
  id: string;
  projectId: string | null;
  taskId: string | null;
  miscTaskId: string | null;
  label: string;
  lockMode: LockMode;
  plannedSeconds: number;
  addedSeconds: number;
  activeSeconds: number;
  startedAt: string; // ISO
  endedAt: string; // ISO
}

export function isBlocking(lockMode: LockMode): boolean {
  return lockMode !== "none";
}

/** Time left: frozen at the pause instant while paused (SPEC 8.4). */
export function remainingMs(session: ActiveSession, nowMs: number): number {
  const reference = session.pausedAtMs ?? nowMs;
  return Math.max(0, session.endAtMs - reference);
}

/** Timer digits: h:mm:ss above an hour, otherwise m:ss. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? hours + ":" + mm + ":" + ss : mm + ":" + ss;
}

/**
 * Focused seconds excluding paused time (SPEC 8.4). Ending late can never
 * count past the planned end: hard lock ends exactly at endAtMs, so any
 * endedAt after that is capped there.
 */
export function computeActiveSeconds(session: ActiveSession, endedAtMs: number): number {
  const end = Math.min(endedAtMs, session.endAtMs);
  const openPause = session.pausedAtMs !== null ? Math.max(0, end - session.pausedAtMs) : 0;
  const activeMs = end - session.startedAtMs - session.pausedTotalMs - openPause;
  return Math.max(0, Math.floor(activeMs / 1000));
}

export function toCompletedSession(session: ActiveSession, endedAtMs: number): CompletedSession {
  return {
    id: session.id,
    projectId: session.projectId,
    taskId: session.taskId,
    miscTaskId: session.miscTaskId,
    label: session.label,
    lockMode: session.lockMode,
    plannedSeconds: session.plannedSeconds,
    addedSeconds: session.addedSeconds,
    activeSeconds: computeActiveSeconds(session, endedAtMs),
    startedAt: new Date(session.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

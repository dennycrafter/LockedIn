// Client-side mirror of the extension's ActiveSession (SPEC 8.17 getState):
// field names must match chrome.storage.local, not the database columns.
export type LockMode = "none" | "soft" | "hard";

export interface ExtensionSession {
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

/** Time left: frozen at the pause instant while paused (SPEC 8.4). */
export function sessionRemainingMs(session: ExtensionSession, nowMs: number): number {
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
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Shared types for the dashboard <-> extension bridge (SPEC 8.17). The
// dashboard posts { source: "lockedin-dashboard", id, method, payload } to the
// page; the content script forwards { type: "bridge", method, payload } to the
// service worker and posts the reply back as
// { source: "lockedin-extension", id, payload }.

export type LockMode = "none" | "soft" | "hard";

export type BridgeMethod =
  | "ping"
  | "setBlockedSites"
  | "startSession"
  | "getState"
  | "drainQueue"
  | "ackQueue";

export interface StartSessionPayload {
  id: string;
  projectId?: string | null;
  taskId?: string | null;
  miscTaskId?: string | null;
  label?: string;
  lockMode: LockMode;
  plannedSeconds: number;
}

export interface StatePayload {
  session: import("./session").ActiveSession | null;
  softUnlockAt: number | null;
}

export interface DrainPayload {
  sessions: import("./session").CompletedSession[];
  infractions: import("./queue").QueuedInfraction[];
}

// Reply envelope used both by the service worker to the content script and by
// the content script to the dashboard.
export type BridgeResponse = { ok: true; data?: unknown } | { ok: false; error: string };

// Envelope the content script sends to the service worker.
export interface WorkerRequest {
  type: "bridge";
  method: BridgeMethod;
  payload?: unknown;
}

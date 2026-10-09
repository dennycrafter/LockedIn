// Shared types for the dashboard <-> extension bridge (SPEC 8.17). The
// dashboard posts { source: "lockedin-dashboard", id, method, payload } to the
// page; the content script forwards { type: "bridge", method, payload } to the
// service worker and posts the reply back as
// { source: "lockedin-extension", id, payload }.

export type LockMode = "none" | "soft" | "hard";

export type BridgeMethod =
  | "ping"
  | "setBlockedSites"
  | "setTree"
  | "startSession"
  | "getState"
  | "pause"
  | "resume"
  | "addTime"
  | "requestEnd"
  | "cancelEnd"
  | "setFloat"
  | "addManualInfraction"
  | "drainQueue"
  | "ackQueue"
  | "setTimeStudy"
  | "answerTimeStudy";

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
  /** Deadline of the soft lock's 2 minute end countdown, epoch ms. */
  softUnlockAt: number | null;
  /** Check-in interval, null = off (SPEC 8.11). */
  timeStudyMinutes: number | null;
  /** Unanswered check-in; the dashboard shows the prompt for it. */
  timeStudyPrompt: import("./storage").TimeStudyPrompt | null;
  /** Global "Float timer" toggle (SPEC 8.6). */
  floatEnabled: boolean;
}

export interface DrainPayload {
  sessions: import("./session").CompletedSession[];
  infractions: import("./queue").QueuedInfraction[];
  snippets: import("./queue").QueuedSnippet[];
  timeStudies: import("./queue").QueuedTimeStudy[];
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

import type { QueueState } from "./queue";
import type { ActiveSession } from "./session";
import type { TreeState } from "./tree";

// Typed chrome.storage.local access (SPEC 12: MV3 workers sleep, so every
// read goes back to storage, never to module state).

const KEY_SESSION = "session";
const KEY_BLOCKED_SITES = "blockedSites";
const KEY_DASHBOARD_ORIGIN = "dashboardOrigin";
const KEY_QUEUE = "queue";
const KEY_TREE = "tree";
const KEY_SOFT_UNLOCK = "softUnlockAt";
const KEY_TIME_STUDY_MINUTES = "timeStudyMinutes";
const KEY_TIME_STUDY_PROMPT = "timeStudyPrompt";
const KEY_FLOAT_ENABLED = "floatEnabled";
const KEY_FLOAT_POSITION = "floatPosition";
const KEY_FLOAT_HIDDEN_FOR = "floatHiddenFor";

async function getValue<T>(key: string): Promise<T | undefined> {
  const bag = await chrome.storage.local.get(key);
  return bag[key] as T | undefined;
}

async function setValue(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getActiveSession(): Promise<ActiveSession | null> {
  return (await getValue<ActiveSession>(KEY_SESSION)) ?? null;
}

export async function setActiveSession(session: ActiveSession | null): Promise<void> {
  await setValue(KEY_SESSION, session);
}

export async function getBlockedSites(): Promise<string[]> {
  return (await getValue<string[]>(KEY_BLOCKED_SITES)) ?? [];
}

export async function setBlockedSites(domains: string[]): Promise<void> {
  await setValue(KEY_BLOCKED_SITES, domains);
}

export async function getDashboardOrigin(): Promise<string | null> {
  return (await getValue<string>(KEY_DASHBOARD_ORIGIN)) ?? null;
}

export async function setDashboardOrigin(origin: string): Promise<void> {
  await setValue(KEY_DASHBOARD_ORIGIN, origin);
}

export async function getQueue(): Promise<QueueState> {
  const stored = await getValue<Partial<QueueState>>(KEY_QUEUE);
  // Queues stored before snippets or time studies existed lack those fields;
  // normalize so every reader sees a full QueueState.
  return {
    sessions: stored?.sessions ?? [],
    infractions: stored?.infractions ?? [],
    snippets: stored?.snippets ?? [],
    timeStudies: stored?.timeStudies ?? [],
  };
}

export async function setQueue(queue: QueueState): Promise<void> {
  await setValue(KEY_QUEUE, queue);
}

// The dashboard pushes the project/task/subtask tree through the bridge so
// the right-click capture picker works even when no dashboard tab is open.
export async function getTree(): Promise<TreeState | null> {
  return (await getValue<TreeState>(KEY_TREE)) ?? null;
}

export async function setTree(tree: TreeState): Promise<void> {
  await setValue(KEY_TREE, tree);
}

/** Deadline of the soft lock's 2 minute end countdown; null when not ending. */
export async function getSoftUnlockAt(): Promise<number | null> {
  return (await getValue<number>(KEY_SOFT_UNLOCK)) ?? null;
}

export async function setSoftUnlockAt(softUnlockAtMs: number | null): Promise<void> {
  await setValue(KEY_SOFT_UNLOCK, softUnlockAtMs);
}

// --- time study (SPEC 8.11) ------------------------------------------------

export interface TimeStudyPrompt {
  id: string;
  at: number; // epoch ms, when the alarm fired
}

export async function getTimeStudyMinutes(): Promise<number | null> {
  const value = await getValue<number | null>(KEY_TIME_STUDY_MINUTES);
  return value ?? null;
}

export async function setTimeStudyMinutes(minutes: number | null): Promise<void> {
  await setValue(KEY_TIME_STUDY_MINUTES, minutes);
}

export async function getTimeStudyPrompt(): Promise<TimeStudyPrompt | null> {
  return (await getValue<TimeStudyPrompt>(KEY_TIME_STUDY_PROMPT)) ?? null;
}

export async function setTimeStudyPrompt(prompt: TimeStudyPrompt | null): Promise<void> {
  await setValue(KEY_TIME_STUDY_PROMPT, prompt);

}

/** Global "Float timer" toggle from the dashboard; on by default (SPEC 8.6). */
export async function getFloatEnabled(): Promise<boolean> {
  return (await getValue<boolean>(KEY_FLOAT_ENABLED)) ?? true;
}

export async function setFloatEnabled(enabled: boolean): Promise<void> {
  await setValue(KEY_FLOAT_ENABLED, enabled);
}

/** Last drag position of the floating timer, top-left corner in px. */
export async function getFloatPosition(): Promise<{ x: number; y: number } | null> {
  return (await getValue<{ x: number; y: number }>(KEY_FLOAT_POSITION)) ?? null;
}

export async function setFloatPosition(position: { x: number; y: number }): Promise<void> {
  await setValue(KEY_FLOAT_POSITION, position);
}

/** Session id the user hid the float for; a new session shows it again. */
export async function getFloatHiddenFor(): Promise<string | null> {
  return (await getValue<string>(KEY_FLOAT_HIDDEN_FOR)) ?? null;
}

export async function setFloatHiddenFor(sessionId: string | null): Promise<void> {
  await setValue(KEY_FLOAT_HIDDEN_FOR, sessionId);
}

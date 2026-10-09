import type { QueueState } from "./queue";
import { emptyQueue } from "./queue";
import type { ActiveSession } from "./session";
import type { TreeState } from "./tree";

// Typed chrome.storage.local access (SPEC 12: MV3 workers sleep, so every
// read goes back to storage, never to module state).

const KEY_SESSION = "session";
const KEY_BLOCKED_SITES = "blockedSites";
const KEY_DASHBOARD_ORIGIN = "dashboardOrigin";
const KEY_QUEUE = "queue";
const KEY_TREE = "tree";

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
  // Queues stored before snippets existed lack the field; normalize so every
  // reader sees a full QueueState.
  return { ...emptyQueue(), ...stored, snippets: stored?.snippets ?? [] };
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

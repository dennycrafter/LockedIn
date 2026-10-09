import type { QueueState } from "./queue";
import { emptyQueue } from "./queue";
import type { ActiveSession } from "./session";

// Typed chrome.storage.local access (SPEC 12: MV3 workers sleep, so every
// read goes back to storage, never to module state).

const KEY_SESSION = "session";
const KEY_BLOCKED_SITES = "blockedSites";
const KEY_DASHBOARD_ORIGIN = "dashboardOrigin";
const KEY_QUEUE = "queue";

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
  return (await getValue<QueueState>(KEY_QUEUE)) ?? emptyQueue();
}

export async function setQueue(queue: QueueState): Promise<void> {
  await setValue(KEY_QUEUE, queue);
}

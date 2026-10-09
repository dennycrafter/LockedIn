// LockedIn service worker: owns live session state and answers bridge
// commands from the content script. MV3 workers sleep, so every read and
// write goes through chrome.storage.local, timers are chrome.alarms, and all
// mutating handlers run inside one promise-chain lock so two woken messages
// can never interleave (SPEC 4, SPEC 12).

import { ackQueue, drainQueue, enqueueSession, queueIds } from "./lib/queue";
import { isUuid, toCompletedSession, type ActiveSession } from "./lib/session";
import { applyBlockingRules, clearBlockingRules, isBlockingSession } from "./lib/blocking";
import { sanitizeTree, type TreeState } from "./lib/tree";
import {
  getActiveSession,
  getBlockedSites,
  getQueue,
  setActiveSession,
  setBlockedSites,
  setQueue,
  setTree,
} from "./lib/storage";
import { normalizeHostname } from "./lib/hostname";
import type { BridgeResponse, LockMode, WorkerRequest } from "./lib/messages";

const SESSION_END_ALARM = "lockedin-session-end";
const MAX_PLANNED_SECONDS = 180 * 60; // custom sessions top out at 3 hours (SPEC 8.4)
const LOCK_MODES: LockMode[] = ["none", "soft", "hard"];
const CONTEXT_MENU_ID = "lockedin-add-to-notes";
const MAX_CAPTURE_CHARS = 5000; // selectionText cap for the picker window URL

// --- bridge plumbing -------------------------------------------------------

function ok(data?: unknown): BridgeResponse {
  return { ok: true, data };
}

function fail(error: string): BridgeResponse {
  return { ok: false, error };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// Serializes every handler: while one awaits storage or alarms, later
// messages wait instead of reading stale state mid-way.
let stateLock: Promise<unknown> = Promise.resolve();
function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = stateLock.then(fn);
  stateLock = run.catch(() => undefined);
  return run;
}

// --- session lifecycle -----------------------------------------------------

async function handleStartSession(payload: unknown): Promise<BridgeResponse> {
  const body = asRecord(payload);
  if (!body) return fail("startSession needs a payload.");
  if (typeof body.id !== "string" || !isUuid(body.id)) return fail("Session id must be a uuid.");
  const lockMode = body.lockMode;
  if (typeof lockMode !== "string" || !LOCK_MODES.includes(lockMode as LockMode)) {
    return fail("Lock mode must be none, soft or hard.");
  }
  const plannedSeconds = body.plannedSeconds;
  if (
    typeof plannedSeconds !== "number" ||
    !Number.isInteger(plannedSeconds) ||
    plannedSeconds < 1 ||
    plannedSeconds > MAX_PLANNED_SECONDS
  ) {
    return fail("Session length must be between 1 second and 3 hours.");
  }
  const existing = await getActiveSession();
  if (existing) return fail("A session is already running. It has to end before another starts.");

  const nowMs = Date.now();
  const session: ActiveSession = {
    id: body.id,
    projectId: typeof body.projectId === "string" ? body.projectId : null,
    taskId: typeof body.taskId === "string" ? body.taskId : null,
    miscTaskId: typeof body.miscTaskId === "string" ? body.miscTaskId : null,
    label: typeof body.label === "string" ? body.label.slice(0, 200) : "",
    lockMode: lockMode as LockMode,
    plannedSeconds,
    addedSeconds: 0,
    startedAtMs: nowMs,
    endAtMs: nowMs + plannedSeconds * 1000,
    pausedAtMs: null,
    pausedTotalMs: 0,
  };
  await setActiveSession(session);
  await chrome.alarms.create(SESSION_END_ALARM, { when: session.endAtMs });
  return ok({ session });
}

// Queues the completed session, drops the alarm and unblocks (SPEC 8.4). The
// soft lock's 2 minute tail arrives in T3; until then a soft session ends
// immediately on request.
async function endSession(nowMs: number): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;
  const endedAtMs = Math.min(nowMs, session.endAtMs);
  const queue = await getQueue();
  await setQueue(enqueueSession(queue, toCompletedSession(session, endedAtMs)));
  await setActiveSession(null);
  await chrome.alarms.clear(SESSION_END_ALARM);
}

async function handleRequestEnd(): Promise<BridgeResponse> {
  const session = await getActiveSession();
  if (!session) return fail("No session is running.");
  if (session.lockMode === "hard") {
    return fail("Hard lock: the session ends when the timer reaches zero.");
  }
  await endSession(Date.now());
  return ok({ ended: true });
}

// The alarm may fire late or be missed while the worker sleeps, so every
// incoming message also checks for an expired session.
async function checkExpiredSession(): Promise<void> {
  const session = await getActiveSession();
  if (session && session.pausedAtMs === null && Date.now() >= session.endAtMs) {
    await endSession(session.endAtMs);
  }
}

// Keeps DNR rules in sync with (active session, blocked sites): install the
// per-domain redirects while a soft/hard session runs, remove them otherwise.
async function reassertBlocking(): Promise<void> {
  const [session, domains] = await Promise.all([getActiveSession(), getBlockedSites()]);
  if (isBlockingSession(session)) {
    await applyBlockingRules(domains);
  } else {
    await clearBlockingRules();
  }
}

// --- bridge dispatch -------------------------------------------------------

async function handle(method: string, payload: unknown): Promise<BridgeResponse> {
  return withStateLock(async () => {
    // The alarm may fire late or be missed while the worker sleeps, so every
    // message also checks for an expired session before acting.
    await checkExpiredSession();
    const response = await route(method, payload);
    // State may have changed above; make the DNR rules match it.
    await reassertBlocking();
    return response;
  });
}

async function route(method: string, payload: unknown): Promise<BridgeResponse> {
  switch (method) {
    case "ping":
      return ok({ version: chrome.runtime.getManifest().version, connected: true });
    case "setBlockedSites": {
      const raw = asRecord(payload)?.domains;
      if (!Array.isArray(raw)) return fail("domains must be a list.");
      const domains = [
        ...new Set(
          raw
            .filter((d): d is string => typeof d === "string")
            .map((d) => normalizeHostname(d))
            .filter((d): d is string => d !== null),
        ),
      ].sort();
      await setBlockedSites(domains);
      return ok({ domains });
    }
    case "setTree": {
      // The dashboard pushes the full tree on load and on every change; the
      // right-click picker reads this cache so it works with no tab open.
      const tree = sanitizeTree(payload);
      if (!tree) return fail("setTree needs a valid project tree.");
      await setTree(tree);
      return ok({ projects: tree.projects.length });
    }
    case "startSession":
      return handleStartSession(payload);
    case "getState": {
      const session = await getActiveSession();
      return ok({ session, softUnlockAt: null });
    }
    case "drainQueue": {
      const queue = await getQueue();
      return ok(drainQueue(queue));
    }
    case "ackQueue": {
      const raw = asRecord(payload)?.ids;
      if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) {
        return fail("ids must be a list of strings.");
      }
      const queue = await getQueue();
      const next = ackQueue(queue, raw as string[]);
      await setQueue(next);
      return ok({ remaining: queueIds(next).length });
    }
    case "requestEnd":
      return handleRequestEnd();
    default:
      return fail(`Unknown method: ${method}`);
  }
}

chrome.runtime.onMessage.addListener((request: WorkerRequest, _sender, sendResponse) => {
  if (!request || request.type !== "bridge") return undefined;
  void handle(request.method, request.payload).then(sendResponse);
  return true; // keep the message channel open for the async reply
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_END_ALARM) {
    void withStateLock(async () => {
      await checkExpiredSession();
      await reassertBlocking();
    });
  }
});

// --- right-click capture (SPEC 8.7) ----------------------------------------

// "Add to LockedIn task notes" on any selection opens the picker window with
// the captured text and the page it came from. The picker queues the snippet
// with source "page"; the dashboard flushes it through drainQueue.
async function openCaptureWindow(params: { text: string; url: string; title: string }): Promise<void> {
  const query = new URLSearchParams({
    text: params.text.slice(0, MAX_CAPTURE_CHARS),
    url: params.url,
    title: params.title.slice(0, 200),
  });
  await chrome.windows.create({
    url: `${chrome.runtime.getURL("capture.html")}?${query.toString()}`,
    type: "popup",
    width: 420,
    height: 640,
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  void openCaptureWindow({
    text: info.selectionText ?? "",
    url: tab?.url ?? "",
    title: tab?.title ?? "",
  });
});

// removeAll + create on install and update: the menu persists across browser
// restarts, so this is the one place creation happens (no duplicate ids).
function createContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Add to LockedIn task notes",
      contexts: ["selection"],
    });
  });
}

// After install or browser restart, re-read state: expire a finished session
// so a missed alarm cannot leave a stuck lock, and make the DNR rules match
// what storage says.
async function reconcileOnWake(): Promise<void> {
  await withStateLock(async () => {
    await checkExpiredSession();
    await reassertBlocking();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
  void reconcileOnWake();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcileOnWake();
});

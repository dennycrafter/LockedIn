// LockedIn service worker: owns live session state and answers bridge
// commands from the content script. MV3 workers sleep, so every read and
// write goes through chrome.storage.local, timers are chrome.alarms, and all
// mutating handlers run inside one promise-chain lock so two woken messages
// can never interleave (SPEC 4, SPEC 12).

import { ackQueue, drainQueue, enqueueSession, queueIds } from "./lib/queue";
import { isUuid, toCompletedSession, type ActiveSession } from "./lib/session";
import {
  getActiveSession,
  getBlockedSites,
  getQueue,
  setActiveSession,
  setBlockedSites,
  setQueue,
} from "./lib/storage";
import { normalizeHostname } from "./lib/hostname";
import type { BridgeResponse, LockMode, WorkerRequest } from "./lib/messages";

const SESSION_END_ALARM = "lockedin-session-end";
const MAX_PLANNED_SECONDS = 180 * 60; // custom sessions top out at 3 hours (SPEC 8.4)
const LOCK_MODES: LockMode[] = ["none", "soft", "hard"];

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

// --- bridge dispatch -------------------------------------------------------

async function handle(method: string, payload: unknown): Promise<BridgeResponse> {
  await withStateLock(async () => {
    await checkExpiredSession();
  });
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
      await withStateLock(() => setBlockedSites(domains));
      return ok({ domains });
    }
    case "startSession":
      return withStateLock(() => handleStartSession(payload));
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
      return withStateLock(async () => {
        const queue = await getQueue();
        const next = ackQueue(queue, raw as string[]);
        await setQueue(next);
        return ok({ remaining: queueIds(next).length });
      });
    }
    case "requestEnd":
      return withStateLock(() => handleRequestEnd());
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
    void withStateLock(() => checkExpiredSession());
  }
});

// After install, browser restart or worker sleep, re-read state: expire a
// finished session so a missed alarm cannot leave a stuck lock. Blocking
// rules are re-asserted from the next commit.
async function reconcileOnWake(): Promise<void> {
  await withStateLock(() => checkExpiredSession());
}

chrome.runtime.onInstalled.addListener(() => {
  void reconcileOnWake();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcileOnWake();
});

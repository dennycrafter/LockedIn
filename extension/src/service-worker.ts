// LockedIn service worker: owns live session state and answers bridge
// commands from the content script. MV3 workers sleep, so every read and
// write goes through chrome.storage.local, timers are chrome.alarms, and all
// mutating handlers run inside one promise-chain lock so two woken messages
// can never interleave (SPEC 4, SPEC 12). The session rules themselves live
// in lib/lock-state.ts as pure functions; this file is the orchestration.

import { ackQueue, drainQueue, enqueueSession, enqueueTimeStudy, queueIds } from "./lib/queue";
import { isUuid, toCompletedSession, type ActiveSession, type CompletedSession } from "./lib/session";
import { applyBlockingRules, clearBlockingRules, isBlockingSession } from "./lib/blocking";
import { sanitizeTree, type TreeState } from "./lib/tree";
import { TIME_STUDY_ALARM, isTimeStudyChoice, timeStudyAlarm } from "./lib/time-study";
import {
  ADD_TIME_STEP_SECONDS,
  addTimeToSession,
  cancelEnd,
  expire,
  pauseLockState,
  requestEnd,
  resumeLockState,
  type ExpireResult,
  type LockState,
} from "./lib/lock-state";
import {
  getActiveSession,
  getBlockedSites,
  getFloatEnabled,
  getQueue,
  getSoftUnlockAt,
  getTimeStudyMinutes,
  getTimeStudyPrompt,
  setActiveSession,
  setBlockedSites,
  setFloatEnabled,
  setQueue,
  setSoftUnlockAt,
  setTree,
  setTimeStudyMinutes,
  setTimeStudyPrompt,
} from "./lib/storage";
import { normalizeHostname } from "./lib/hostname";
import type { BridgeResponse, LockMode, WorkerRequest } from "./lib/messages";

const SESSION_END_ALARM = "lockedin-session-end";
const SOFT_UNLOCK_ALARM = "lockedin-soft-unlock";
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

// --- lock state persistence ------------------------------------------------

async function loadLockState(): Promise<LockState> {
  const [session, softUnlockAtMs] = await Promise.all([getActiveSession(), getSoftUnlockAt()]);
  return { session, softUnlockAtMs };
}

async function saveLockState(state: LockState): Promise<void> {
  await Promise.all([setActiveSession(state.session), setSoftUnlockAt(state.softUnlockAtMs)]);
  await syncAlarms(state);
}

// One alarm per deadline. Creating an alarm with an existing name replaces it,
// so re-syncing after every mutation keeps the deadlines exact even when a
// previous fire was missed while the worker slept.
async function syncAlarms(state: LockState): Promise<void> {
  if (state.session) {
    await chrome.alarms.create(SESSION_END_ALARM, { when: state.session.endAtMs });
  } else {
    await chrome.alarms.clear(SESSION_END_ALARM);
  }
  if (state.session && state.softUnlockAtMs !== null) {
    await chrome.alarms.create(SOFT_UNLOCK_ALARM, { when: state.softUnlockAtMs });
  } else {
    await chrome.alarms.clear(SOFT_UNLOCK_ALARM);
  }
}

async function queueCompleted(completed: CompletedSession): Promise<void> {
  const queue = await getQueue();
  await setQueue(enqueueSession(queue, completed));
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
  await saveLockState({ session, softUnlockAtMs: null });
  return ok({ session });
}

// "End session" (SPEC 8.4): none ends on the spot, soft starts the 2 minute
// countdown with blocking kept on, hard is refused by the state machine.
async function handleRequestEnd(): Promise<BridgeResponse> {
  const before = await loadLockState();
  const result = requestEnd(before, Date.now());
  if (result.error) return fail(result.error);
  if (result.ended && before.session) {
    await queueCompleted(toCompletedSession(before.session, Date.now()));
  }
  await saveLockState(result.state);
  return ok({ ended: result.ended, softUnlockAt: result.state.softUnlockAtMs });
}

async function handlePause(): Promise<BridgeResponse> {
  const state = await loadLockState();
  if (!state.session) return fail("No session is running.");
  const next = pauseLockState(state, Date.now());
  await saveLockState(next);
  return ok({ session: next.session });
}

async function handleResume(): Promise<BridgeResponse> {
  const state = await loadLockState();
  if (!state.session) return fail("No session is running.");
  const next = resumeLockState(state, Date.now());
  await saveLockState(next);
  return ok({ session: next.session });
}

async function handleAddTime(payload: unknown): Promise<BridgeResponse> {
  const seconds = asRecord(payload)?.seconds;
  if (seconds !== ADD_TIME_STEP_SECONDS && seconds !== -ADD_TIME_STEP_SECONDS) {
    return fail("addTime needs seconds of 300 or -300.");
  }
  const state = await loadLockState();
  if (!state.session) return fail("No session is running.");
  const next: LockState = { ...state, session: addTimeToSession(state.session, seconds) };
  await saveLockState(next);
  return ok({ session: next.session });
}

async function handleCancelEnd(): Promise<BridgeResponse> {
  const state = await loadLockState();
  if (!state.session) return fail("No session is running.");
  const next = cancelEnd(state);
  await saveLockState(next);
  return ok({ softUnlockAt: next.softUnlockAtMs });
}

/**
 * End the session when one of its deadlines has passed. The alarm may fire
 * late or be missed while the worker sleeps, so every incoming message also
 * runs this before acting.
 */
async function expireDueSession(): Promise<ExpireResult> {
  const result = expire(await loadLockState(), Date.now());
  if (result.completed) {
    await queueCompleted(result.completed);
    await saveLockState(result.state);
  }
  return result;
}

// Keeps DNR rules in sync with (active session, blocked sites): install the
// per-domain redirects while a soft/hard session runs, remove them otherwise.
// A paused session or a running soft end countdown keeps blocking.
async function reassertBlocking(): Promise<void> {
  const [session, domains] = await Promise.all([getActiveSession(), getBlockedSites()]);
  if (isBlockingSession(session)) {
    await applyBlockingRules(domains);
  } else {
    await clearBlockingRules();
  }
}

// Time study check-in (SPEC 8.11): the alarm fires with the dashboard closed,
// so the prompt is persisted and picked up by the dashboard's getState poll,
// and a Chrome notification asks the question right away.
async function fireTimeStudyCheckIn(): Promise<void> {
  await setTimeStudyPrompt({ id: crypto.randomUUID(), at: Date.now() });
  chrome.notifications.create(TIME_STUDY_ALARM, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: "LockedIn",
    message: "What are you doing right now?",
  });
}

// --- bridge dispatch -------------------------------------------------------

async function handle(method: string, payload: unknown): Promise<BridgeResponse> {
  return withStateLock(async () => {
    // The alarm may fire late or be missed while the worker sleeps, so every
    // message also checks for an expired session before acting.
    await expireDueSession();
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
      const [lock, timeStudyMinutes, timeStudyPrompt, floatEnabled] = await Promise.all([
        loadLockState(),
        getTimeStudyMinutes(),
        getTimeStudyPrompt(),
        getFloatEnabled(),
      ]);
      return ok({
        session: lock.session,
        softUnlockAt: lock.softUnlockAtMs,
        timeStudyMinutes,
        timeStudyPrompt,
        floatEnabled,
      });
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
    case "pause":
      return handlePause();
    case "resume":
      return handleResume();
    case "addTime":
      return handleAddTime(payload);
    case "requestEnd":
      return handleRequestEnd();
    case "cancelEnd":
      return handleCancelEnd();
    case "setTimeStudy": {
      const raw = asRecord(payload)?.minutes;
      if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || !isTimeStudyChoice(raw))) {
        return fail("minutes must be null or one of 5, 15, 30, 45, 60.");
      }
      await setTimeStudyMinutes(raw);
      const alarm = timeStudyAlarm(raw);
      if (alarm) {
        await chrome.alarms.create(alarm.name, { periodInMinutes: alarm.periodInMinutes });
      } else {
        await chrome.alarms.clear(TIME_STUDY_ALARM);
      }
      return ok({ minutes: raw });
    }
    case "answerTimeStudy": {
      const body = asRecord(payload);
      const id = typeof body?.id === "string" ? body.id : null;
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!id || !isUuid(id)) return fail("Answer id must be a uuid.");
      if (!text) return fail("Write what you are doing first.");
      const queue = await getQueue();
      await setQueue(enqueueTimeStudy(queue, { id, text: text.slice(0, 500), occurredAt: new Date().toISOString() }));
      await setTimeStudyPrompt(null);
      return ok({ queued: true });
    }
    case "setFloat": {
      const enabled = asRecord(payload)?.enabled;
      if (typeof enabled !== "boolean") return fail("enabled must be a boolean.");
      await setFloatEnabled(enabled);
      return ok({ enabled });
    }
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
  if (alarm.name === TIME_STUDY_ALARM) {
    void withStateLock(fireTimeStudyCheckIn);
    return;
  }
  if (alarm.name !== SESSION_END_ALARM && alarm.name !== SOFT_UNLOCK_ALARM) return;
  void withStateLock(async () => {
    await expireDueSession();
    await reassertBlocking();
  });
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
    await expireDueSession();
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

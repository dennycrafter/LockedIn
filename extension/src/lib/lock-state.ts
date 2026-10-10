// Pure lock state machine (SPEC 8.4): every transition a session can take,
// expressed as functions over plain state so the rules are unit-testable
// without chrome.*. The service worker wires these to storage, alarms,
// notifications and DNR rules.
//
// Two deadlines can end a session:
// - the timer reaching zero (endAtMs), moved by pause resume and +5/-5;
// - the soft lock's 2 minute end countdown (softUnlockAtMs).
// Whichever comes first ends the session; a paused session never expires
// because pausing stops every countdown.

import { toCompletedSession, type ActiveSession, type CompletedSession } from "./session";

/** SPEC 8.4 soft lock: "End session" early keeps sites blocked for 2 minutes. */
export const SOFT_COUNTDOWN_MS = 120_000;

/** SPEC 8.17 addTime carries exactly +300 or -300 seconds. */
export const ADD_TIME_STEP_SECONDS = 300;

export interface LockState {
  session: ActiveSession | null;
  softUnlockAtMs: number | null;
}

export type ExpireReason = "timer" | "softUnlock";

export interface ExpireResult {
  state: LockState;
  completed: CompletedSession | null;
  reason: ExpireReason | null;
}

export function emptyLockState(): LockState {
  return { session: null, softUnlockAtMs: null };
}

/** Pause at the state level: no session, nothing to pause. */
export function pauseLockState(state: LockState, nowMs: number): LockState {
  if (!state.session) return state;
  return { ...state, session: pauseSession(state.session, nowMs) };
}

/**
 * Resume at the state level: both deadlines (timer end and the soft end
 * countdown) move forward by the pause length, because pausing stops every
 * countdown (SPEC 8.4).
 */
export function resumeLockState(state: LockState, nowMs: number): LockState {
  if (!state.session || state.session.pausedAtMs === null) return state;
  const pausedMs = Math.max(0, nowMs - state.session.pausedAtMs);
  return {
    ...state,
    session: resumeSession(state.session, nowMs),
    softUnlockAtMs: state.softUnlockAtMs === null ? null : state.softUnlockAtMs + pausedMs,
  };
}

/** Pause stops the countdown. Pausing an already paused session is a no-op. */
export function pauseSession(session: ActiveSession, nowMs: number): ActiveSession {
  if (session.pausedAtMs !== null) return session;
  return { ...session, pausedAtMs: nowMs };
}

/**
 * Resume restarts the countdown: the end moves forward by the pause length so
 * the owner gets the remaining focus time back (SPEC 8.4 "Pause: stops the
 * countdown"). Resuming a running session is a no-op.
 */
export function resumeSession(session: ActiveSession, nowMs: number): ActiveSession {
  if (session.pausedAtMs === null) return session;
  const pausedMs = Math.max(0, nowMs - session.pausedAtMs);
  return {
    ...session,
    pausedAtMs: null,
    pausedTotalMs: session.pausedTotalMs + pausedMs,
    endAtMs: session.endAtMs + pausedMs,
  };
}

/**
 * +5 extends the session end; -5 reclaims time that was added, never planned
 * time, and never drops addedSeconds below 0 (SPEC 8.4). Changing a paused
 * session only moves the stored end; the countdown stays stopped until resume.
 */
export function addTimeToSession(session: ActiveSession, seconds: number): ActiveSession {
  if (seconds > 0) {
    return {
      ...session,
      addedSeconds: session.addedSeconds + seconds,
      endAtMs: session.endAtMs + seconds * 1000,
    };
  }
  const reclaimSeconds = Math.min(session.addedSeconds, -seconds);
  if (reclaimSeconds === 0) return session;
  return {
    ...session,
    addedSeconds: session.addedSeconds - reclaimSeconds,
    endAtMs: session.endAtMs - reclaimSeconds * 1000,
  };
}

export interface EndRequestResult {
  state: LockState;
  /** True when the session ended on the spot (no-lock mode). */
  ended: boolean;
  error?: string;
}

/**
 * "End session" (SPEC 8.4): no lock ends on the spot; soft starts the 2 minute
 * countdown and keeps blocking until it finishes; hard lock refuses.
 * Requesting an end twice while the countdown runs changes nothing.
 */
export function requestEnd(state: LockState, nowMs: number): EndRequestResult {
  const session = state.session;
  if (!session) return { state, ended: false, error: "No session is running." };
  if (session.lockMode === "hard") {
    return { state, ended: false, error: "Hard lock: the session ends when the timer reaches zero." };
  }
  if (session.lockMode === "none") {
    return { state: { session: null, softUnlockAtMs: null }, ended: true };
  }
  if (state.softUnlockAtMs !== null) return { state, ended: false };
  return { state: { ...state, softUnlockAtMs: nowMs + SOFT_COUNTDOWN_MS }, ended: false };
}

/** "Keep working": cancel the soft countdown and carry on with the session. */
export function cancelEnd(state: LockState): LockState {
  if (state.softUnlockAtMs === null) return state;
  return { ...state, softUnlockAtMs: null };
}

/**
 * End the session when one of its deadlines has passed (called on every
 * message, on alarms, and on worker wake so a missed alarm cannot leave a
 * stuck lock). A paused session never expires. The session ends at the
 * deadline itself, not at wake time, so a late worker cannot inflate the
 * logged time.
 */
export function expire(state: LockState, nowMs: number): ExpireResult {
  const session = state.session;
  if (!session || session.pausedAtMs !== null) {
    return { state, completed: null, reason: null };
  }
  const timerDue = nowMs >= session.endAtMs;
  const softDue = state.softUnlockAtMs !== null && nowMs >= state.softUnlockAtMs;
  if (!timerDue && !softDue) return { state, completed: null, reason: null };

  // The earlier deadline wins; a tie ends on the timer.
  const endsOnTimer = timerDue && (!softDue || session.endAtMs <= state.softUnlockAtMs!);
  const endedAtMs = endsOnTimer ? session.endAtMs : state.softUnlockAtMs!;
  return {
    state: { session: null, softUnlockAtMs: null },
    completed: toCompletedSession(session, endedAtMs),
    reason: endsOnTimer ? "timer" : "softUnlock",
  };
}

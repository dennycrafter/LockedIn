import { describe, expect, it } from "vitest";
import {
  ADD_TIME_STEP_SECONDS,
  SOFT_COUNTDOWN_MS,
  addTimeToSession,
  cancelEnd,
  emptyLockState,
  expire,
  pauseLockState,
  pauseSession,
  requestEnd,
  resumeLockState,
  resumeSession,
  type LockState,
} from "./lock-state";
import { computeActiveSeconds, type ActiveSession } from "./session";

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: "0b9e6c1e-0000-4000-8000-000000000001",
    projectId: "0b9e6c1e-0000-4000-8000-0000000000aa",
    taskId: "0b9e6c1e-0000-4000-8000-0000000000bb",
    miscTaskId: null,
    label: "Write intro",
    lockMode: "soft",
    plannedSeconds: 60,
    addedSeconds: 0,
    startedAtMs: 1_000_000,
    endAtMs: 1_060_000,
    pausedAtMs: null,
    pausedTotalMs: 0,
    ...overrides,
  };
}

function makeState(session: ActiveSession | null, softUnlockAtMs: number | null = null): LockState {
  return { session, softUnlockAtMs };
}

describe("resumeLockState", () => {
  it("shifts both deadlines by the pause length", () => {
    // Paused at +10s for 30s: the 60s end becomes 90s and the countdown
    // due at +130s becomes +160s, so nothing expires while paused.
    const state = makeState(makeSession({ pausedAtMs: 1_010_000 }), 1_130_000);
    const resumed = resumeLockState(state, 1_040_000);
    expect(resumed.session?.endAtMs).toBe(1_090_000);
    expect(resumed.softUnlockAtMs).toBe(1_160_000);
  });

  it("is a no-op without a session or without a pause", () => {
    const empty = emptyLockState();
    expect(resumeLockState(empty, 1_040_000)).toBe(empty);
    const running = makeState(makeSession(), 1_130_000);
    expect(resumeLockState(running, 1_040_000)).toBe(running);
  });
});

describe("pauseLockState", () => {
  it("stamps the pause instant", () => {
    const paused = pauseSession(makeSession(), 1_010_000);
    expect(paused.pausedAtMs).toBe(1_010_000);
    expect(paused.endAtMs).toBe(1_060_000);
  });

  it("is a no-op when already paused", () => {
    const paused = pauseSession(makeSession({ pausedAtMs: 1_005_000 }), 1_010_000);
    expect(paused.pausedAtMs).toBe(1_005_000);
  });
});

describe("resumeSession", () => {
  it("moves the end forward by the pause length and banks the pause", () => {
    // 60s planned, paused at +10s, resumed at +40s: 30s back on the clock.
    const resumed = resumeSession(makeSession({ pausedAtMs: 1_010_000 }), 1_040_000);
    expect(resumed.pausedAtMs).toBeNull();
    expect(resumed.pausedTotalMs).toBe(30_000);
    expect(resumed.endAtMs).toBe(1_090_000);
  });

  it("is a no-op when the session is running", () => {
    const session = makeSession();
    expect(resumeSession(session, 1_040_000)).toBe(session);
  });

  it("keeps the full focus time countable after a pause", () => {
    // Pause 30s in the middle, run to the shifted end: 60 active seconds.
    const session = makeSession({ pausedAtMs: 1_030_000 });
    const resumed = resumeSession(session, 1_060_000);
    expect(computeActiveSeconds(resumed, resumed.endAtMs)).toBe(60);
  });
});

describe("addTimeToSession", () => {
  it("+5 adds 300s to addedSeconds and moves the end", () => {
    const next = addTimeToSession(makeSession(), ADD_TIME_STEP_SECONDS);
    expect(next.addedSeconds).toBe(300);
    expect(next.endAtMs).toBe(1_060_000 + 300_000);
  });

  it("+5 stacks with earlier added time", () => {
    // One +5 already applied: end sits 300s past the planned end.
    const added = makeSession({ addedSeconds: 300, endAtMs: 1_060_000 + 300_000 });
    const next = addTimeToSession(added, ADD_TIME_STEP_SECONDS);
    expect(next.addedSeconds).toBe(600);
    expect(next.endAtMs).toBe(1_060_000 + 600_000);
  });

  it("-5 reclaims only added time and never goes below zero added", () => {
    // Nothing added yet: -5 does nothing at all.
    const original = makeSession();
    const untouched = addTimeToSession(original, -ADD_TIME_STEP_SECONDS);
    expect(untouched).toBe(original);

    // 300 added: -5 takes exactly that back.
    const added = makeSession({ addedSeconds: 300, endAtMs: 1_060_000 + 300_000 });
    const reclaimed = addTimeToSession(added, -ADD_TIME_STEP_SECONDS);
    expect(reclaimed.addedSeconds).toBe(0);
    expect(reclaimed.endAtMs).toBe(1_060_000);

    // Only 120 added: -5 reclaims those 120s, never planned time.
    const partial = makeSession({ addedSeconds: 120, endAtMs: 1_060_000 + 120_000 });
    const partialReclaim = addTimeToSession(partial, -ADD_TIME_STEP_SECONDS);
    expect(partialReclaim.addedSeconds).toBe(0);
    expect(partialReclaim.endAtMs).toBe(1_060_000);
  });

  it("moves the hard lock end with plus and minus", () => {
    const hard = makeSession({ lockMode: "hard" });
    const extended = addTimeToSession(hard, ADD_TIME_STEP_SECONDS);
    const back = addTimeToSession(extended, -ADD_TIME_STEP_SECONDS);
    expect(back.endAtMs).toBe(hard.endAtMs);
    expect(back.addedSeconds).toBe(0);
  });

  it("works while paused: the stored end moves, the countdown stays stopped", () => {
    const paused = makeSession({ pausedAtMs: 1_010_000 });
    const next = addTimeToSession(paused, ADD_TIME_STEP_SECONDS);
    expect(next.pausedAtMs).toBe(1_010_000);
    expect(next.endAtMs).toBe(1_060_000 + 300_000);
  });
});

describe("requestEnd", () => {
  it("ends a no-lock session on the spot", () => {
    const session = makeSession({ lockMode: "none" });
    const result = requestEnd(makeState(session), 1_010_000);
    expect(result.ended).toBe(true);
    expect(result.state.session).toBeNull();
  });

  it("starts a 2 minute countdown for a soft lock", () => {
    const result = requestEnd(makeState(makeSession()), 1_010_000);
    expect(result.ended).toBe(false);
    expect(result.state.session).not.toBeNull();
    expect(result.state.softUnlockAtMs).toBe(1_010_000 + SOFT_COUNTDOWN_MS);
  });

  it("refuses a hard lock with the hard lock message", () => {
    const state = makeState(makeSession({ lockMode: "hard" }));
    const result = requestEnd(state, 1_010_000);
    expect(result.ended).toBe(false);
    expect(result.error).toBe("Hard lock: the session ends when the timer reaches zero.");
    expect(result.state).toBe(state);
  });

  it("is idempotent while the countdown already runs", () => {
    const state = makeState(makeSession(), 1_130_000);
    const result = requestEnd(state, 1_120_000);
    expect(result.ended).toBe(false);
    expect(result.state).toBe(state);
  });

  it("errors when no session runs", () => {
    const result = requestEnd(emptyLockState(), 1_010_000);
    expect(result.error).toBe("No session is running.");
  });
});

describe("cancelEnd", () => {
  it("cancels the countdown and keeps the session", () => {
    const session = makeSession();
    const state = makeState(session, 1_130_000);
    const next = cancelEnd(state);
    expect(next.softUnlockAtMs).toBeNull();
    expect(next.session).toBe(session);
  });

  it("is a no-op without a countdown", () => {
    const state = makeState(makeSession());
    expect(cancelEnd(state)).toBe(state);
  });
});

describe("expire", () => {
  it("does nothing before any deadline", () => {
    const state = makeState(makeSession());
    const result = expire(state, 1_059_999);
    expect(result.completed).toBeNull();
    expect(result.reason).toBeNull();
    expect(result.state).toBe(state);
  });

  it("never expires a paused session", () => {
    const state = makeState(makeSession({ pausedAtMs: 1_010_000 }));
    const result = expire(state, 2_000_000);
    expect(result.completed).toBeNull();
    expect(result.state).toBe(state);
  });

  it("ends on the timer and queues the session with the exact end", () => {
    const session = makeSession({ lockMode: "hard" });
    const result = expire(makeState(session), 1_060_000);
    expect(result.reason).toBe("timer");
    expect(result.state.session).toBeNull();
    expect(result.completed?.endedAt).toBe(new Date(1_060_000).toISOString());
    expect(result.completed?.activeSeconds).toBe(60);
  });

  it("a late worker wake still ends at the deadline, not at wake time", () => {
    const session = makeSession();
    const result = expire(makeState(session), 1_060_000 + 120_000);
    expect(result.completed?.endedAt).toBe(new Date(1_060_000).toISOString());
    expect(result.completed?.activeSeconds).toBe(60);
  });

  it("the soft countdown ends the session and clears both deadlines", () => {
    const session = makeSession();
    // Countdown due at +130s, timer due at +60s: the timer fires first.
    const softUnlockAtMs = 1_010_000 + SOFT_COUNTDOWN_MS;
    const timerResult = expire(makeState(session, softUnlockAtMs), 1_060_000);
    expect(timerResult.reason).toBe("timer");

    // Countdown finishing before the timer ends the session at the countdown.
    const shortSession = makeSession({ plannedSeconds: 600, endAtMs: 1_600_000 });
    const softResult = expire(makeState(shortSession, 1_130_000), 1_130_000);
    expect(softResult.reason).toBe("softUnlock");
    expect(softResult.state.session).toBeNull();
    expect(softResult.state.softUnlockAtMs).toBeNull();
    expect(softResult.completed?.endedAt).toBe(new Date(1_130_000).toISOString());
    // 130s of wall time, none paused.
    expect(softResult.completed?.activeSeconds).toBe(130);
  });

  it("ends at the earlier deadline when both are due after a late wake", () => {
    // Timer due at 60s, countdown due at 90s, waking at 200s: timer wins.
    const session = makeSession();
    const result = expire(makeState(session, 1_090_000), 1_200_000);
    expect(result.reason).toBe("timer");
    expect(result.completed?.endedAt).toBe(new Date(1_060_000).toISOString());
  });
});

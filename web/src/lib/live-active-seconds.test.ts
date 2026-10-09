// Live active seconds must freeze at the pause value while a session is
// paused (SPEC 8.4: paused time is never counted in active_seconds). While
// running, it keeps counting but excludes completed paused time.
//
import { describe, expect, it } from "vitest";
import { liveActiveSeconds } from "./live-active-seconds";
import type { ExtensionSession } from "./extension-session";

function makeSession(overrides: Partial<ExtensionSession> = {}): ExtensionSession {
  return {
    id: "s1",
    projectId: null,
    taskId: null,
    miscTaskId: null,
    label: "",
    lockMode: "hard",
    plannedSeconds: 1500,
    addedSeconds: 0,
    startedAtMs: 0,
    endAtMs: 1_500_000,
    pausedAtMs: null,
    pausedTotalMs: 0,
    ...overrides,
  };
}

describe("liveActiveSeconds while paused", () => {
  it("freezes at the pause-time value and never counts paused time", () => {
    // Paused after 600s of active time; the pause is still open.
    const session = makeSession({ pausedAtMs: 600_000, pausedTotalMs: 0 });

    expect(liveActiveSeconds(session, 601_000)).toBe(600);
    expect(liveActiveSeconds(session, 900_000)).toBe(600);
    expect(liveActiveSeconds(session, 1_200_000)).toBe(600);
  });

  it("freezes on a second pause, excluding the accumulated earlier pause", () => {
    // 300s active, paused 60s, resumed, paused again at 600s elapsed:
    // active at the second pause is 600 - 60 = 540 and must stay there.
    const session = makeSession({ pausedAtMs: 600_000, pausedTotalMs: 60_000 });

    expect(liveActiveSeconds(session, 610_000)).toBe(540);
    expect(liveActiveSeconds(session, 720_000)).toBe(540);
  });

  it("shows 0 when paused exactly at the start", () => {
    const session = makeSession({ pausedAtMs: 0, pausedTotalMs: 0 });

    expect(liveActiveSeconds(session, 999_999)).toBe(0);
  });
});

describe("liveActiveSeconds while running", () => {
  it("keeps counting but excludes completed paused time", () => {
    const session = makeSession({ pausedTotalMs: 60_000 });

    expect(liveActiveSeconds(session, 600_000)).toBe(540);
  });

  it("floors to whole seconds", () => {
    const session = makeSession({ pausedTotalMs: 60_000 });

    expect(liveActiveSeconds(session, 600_500)).toBe(540);
  });
});

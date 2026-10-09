import { describe, expect, it } from "vitest";
import { computeActiveSeconds, toCompletedSession, type ActiveSession } from "./session";

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: "0b9e6c1e-0000-4000-8000-000000000001",
    projectId: "0b9e6c1e-0000-4000-8000-0000000000aa",
    taskId: "0b9e6c1e-0000-4000-8000-0000000000bb",
    miscTaskId: null,
    label: "Write intro",
    lockMode: "hard",
    plannedSeconds: 60,
    addedSeconds: 0,
    startedAtMs: 1_000_000,
    endAtMs: 1_000_000 + 60_000,
    pausedAtMs: null,
    pausedTotalMs: 0,
    ...overrides,
  };
}

describe("computeActiveSeconds", () => {
  it("counts the full run when the timer reaches zero", () => {
    const session = makeSession();
    expect(computeActiveSeconds(session, session.endAtMs)).toBe(60);
  });

  it("excludes paused time", () => {
    // Ended while paused, 15s into the pause: 45s wall minus 15s open pause.
    const openPause = makeSession({ pausedAtMs: 1_030_000, pausedTotalMs: 0 });
    expect(computeActiveSeconds(openPause, 1_045_000)).toBe(30);

    // A closed pause of 30s before ending at the planned end: 60 - 30.
    const closedPause = makeSession({ pausedAtMs: null, pausedTotalMs: 30_000 });
    expect(computeActiveSeconds(closedPause, closedPause.endAtMs)).toBe(30);
  });

  it("caps at the planned end even when the end is noticed late", () => {
    // Service worker woke up two minutes after the alarm: no free time.
    const session = makeSession();
    expect(computeActiveSeconds(session, session.endAtMs + 120_000)).toBe(60);
  });

  it("never goes negative when ended instantly", () => {
    const session = makeSession();
    expect(computeActiveSeconds(session, session.startedAtMs)).toBe(0);
  });
});

describe("toCompletedSession", () => {
  it("builds the database row shape with ISO timestamps", () => {
    const session = makeSession();
    const row = toCompletedSession(session, session.endAtMs);
    expect(row).toMatchObject({
      id: session.id,
      projectId: session.projectId,
      taskId: session.taskId,
      lockMode: "hard",
      plannedSeconds: 60,
      addedSeconds: 0,
      activeSeconds: 60,
    });
    expect(row.startedAt).toBe(new Date(session.startedAtMs).toISOString());
    expect(row.endedAt).toBe(new Date(session.endAtMs).toISOString());
  });
});

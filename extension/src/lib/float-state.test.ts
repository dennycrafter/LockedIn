import { describe, expect, it } from "vitest";
import { clampPosition, defaultPosition, shouldShowFloat, type FloatEnvironment } from "./float-state";
import type { ActiveSession } from "./session";

function makeSession(id = "0b9e6c1e-0000-4000-8000-000000000001"): ActiveSession {
  return {
    id,
    projectId: null,
    taskId: null,
    miscTaskId: null,
    label: "Write intro",
    lockMode: "hard",
    plannedSeconds: 60,
    addedSeconds: 0,
    startedAtMs: 1_000_000,
    endAtMs: 1_060_000,
    pausedAtMs: null,
    pausedTotalMs: 0,
  };
}

function makeEnv(overrides: Partial<FloatEnvironment> = {}): FloatEnvironment {
  return {
    session: makeSession(),
    floatEnabled: true,
    isDashboardOrigin: false,
    hiddenForSessionId: null,
    ...overrides,
  };
}

describe("shouldShowFloat", () => {
  it("shows during an active session on a normal page", () => {
    expect(shouldShowFloat(makeEnv())).toBe(true);
  });

  it("never shows on the dashboard origin, the dashboard has its own timer", () => {
    expect(shouldShowFloat(makeEnv({ isDashboardOrigin: true }))).toBe(false);
  });

  it("never shows when the global float toggle is off", () => {
    expect(shouldShowFloat(makeEnv({ floatEnabled: false }))).toBe(false);
  });

  it("hides for the session the user dismissed until a new session starts", () => {
    const session = makeSession();
    const hidden = makeEnv({ session, hiddenForSessionId: session.id });
    expect(shouldShowFloat(hidden)).toBe(false);
    const nextSession = makeSession("0b9e6c1e-0000-4000-8000-000000000002");
    expect(shouldShowFloat({ ...hidden, session: nextSession })).toBe(true);
  });
});

describe("clampPosition", () => {
  it("keeps the box inside the viewport", () => {
    expect(clampPosition({ x: 9999, y: 9999 }, { width: 800, height: 600 }, { width: 220, height: 200 })).toEqual({
      x: 580,
      y: 400,
    });
    expect(clampPosition({ x: -50, y: -50 }, { width: 800, height: 600 }, { width: 220, height: 200 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("handles viewports smaller than the box", () => {
    expect(clampPosition({ x: 30, y: 30 }, { width: 100, height: 80 }, { width: 220, height: 200 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("defaultPosition", () => {
  it("sits bottom right, 16px from the edges", () => {
    expect(defaultPosition({ width: 1440, height: 900 })).toEqual({ x: 1204, y: 664 });
  });
});

import { describe, expect, it } from "vitest";
import { sessionPhase } from "./session-phase";
import type { ExtensionSession } from "./extension-session";

function makeSession(overrides: Partial<ExtensionSession> = {}): ExtensionSession {
  return {
    id: "0b9e6c1e-0000-4000-8000-000000000001",
    projectId: null,
    taskId: null,
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

describe("sessionPhase", () => {
  it("reports running for a normal countdown", () => {
    expect(sessionPhase(makeSession(), null)).toBe("running");
  });

  it("reports paused when the countdown is stopped", () => {
    expect(sessionPhase(makeSession({ pausedAtMs: 1_010_000 }), null)).toBe("paused");
  });

  it("reports ending while the soft unlock countdown runs, even paused", () => {
    expect(sessionPhase(makeSession(), 1_130_000)).toBe("ending");
    expect(sessionPhase(makeSession({ pausedAtMs: 1_010_000 }), 1_130_000)).toBe("ending");
  });
});

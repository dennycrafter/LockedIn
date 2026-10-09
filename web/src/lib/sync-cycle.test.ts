// Regression coverage for runSyncCycle (SPEC 8.17). The dashboard runs this
// cycle with `void runSyncCycle()`, so every failure must come back as
// { ok: false } on the resolved value. A fetch rejection (offline blip) used
// to escape as an unhandled promise rejection; these tests pin the contract
// with an unhandled-rejection spy, plus the queue-preservation rules.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => {
  const state = {
    drained: {} as Record<string, unknown>,
    acked: false,
  };
  const callExtension = vi.fn(async (method: string) => {
    if (method === "drainQueue") return { ok: true, data: state.drained };
    if (method === "ackQueue") {
      state.acked = true;
      return { ok: true };
    }
    return { ok: false, error: `unexpected bridge method: ${method}` };
  });
  return { state, callExtension };
});

vi.mock("@/lib/bridge-client", () => ({ callExtension: bridge.callExtension }));

import { runSyncCycle } from "./sync-cycle";

// One drained session so the cycle reaches the /api/sync POST.
const SESSION_ROW = {
  id: "session-1",
  projectId: null,
  taskId: null,
  miscTaskId: null,
  label: "Test session",
  lockMode: "hard",
  plannedSeconds: 60,
  addedSeconds: 0,
  activeSeconds: 60,
  startedAt: "2026-10-09T12:00:00.000Z",
  endedAt: "2026-10-09T12:01:00.000Z",
};

function spyUnhandledRejections() {
  const caught: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    caught.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  return {
    caught,
    stop() {
      process.off("unhandledRejection", onUnhandled);
    },
  };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("runSyncCycle", () => {
  beforeEach(() => {
    bridge.state.drained = {
      sessions: [SESSION_ROW],
      infractions: [],
      snippets: [],
      timeStudies: [],
    };
    bridge.state.acked = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves { ok: false } when the sync POST fails offline, without an unhandled rejection", async () => {
    const spy = spyUnhandledRejections();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      const result = await runSyncCycle();
      expect(result.ok).toBe(false);
      expect(result.savedSessions).toBe(0);
      expect(result.savedInfractions).toBe(0);
      expect(result.savedSnippets).toBe(0);
      expect(result.savedTimeStudies).toBe(0);
      expect(result.error).toContain("Saving the queue failed");
      expect(bridge.state.acked).toBe(false);
      // The queue stays intact for the next cycle (drainQueue was called, nothing acked).
      await flushMicrotasks();
      expect(spy.caught).toEqual([]);
    } finally {
      spy.stop();
    }
  });

  it("resolves { ok: false } for a non-network throw while POSTing", async () => {
    const spy = spyUnhandledRejections();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("boom");
        }),
      );
      const result = await runSyncCycle();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("boom");
      await flushMicrotasks();
      expect(spy.caught).toEqual([]);
    } finally {
      spy.stop();
    }
  });

  it("keeps the queue unacked when /api/sync answers with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const result = await runSyncCycle();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
    expect(bridge.state.acked).toBe(false);
  });

  it("acks the queue and reports saved counts on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const result = await runSyncCycle();
    expect(result.ok).toBe(true);
    expect(result.savedSessions).toBe(1);
    expect(bridge.state.acked).toBe(true);
  });
});

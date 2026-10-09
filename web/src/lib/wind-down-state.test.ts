// Tests for the wind-down modal state machine (SPEC 8.12): step flow,
// skip-to-planning, visit flags that make a planning-only save safe, plan-list
// edits, draft persistence round trips, and the save payload contract.

import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  draftHasProgress,
  draftStorageKey,
  freshDraft,
  parseDraft,
  prefillDraft,
  serializeDraft,
  windDownModalInitialState,
  windDownModalReducer,
  type WindDownDraft,
  type WindDownGetPayload,
} from "./wind-down-state";

function run(state = windDownModalInitialState(), ...events: Parameters<typeof windDownModalReducer>[1][]) {
  let current = state;
  for (const event of events) {
    current = windDownModalReducer(current, event);
  }
  return current;
}

function draftOf(state: ReturnType<typeof run>): WindDownDraft {
  return state.draft;
}

const TASK_A = "11111111-1111-4111-8111-111111111111";
const TASK_B = "22222222-2222-4222-8222-222222222222";

function serverPayload(overrides: Partial<WindDownGetPayload> = {}): WindDownGetPayload {
  return {
    anchorDateKey: "2026-10-09",
    planDateKey: "2026-10-10",
    review: null,
    plan: null,
    recaps: [],
    taskTimes: [],
    projects: [],
    taskLinks: [],
    settings: { displayName: "Boss", windDownTime: "" },
    ...overrides,
  };
}

describe("step flow", () => {
  it("starts closed and opens into loading", () => {
    const opened = run(windDownModalInitialState(), { type: "open" });
    expect(opened.status).toBe("loading");
    expect(opened.draft).toEqual(freshDraft());
  });

  it("choosing full wind down lands on step 1 and marks the review visited", () => {
    const state = run(undefined, { type: "open" }, { type: "load-success", payload: serverPayload(), localDraft: null }, { type: "choose-full" });
    expect(draftOf(state).step).toBe(1);
    expect(draftOf(state).reviewVisited).toBe(true);
    expect(draftOf(state).recapsVisited).toBe(false);
  });

  it("skip to planning jumps to step 5 without visiting review steps", () => {
    const state = run(undefined, { type: "open" }, { type: "load-success", payload: serverPayload(), localDraft: null }, { type: "choose-planning" });
    expect(draftOf(state).step).toBe(5);
    expect(draftOf(state).reviewVisited).toBe(false);
    expect(draftOf(state).recapsVisited).toBe(false);
  });

  it("next and back walk one step at a time", () => {
    const state = run(undefined, { type: "open" }, { type: "choose-full" }, { type: "next" }, { type: "next" }, { type: "next" }, { type: "next" });
    expect(draftOf(state).step).toBe(5);
    const back = run(state, { type: "back" }, { type: "back" });
    expect(draftOf(back).step).toBe(3);
  });

  it("next at the last step and back at step 0 do nothing", () => {
    const atLast = run(undefined, { type: "open" }, { type: "choose-planning" }, { type: "next" }, { type: "next" }, { type: "next" });
    expect(draftOf(atLast).step).toBe(8);
    expect(draftOf(run(atLast, { type: "next" })).step).toBe(8);
    expect(draftOf(run(windDownModalInitialState(), { type: "back" })).step).toBe(0);
  });

  it("back from planning reaches the review steps and marks them visited", () => {
    const state = run(undefined, { type: "open" }, { type: "choose-planning" }, { type: "back" }, { type: "back" });
    expect(draftOf(state).step).toBe(3);
    expect(draftOf(state).reviewVisited).toBe(true);
    expect(draftOf(state).recapsVisited).toBe(true);
  });
});

describe("answer edits", () => {
  it("stores review answers, recaps, start time and location", () => {
    const state = run(
      undefined,
      { type: "open" },
      { type: "set-done-today", value: "Wrote the intro" },
      { type: "set-finished-goal", value: true },
      { type: "set-best-use", value: false },
      { type: "set-best-use-note", value: "Drifted after lunch" },
      { type: "set-recap", taskId: TASK_A, value: "Draft lives in the shared doc" },
      { type: "set-start-time", value: "8am" },
      { type: "set-location", value: "Office" },
    );
    expect(draftOf(state).review).toEqual({
      doneToday: "Wrote the intro",
      finishedGoal: true,
      bestUse: false,
      bestUseNote: "Drifted after lunch",
    });
    expect(draftOf(state).recapAnswers[TASK_A]).toBe("Draft lives in the shared doc");
    expect(draftOf(state).startTime).toBe("8am");
    expect(draftOf(state).location).toBe("Office");
    expect(draftHasProgress(draftOf(state))).toBe(true);
  });

  it("reports no progress on a fresh draft", () => {
    expect(draftHasProgress(freshDraft())).toBe(false);
  });
});

describe("plan list edits", () => {
  const planned = [
    { kind: "existing" as const, taskId: TASK_A, label: "A" },
    { kind: "existing" as const, taskId: TASK_B, label: "B" },
  ];

  it("adds, removes and reorders entries in order", () => {
    let state = run(undefined, { type: "open" }, { type: "add-planned", entry: planned[0] }, { type: "add-planned", entry: planned[1] });
    expect(draftOf(state).planned.map((entry) => entry.label)).toEqual(["A", "B"]);
    state = run(state, { type: "move-planned", index: 1, direction: -1 });
    expect(draftOf(state).planned.map((entry) => entry.label)).toEqual(["B", "A"]);
    state = run(state, { type: "remove-planned", index: 0 });
    expect(draftOf(state).planned.map((entry) => entry.label)).toEqual(["A"]);
  });

  it("ignores moves past the ends", () => {
    const state = run(undefined, { type: "open" }, { type: "add-planned", entry: planned[0] });
    expect(draftOf(run(state, { type: "move-planned", index: 0, direction: -1 })).planned).toHaveLength(1);
    expect(draftOf(run(state, { type: "move-planned", index: 5, direction: 1 })).planned).toHaveLength(1);
  });
});

describe("buildSavePayload", () => {
  it("sends the review and recaps only when their steps were visited", () => {
    const planningOnly = run(undefined, { type: "open" }, { type: "choose-planning" }, { type: "set-start-time", value: "8am" });
    expect(buildSavePayload(draftOf(planningOnly))).toEqual({
      review: null,
      recaps: null,
      planning: { startTime: "8am", location: "", tasks: [] },
      prepped: true,
    });

    const full = run(
      planningOnly,
      { type: "back" },
      { type: "back" },
      { type: "set-done-today", value: "  Shipped the demo  " },
      { type: "set-recap", taskId: TASK_A, value: "  Kept the notes  " },
      { type: "set-recap", taskId: TASK_B, value: "   " },
    );
    expect(buildSavePayload(draftOf(full))).toEqual({
      review: { doneToday: "Shipped the demo", finishedGoal: null, bestUse: null, bestUseNote: "" },
      recaps: [{ taskId: TASK_A, text: "Kept the notes" }],
      planning: { startTime: "8am", location: "", tasks: [] },
      prepped: true,
    });
  });

  it("maps planned entries to their save inputs", () => {
    const draft = freshDraft();
    draft.planned = [
      { kind: "existing", taskId: TASK_A, label: "Existing task" },
      { kind: "new", projectId: null, projectName: "New project", label: "Brand new task" },
    ];
    const payload = buildSavePayload(draft);
    expect(payload.planning?.tasks).toEqual([
      { kind: "existing", taskId: TASK_A },
      { kind: "new", projectId: null, projectName: "New project", taskTitle: "Brand new task" },
    ]);
  });
});

describe("load-success prefill", () => {
  it("prefills from the server when the local draft has no progress", () => {
    const payload = serverPayload({
      review: { doneToday: "Saved earlier", finishedGoal: true, bestUse: null, bestUseNote: "" },
      recaps: [{ taskId: TASK_A, text: "Saved recap" }],
      plan: {
        startTime: "9am",
        location: "Home",
        prepped: true,
        tasks: [
          { taskId: TASK_B, title: "Second", position: 1 },
          { taskId: TASK_A, title: "First", position: 0 },
        ],
      },
    });
    const state = run(undefined, { type: "open" }, { type: "load-success", payload, localDraft: null });
    expect(prefillDraft(payload).planned.map((entry) => entry.label)).toEqual(["First", "Second"]);
    expect(draftOf(state).review.doneToday).toBe("Saved earlier");
    expect(draftOf(state).recapAnswers[TASK_A]).toBe("Saved recap");
    expect(draftOf(state).startTime).toBe("9am");
    expect(draftOf(state).location).toBe("Home");
    // Plan tasks come back in position order regardless of row order.
    expect(draftOf(state).planned.map((entry) => entry.label)).toEqual(["First", "Second"]);
  });

  it("keeps local progress over server data", () => {
    const localDraft = freshDraft();
    localDraft.review.doneToday = "Typed but not saved";
    const payload = serverPayload({ review: { doneToday: "Older server copy", finishedGoal: null, bestUse: null, bestUseNote: "" } });
    const state = run(undefined, { type: "open" }, { type: "load-success", payload, localDraft });
    expect(draftOf(state).review.doneToday).toBe("Typed but not saved");
  });
});

describe("save outcomes", () => {
  it("success closes with the See you tomorrow toast", () => {
    const state = run(undefined, { type: "open" }, { type: "save-start" }, { type: "save-success", name: "Boss" });
    expect(state.status).toBe("closed");
    expect(state.toast).toBe("See you tomorrow, Boss.");
  });

  it("failure keeps the modal open with the error and the draft intact", () => {
    const withInput = run(undefined, { type: "open" }, { type: "choose-full" }, { type: "set-done-today", value: "Precious words" });
    const failed = run(withInput, { type: "save-start" }, { type: "save-failure", error: "Database refused" });
    expect(failed.status).toBe("ready");
    expect(failed.saveError).toBe("Database refused");
    expect(draftOf(failed).review.doneToday).toBe("Precious words");
  });
});

describe("draft persistence", () => {
  it("round trips a draft through serialize and parse", () => {
    const state = run(
      undefined,
      { type: "open" },
      { type: "choose-full" },
      { type: "set-done-today", value: "Round trip" },
      { type: "set-finished-goal", value: false },
      { type: "set-recap", taskId: TASK_A, value: "Kept" },
      { type: "add-planned", entry: { kind: "new", projectId: null, projectName: "Side", label: "New thing" } },
    );
    const parsed = parseDraft(serializeDraft(draftOf(state)));
    expect(parsed).toEqual(draftOf(state));
  });

  it("returns null for corrupt or foreign data", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("not json {")).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 99, draft: freshDraft() }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 1, draft: { ...freshDraft(), step: 9 } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 1, draft: { ...freshDraft(), planned: [{ kind: "mystery" }] } }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 1, draft: { ...freshDraft(), reviewVisited: "yes" } }))).toBeNull();
  });

  it("tolerates a boolean flip back to null and missing note", () => {
    const parsed = parseDraft(
      JSON.stringify({
        version: 1,
        draft: { ...freshDraft(), review: { doneToday: "x", finishedGoal: true, bestUse: "nope", bestUseNote: undefined } },
      }),
    );
    expect(parsed?.review.finishedGoal).toBe(true);
    expect(parsed?.review.bestUse).toBeNull();
    expect(parsed?.review.bestUseNote).toBe("");
  });

  it("keys storage by the anchor date so drafts never leak across days", () => {
    expect(draftStorageKey("2026-10-09")).toBe("lockedin-wind-down-2026-10-09");
    expect(draftStorageKey("2026-10-10")).not.toBe(draftStorageKey("2026-10-09"));
  });
});

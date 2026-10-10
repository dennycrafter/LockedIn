import { describe, expect, it } from "vitest";
import type { ProjectData, TaskData } from "./dashboard-data";
import {
  EMPTY_CHECK_IN,
  openLoopText,
  stuckTaskOptions,
  suggestStuckHelp,
  TRIED_LABELS,
  type StuckCheckIn,
} from "./stuck";

// Fixtures only (SPEC 0 allows fixtures in tests); the classification reads
// nothing but the check-in strings, the picker reads id/name/done/title.

function task(overrides: Partial<TaskData> = {}): TaskData {
  return {
    id: "t1",
    project_id: "p1",
    parent_task_id: null,
    title: "Write intro",
    done: false,
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    subtasks: [],
    ...overrides,
  };
}

function project(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: "p1",
    name: "Launch",
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    tasks: [],
    ...overrides,
  };
}

describe("suggestStuckHelp (T7b scripted branches)", () => {
  it("routes the empty-answers default to the 5 minute mini session", () => {
    const suggestion = suggestStuckHelp(EMPTY_CHECK_IN);
    expect(suggestion.kind).toBe("start");
    expect(suggestion.headline).toBe("Start a 5 minute mini session");
  });

  it("routes no work yet (untouched answers) to the start suggestion", () => {
    const suggestion = suggestStuckHelp({ workedOn: "", stuckWhere: "the blank page", tried: null });
    expect(suggestion.kind).toBe("start");
  });

  it("routes work done but blocked to the break-down suggestion", () => {
    const suggestion = suggestStuckHelp({ workedOn: "drafted two paragraphs", stuckWhere: "the hook", tried: "little" });
    expect(suggestion.kind).toBe("break_down");
    expect(suggestion.headline).toBe("Shrink it to one smaller next step");
  });

  it("treats whitespace-only worked-on text as no work yet", () => {
    const suggestion = suggestStuckHelp({ workedOn: "   ", stuckWhere: "", tried: null });
    expect(suggestion.kind).toBe("start");
  });

  it("routes tried everything to the park suggestion even after work", () => {
    const suggestion = suggestStuckHelp({ workedOn: "three drafts", stuckWhere: "tone", tried: "everything" });
    expect(suggestion.kind).toBe("park");
    expect(suggestion.headline).toBe("Park it and come back fresh");
  });

  it("gives tried-everything precedence over the break-down branch", () => {
    const withWork = suggestStuckHelp({ workedOn: "lots", stuckWhere: "", tried: "everything" });
    const withoutWork = suggestStuckHelp({ workedOn: "", stuckWhere: "", tried: "everything" });
    expect(withWork.kind).toBe("park");
    expect(withoutWork.kind).toBe("park");
  });

  it("keeps other tried levels from overriding the work-done branch", () => {
    expect(suggestStuckHelp({ workedOn: "an outline", stuckWhere: "", tried: "some" }).kind).toBe("break_down");
    expect(suggestStuckHelp({ workedOn: "an outline", stuckWhere: "", tried: null }).kind).toBe("break_down");
  });
});

describe("openLoopText", () => {
  it("combines the task title and the stuck-where answer", () => {
    const checkIn: StuckCheckIn = { workedOn: "", stuckWhere: "  the tone feels off  ", tried: "everything" };
    expect(openLoopText(checkIn, "Write intro")).toBe('Stuck on "Write intro": the tone feels off');
  });

  it("falls back to the task title alone when no stuck-where answer", () => {
    expect(openLoopText(EMPTY_CHECK_IN, "Write intro")).toBe('Stuck on "Write intro"');
  });

  it("uses a generic subject when no task was picked", () => {
    expect(openLoopText({ ...EMPTY_CHECK_IN, stuckWhere: "money worries" }, null)).toBe("Stuck: money worries");
    expect(openLoopText(EMPTY_CHECK_IN, null)).toBe("Stuck");
  });
});

describe("stuckTaskOptions", () => {
  it("lists undone tasks and subtasks in tree order with breadcrumbs", () => {
    const projects = [
      project({
        tasks: [
          task({ id: "t1", title: "Write intro" }),
          task({
            id: "t2",
            title: "Record demo",
            subtasks: [task({ id: "s1", parent_task_id: "t2", title: "Plug in the mic" })],
          }),
        ],
      }),
    ];
    const options = stuckTaskOptions(projects);
    expect(options.map((option) => option.label)).toEqual([
      "Launch > Write intro",
      "Launch > Record demo",
      "Launch > Record demo > Plug in the mic",
    ]);
    // A subtask pick hangs every action off its top-level parent task.
    expect(options[2]).toMatchObject({ kind: "subtask", projectId: "p1", topTaskId: "t2" });
    expect(options[0]).toMatchObject({ kind: "task", projectId: "p1", topTaskId: "t1" });
  });

  it("never offers done items", () => {
    const projects = [
      project({
        tasks: [
          task({ id: "t1", done: true }),
          task({ id: "t2", done: true, subtasks: [task({ id: "s1", parent_task_id: "t2", done: true })] }),
        ],
      }),
    ];
    expect(stuckTaskOptions(projects)).toEqual([]);
  });
});

describe("TRIED_LABELS", () => {
  it("labels the everything chip so the park branch is legible", () => {
    expect(TRIED_LABELS.everything).toBe("Everything I can think of");
  });
});

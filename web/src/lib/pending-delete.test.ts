import { describe, expect, it } from "vitest";
import type { DashboardData, TaskData } from "./dashboard-data";
import { DEFAULT_SETTINGS } from "./dashboard-data";
import { hidePending, undoLabel } from "./pending-delete";

function task(id: string, subtasks: TaskData[] = []): TaskData {
  return {
    id,
    project_id: "p1",
    parent_task_id: null,
    title: id,
    done: false,
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    subtasks,
  };
}

const data: DashboardData = {
  settings: DEFAULT_SETTINGS,
  projects: [
    { id: "p1", name: "One", notes: "", position: 0, links: [], snippets: [], tasks: [task("t1", [task("s1"), task("s2")]), task("t2")] },
    { id: "p2", name: "Two", notes: "", position: 1, links: [], snippets: [], tasks: [task("t3")] },
  ],
  blockedSites: [],
  openLoops: [
    { id: "o1", kind: "loop", text: "a", created_at: "" },
    { id: "o2", kind: "decision", text: "b", created_at: "" },
  ],
  miscTasks: [
    { id: "m1", title: "x", done: false, position: 0 },
    { id: "m2", title: "y", done: false, position: 1 },
  ],
  todaySessions: [],
  todayTimeStudies: [],
  todayInfractions: [],
};

describe("hidePending", () => {
  it("returns the same object when nothing is pending", () => {
    expect(hidePending(data, new Set())).toBe(data);
  });

  it("hides projects, tasks, subtasks, misc tasks and loops by id", () => {
    const out = hidePending(data, new Set(["p2", "t2", "s1", "m1", "o2"]));
    expect(out.projects.map((p) => p.id)).toEqual(["p1"]);
    expect(out.projects[0].tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(out.projects[0].tasks[0].subtasks.map((t) => t.id)).toEqual(["s2"]);
    expect(out.miscTasks.map((t) => t.id)).toEqual(["m2"]);
    expect(out.openLoops.map((l) => l.id)).toEqual(["o1"]);
  });

  it("does not change the input", () => {
    hidePending(data, new Set(["s1"]));
    expect(data.projects[0].tasks[0].subtasks).toHaveLength(2);
  });
});

describe("undoLabel", () => {
  it("quotes short names and trims long ones", () => {
    expect(undoLabel("Laundry")).toBe('Deleted "Laundry"');
    expect(undoLabel("Record a 60 second demo video for the landing page")).toBe(
      'Deleted "Record a 60 second demo video..."',
    );
  });
});

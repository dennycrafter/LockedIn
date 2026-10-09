import { describe, expect, it } from "vitest";
import type { ProjectData } from "./dashboard-data";
import { projectItems, projectOfTask, projectProgress } from "./tree";

function task(id: string, done: boolean, subtasks: ProjectData["tasks"][number]["subtasks"] = []) {
  return {
    id,
    project_id: "p1",
    parent_task_id: subtasks.length > 0 || id.includes("sub") ? "parent" : null,
    title: id,
    done,
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    subtasks,
  };
}

function project(tasks: ProjectData["tasks"]): ProjectData {
  return {
    id: "p1",
    name: "Test",
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    tasks,
  };
}

describe("projectProgress", () => {
  it("is 25% when 1 of 4 items is done (SPEC 8.2 test vector)", () => {
    const p = project([task("a", true), task("b", false), task("c", false), task("d", false)]);
    expect(projectProgress(p)).toEqual({ done: 1, total: 4, percent: 25 });
  });

  it("is 0% with zero items, not a division by zero", () => {
    expect(projectProgress(project([]))).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("rounds to the nearest whole percent", () => {
    const p = project([task("a", true), task("b", false), task("c", false)]);
    expect(projectProgress(p).percent).toBe(33);
  });

  it("counts subtasks toward progress", () => {
    const p = project([
      task("a", false, [task("sub1", true), task("sub2", false)]),
      task("b", false),
    ]);
    expect(projectProgress(p)).toEqual({ done: 1, total: 4, percent: 25 });
  });
});

describe("projectItems", () => {
  it("walks tasks and subtasks in display order", () => {
    const p = project([task("a", false, [task("a-sub", false)]), task("b", false)]);
    expect(projectItems(p).map((item) => item.id)).toEqual(["a", "a-sub", "b"]);
  });
});

describe("projectOfTask", () => {
  it("finds the owner of a task or subtask", () => {
    const sub = task("sub", false);
    const p = project([task("a", false, [sub])]);
    expect(projectOfTask([p], "a")?.id).toBe("p1");
    expect(projectOfTask([p], "sub")?.id).toBe("p1");
    expect(projectOfTask([p], "missing")).toBeNull();
  });
});

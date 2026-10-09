import { describe, expect, it } from "vitest";
import type { MiscTaskData, ProjectData } from "./dashboard-data";
import { windDownCandidates } from "./planning";

function project(overrides: Partial<ProjectData>): ProjectData {
  return {
    id: "p-1",
    name: "Launch",
    notes: "",
    position: 0,
    links: [],
    snippets: [],
    tasks: [],
    ...overrides,
  };
}

function task(overrides: Partial<ProjectData["tasks"][number]> = {}): ProjectData["tasks"][number] {
  return {
    id: "t-1",
    project_id: "p-1",
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

const MISC: MiscTaskData[] = [
  { id: "m-1", title: "Water the plants", done: false, position: 0 },
  { id: "m-2", title: "Post the letter", done: false, position: 1 },
];

describe("windDownCandidates (SPEC 8.9 misc-task exclusion)", () => {
  it("includes undone tasks and subtasks with their project label", () => {
    const projects = [
      project({
        tasks: [
          task(),
          task({ id: "t-2", title: "Ship it", subtasks: [task({ id: "t-3", parent_task_id: "t-2", title: "Tag the release" })] }),
        ],
      }),
    ];
    const candidates = windDownCandidates(projects, MISC);
    expect(candidates.map((c) => c.label)).toEqual([
      "Launch > Write intro",
      "Launch > Ship it",
      "Launch > Ship it > Tag the release",
    ]);
  });

  it("never includes misc tasks, even when they are undone", () => {
    const projects = [project({ tasks: [task()] })];
    const candidates = windDownCandidates(projects, MISC);
    expect(candidates.some((c) => MISC.some((m) => c.taskId === m.id))).toBe(false);
    expect(candidates).toHaveLength(1);
  });

  it("skips done items", () => {
    const projects = [project({ tasks: [task({ done: true }), task({ id: "t-9", title: "Open one" })] })];
    const candidates = windDownCandidates(projects, []);
    expect(candidates.map((c) => c.taskId)).toEqual(["t-9"]);
  });

  it("an empty tree yields nothing", () => {
    expect(windDownCandidates([], MISC)).toEqual([]);
  });
});

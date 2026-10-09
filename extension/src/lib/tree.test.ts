import { describe, expect, it } from "vitest";
import { flattenPickerOptions, ownerOfCode, sanitizeTree, type TreeState } from "./tree";

const tree: TreeState = {
  projects: [
    {
      id: "p1",
      name: "Site redesign",
      tasks: [
        { id: "t1", title: "Write copy", subtasks: [{ id: "s1", title: "Draft the hero" }] },
        { id: "t2", title: "Pick fonts", subtasks: [] },
      ],
    },
    { id: "p2", name: "Admin", tasks: [] },
  ],
};

describe("sanitizeTree", () => {
  it("accepts a well formed tree", () => {
    expect(sanitizeTree(tree)).toEqual(tree);
  });

  it("rejects malformed payloads", () => {
    expect(sanitizeTree(null)).toBeNull();
    expect(sanitizeTree({})).toBeNull();
    expect(sanitizeTree({ projects: "nope" })).toBeNull();
    expect(sanitizeTree({ projects: [{ id: 1 }] })).toBeNull();
    expect(sanitizeTree({ projects: [{ id: "p1", name: "X", tasks: [{ id: "t1" }] }] })).toBeNull();
    expect(
      sanitizeTree({ projects: [{ id: "p1", name: "X", tasks: [{ id: "t1", title: "T", subtasks: "no" }] }] }),
    ).toBeNull();
  });
});

describe("flattenPickerOptions", () => {
  it("lists projects, then tasks, then subtasks with full path labels", () => {
    const options = flattenPickerOptions(tree);
    expect(options.map((o) => o.code)).toEqual(["p:p1", "t:t1", "s:s1", "t:t2", "p:p2"]);
    expect(options[1].label).toBe("Site redesign \u203A Write copy");
    expect(options[2].label).toBe("Site redesign \u203A Write copy \u203A Draft the hero");
    expect(options[0].ownerType).toBe("project");
    expect(options[1].ownerType).toBe("task");
  });

  it("is empty for a null tree", () => {
    expect(flattenPickerOptions(null)).toEqual([]);
  });
});

describe("ownerOfCode", () => {
  it("maps codes back to the snippet owner", () => {
    const options = flattenPickerOptions(tree);
    expect(ownerOfCode(options, "p:p1")).toEqual({ ownerType: "project", ownerId: "p1" });
    expect(ownerOfCode(options, "s:s1")).toEqual({ ownerType: "task", ownerId: "s1" });
    expect(ownerOfCode(options, "t:zzz")).toBeNull();
  });
});

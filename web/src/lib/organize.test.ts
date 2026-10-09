import { describe, expect, it } from "vitest";
import type { MiscTaskData, ProjectData } from "./dashboard-data";
import {
  DEADLINE_BONUS,
  DEFAULT_RATING,
  organizeDumpItems,
  organizeScore,
  rankOrganizeItems,
  type OrganizeItem,
  type OrganizeRating,
} from "./organize";

// Test fixtures (SPEC 0 allows fixtures in tests; the running app never uses
// mock data). Minimal tree shapes: the dump selector only reads id/name/
// position/done/title and the nested subtasks list.

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

function miscTask(title: string, overrides: Partial<MiscTaskData> = {}): MiscTaskData {
  return { id: title, title, done: false, position: 0, ...overrides };
}

describe("organizeScore (SPEC 8.14 step 3)", () => {
  it("scores the spec case: impact 5, deadline today, effort 2 = 14", () => {
    expect(organizeScore({ deadline: "today", impact: 5, effort: 2 })).toBe(14);
  });

  it("adds each deadline bonus on top of twice the impact minus the effort", () => {
    // impact 4 * 2 = 8, effort 2: the bonus alone decides between these.
    expect(organizeScore({ deadline: "today", impact: 4, effort: 2 })).toBe(12);
    expect(organizeScore({ deadline: "week", impact: 4, effort: 2 })).toBe(9);
    expect(organizeScore({ deadline: "later", impact: 4, effort: 2 })).toBe(7);
    expect(organizeScore({ deadline: "none", impact: 4, effort: 2 })).toBe(6);
  });

  it("gives the documented bonus to each bucket", () => {
    expect(DEADLINE_BONUS).toEqual({ none: 0, today: 6, week: 3, later: 1 });
  });

  it("subtracts effort, so heavier work ranks lower at equal impact", () => {
    expect(organizeScore({ deadline: "today", impact: 5, effort: 1 })).toBe(
      organizeScore({ deadline: "today", impact: 5, effort: 5 }) + 4,
    );
  });
});

describe("rankOrganizeItems (SPEC 8.14 step 3)", () => {
  const item = (id: string, title: string): OrganizeItem => ({ kind: "task", id, title, label: title });

  it("sorts descending by score", () => {
    const ranked = rankOrganizeItems([
      { item: item("a", "Low"), rating: { deadline: "none", impact: 1, effort: 5 } },
      { item: item("b", "High"), rating: { deadline: "today", impact: 5, effort: 1 } },
      { item: item("c", "Middle"), rating: { deadline: "week", impact: 3, effort: 2 } },
    ]);
    expect(ranked.map((r) => r.item.id)).toEqual(["b", "c", "a"]);
    expect(ranked.map((r) => r.score)).toEqual([15, 7, -3]);
  });

  it("breaks score ties by deadline, strongest first", () => {
    // Both score 8: impact 2 today (4+6-2) vs impact 5 none (10+0-2).
    const ranked = rankOrganizeItems([
      { item: item("loose", "Someday big win"), rating: { deadline: "none", impact: 5, effort: 2 } },
      { item: item("tight", "Small urgent fix"), rating: { deadline: "today", impact: 2, effort: 2 } },
    ]);
    expect(ranked.map((r) => r.item.id)).toEqual(["tight", "loose"]);
  });

  it("breaks score-and-deadline ties by title", () => {
    const a: OrganizeRating = { deadline: "today", impact: 3, effort: 3 };
    const ranked = rankOrganizeItems([
      { item: item("w", "Write intro"), rating: a },
      { item: item("a", "Alpha task"), rating: { ...a } },
    ]);
    expect(ranked.map((r) => r.item.title)).toEqual(["Alpha task", "Write intro"]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      { item: item("b", "B"), rating: { deadline: "today" as const, impact: 5, effort: 1 } },
      { item: item("a", "A"), rating: { deadline: "none" as const, impact: 1, effort: 1 } },
    ];
    const snapshot = [...entries];
    rankOrganizeItems(entries);
    expect(entries).toEqual(snapshot);
  });

  it("ranks an empty dump as an empty list", () => {
    expect(rankOrganizeItems([])).toEqual([]);
  });
});

describe("organizeDumpItems (SPEC 8.14 step 1)", () => {
  const projects: ProjectData[] = [
    project({
      id: "p1",
      name: "Launch",
      tasks: [
        {
          id: "t-done",
          project_id: "p1",
          parent_task_id: null,
          title: "Done task",
          done: true,
          notes: "",
          position: 0,
          links: [],
          snippets: [],
          subtasks: [
            {
              id: "s1",
              project_id: "p1",
              parent_task_id: "t-done",
              title: "Sub of a done task",
              done: false,
              notes: "",
              position: 0,
              links: [],
              snippets: [],
              subtasks: [],
            },
          ],
        },
        {
          id: "t-open",
          project_id: "p1",
          parent_task_id: null,
          title: "Open task",
          done: false,
          notes: "",
          position: 1,
          links: [],
          snippets: [],
          subtasks: [
            {
              id: "s2",
              project_id: "p1",
              parent_task_id: "t-open",
              title: "Open subtask",
              done: false,
              notes: "",
              position: 0,
              links: [],
              snippets: [],
              subtasks: [],
            },
            {
              id: "s-done",
              project_id: "p1",
              parent_task_id: "t-open",
              title: "Done subtask",
              done: true,
              notes: "",
              position: 1,
              links: [],
              snippets: [],
              subtasks: [],
            },
          ],
        },
      ],
    }),
  ];

  it("dumps undone tasks and subtasks with project-qualified labels", () => {
    const items = organizeDumpItems(projects, []);
    expect(items.map((i) => [i.kind, i.label])).toEqual([
      ["subtask", "Launch > Done task > Sub of a done task"],
      ["task", "Launch > Open task"],
      ["subtask", "Launch > Open task > Open subtask"],
    ]);
  });

  it("includes undone misc tasks in the dump (SPEC 8.14 includes what wind down excludes)", () => {
    const items = organizeDumpItems(projects, [
      miscTask("Email the accountant", { id: "m1" }),
      miscTask("Filed the taxes", { id: "m2", done: true, position: 1 }),
    ]);
    const misc = items.filter((i) => i.kind === "misc");
    expect(misc).toHaveLength(1);
    expect(misc[0]).toMatchObject({ kind: "misc", id: "m1", title: "Email the accountant" });
  });

  it("keeps misc items distinct from task items so the plan route can tell them apart", () => {
    const items = organizeDumpItems([], [miscTask("Post the letter", { id: "m1" })]);
    expect(items[0].kind).toBe("misc");
  });
});

describe("DEFAULT_RATING", () => {
  it("is neutral: no deadline, middle impact and effort", () => {
    expect(DEFAULT_RATING).toEqual({ deadline: "none", impact: 3, effort: 3 });
    expect(organizeScore(DEFAULT_RATING)).toBe(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { parseSaveBody } from "@/lib/wind-down-save";

// Regression coverage for the wind down API (SPEC 8.12). GET must return the
// modal context with Chicago day keys; POST must upsert the review without
// touching the EOD fields, replace only wind-down snippets for the day, and
// rebuild tomorrow's plan order. A chainable in-memory Supabase mock backs
// every table the route touches.

type Row = Record<string, unknown>;

interface Filter {
  kind: "eq" | "gte" | "lt" | "in";
  column: string;
  value: unknown;
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const db = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const emptyTables = (): Record<string, Row[]> => ({
    day_reviews: [],
    day_plans: [],
    day_plan_tasks: [],
    sessions: [],
    projects: [],
    tasks: [],
    links: [],
    note_snippets: [],
    settings: [],
  });
  return {
    tables: emptyTables(),
    authed: true,
    failOn: null as { table: string; op: string } | null,
    calls: [] as Array<{ table: string; op: string }>,
    reset(): void {
      this.tables = emptyTables();
      this.authed = true;
      this.failOn = null;
      this.calls = [];
    },
  };
});

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const cell = row[filter.column];
    switch (filter.kind) {
      case "eq":
        return cell === filter.value;
      case "gte":
        return String(cell) >= String(filter.value);
      case "lt":
        return String(cell) < String(filter.value);
      case "in":
        return Array.isArray(filter.value) && filter.value.includes(cell);
    }
  });
}

// Tables whose writes the mock fills with column defaults. day_plan_tasks has
// a composite key and settings a fixed id, so neither gets generated values.
const NO_DEFAULTS = new Set(["day_plan_tasks", "settings"]);
let generatedRow = 0;

function withDefaults(table: string, row: Row): Row {
  if (NO_DEFAULTS.has(table)) return { ...row };
  generatedRow += 1;
  return { id: `gen-${generatedRow}`, created_at: new Date().toISOString(), ...row };
}

function execute(op: {
  table: string;
  method: string;
  filters: Filter[];
  orderColumn: string | null;
  orderAscending: boolean;
  limit: number | null;
  embedTasksTitle: boolean;
  rows: Row | Row[] | null;
  conflict: string | null;
  selected: boolean;
  single: boolean;
}): QueryResult {
  db.calls.push({ table: op.table, op: op.method });
  if (db.failOn && db.failOn.table === op.table && db.failOn.op === op.method) {
    return { data: null, error: { message: `${op.table} ${op.method} failed` } };
  }
  const rows = db.tables[op.table] ?? [];
  if (op.method === "select") {
    let out = rows.filter((row) => matches(row, op.filters));
    if (op.orderColumn) {
      out = [...out].sort((a, b) => {
        const left = a[op.orderColumn as string];
        const right = b[op.orderColumn as string];
        const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
        return op.orderAscending ? order : -order;
      });
    }
    if (op.limit !== null) out = out.slice(0, op.limit);
    if (op.embedTasksTitle) {
      out = out.map((row) => {
        const task = db.tables.tasks.find((candidate) => candidate.id === row.task_id);
        return { ...row, tasks: { title: task ? task.title : "" } };
      });
    }
    if (op.single) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
  if (op.method === "delete") {
    db.tables[op.table] = rows.filter((row) => !matches(row, op.filters));
    return { data: null, error: null };
  }
  if (op.method === "insert") {
    const toInsert = (Array.isArray(op.rows) ? op.rows : op.rows ? [op.rows] : []).map((row) => withDefaults(op.table, row));
    db.tables[op.table].push(...toInsert);
    if (op.single) return { data: toInsert[0] ?? null, error: null };
    return { data: toInsert, error: null };
  }
  if (op.method === "upsert") {
    const conflictColumn = op.conflict ?? "id";
    const incoming = withDefaults(op.table, (op.rows ?? {}) as Row);
    const index = rows.findIndex((row) => row[conflictColumn] === incoming[conflictColumn]);
    if (index >= 0) {
      // Keep the stored generated id: incoming rows never carry one.
      db.tables[op.table][index] = { ...rows[index], ...incoming, id: rows[index].id ?? incoming.id };
    } else {
      db.tables[op.table].push({ ...incoming });
    }
    if (!op.selected) return { data: null, error: null };
    const stored = index >= 0 ? db.tables[op.table][index] : db.tables[op.table][db.tables[op.table].length - 1];
    return op.single ? { data: { ...stored }, error: null } : { data: [{ ...stored }], error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => db.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      type Op = {
        table: string;
        method: string;
        filters: Filter[];
        orderColumn: string | null;
        orderAscending: boolean;
        limit: number | null;
        embedTasksTitle: boolean;
        rows: Row | Row[] | null;
        conflict: string | null;
        selected: boolean;
        single: boolean;
      };
      const op: Op = {
        table,
        method: "select",
        filters: [],
        orderColumn: null,
        orderAscending: true,
        limit: null,
        embedTasksTitle: false,
        rows: null,
        conflict: null,
        selected: false,
        single: false,
      };
      const chain = {
        select: (cols?: string) => {
          if (cols && cols.includes("tasks(title)")) op.embedTasksTitle = true;
          op.selected = true;
          return chain;
        },
        eq: (column: string, value: unknown) => {
          op.filters.push({ kind: "eq", column, value });
          return chain;
        },
        gte: (column: string, value: unknown) => {
          op.filters.push({ kind: "gte", column, value });
          return chain;
        },
        lt: (column: string, value: unknown) => {
          op.filters.push({ kind: "lt", column, value });
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          op.filters.push({ kind: "in", column, value: values });
          return chain;
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          op.orderColumn = column;
          op.orderAscending = opts?.ascending !== false;
          return chain;
        },
        limit: (count: number) => {
          op.limit = count;
          return chain;
        },
        upsert: (rows: Row, opts?: { onConflict?: string }) => {
          op.method = "upsert";
          op.rows = rows;
          op.conflict = opts?.onConflict ?? "id";
          return chain;
        },
        insert: (rows: Row | Row[]) => {
          op.method = "insert";
          op.rows = rows;
          return chain;
        },
        delete: () => {
          op.method = "delete";
          return chain;
        },
        single: () => {
          op.single = true;
          return Promise.resolve(execute(op));
        },
        then: (onOk: (result: QueryResult) => unknown, onErr: (err: unknown) => unknown) =>
          Promise.resolve(execute(op)).then(onOk, onErr),
      };
      return chain;
    },
  }),
}));

const { GET, POST } = await import("./route");

const PRJ_A = "11111111-1111-4111-8111-111111111111";
const PRJ_B = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const S1 = "44444444-4444-4444-8444-444444444444";
const T2 = "55555555-5555-4555-8555-555555555555";
const LINK_1 = "66666666-6666-4666-8666-666666666666";
const PLANNED_UUID = "77777777-7777-4777-8777-777777777777";
const NEW_UUID = "88888888-8888-4888-8888-888888888888";

// 9:30 pm in Chicago on Oct 9: anchor Oct 9, plan Oct 10.
const EVENING = new Date("2026-10-09T21:30:00-05:00");

function postRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/wind-down", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as NextRequest;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(EVENING);
  db.reset();
  db.tables.settings = [{ id: 1, display_name: "Boss", wind_down_time: "21:30" }];
  generatedRow = 0;
  db.tables.projects = [
    { id: PRJ_A, name: "Launch", position: 0 },
    { id: PRJ_B, name: "Admin", position: 1 },
  ];
  db.tables.tasks = [
    { id: T1, project_id: PRJ_A, parent_task_id: null, title: "Write intro", done: false, position: 0 },
    { id: S1, project_id: PRJ_A, parent_task_id: T1, title: "Draft outline", done: false, position: 1 },
    { id: T2, project_id: PRJ_B, parent_task_id: null, title: "File receipts", done: true, position: 0 },
  ];
  db.tables.sessions = [
    { task_id: T1, active_seconds: 1500, started_at: "2026-10-09T15:00:00.000Z" },
    { task_id: S1, active_seconds: 600, started_at: "2026-10-09T18:00:00.000Z" },
    { task_id: null, active_seconds: 999, started_at: "2026-10-09T19:00:00.000Z" },
    { task_id: T2, active_seconds: 5400, started_at: "2026-10-08T20:00:00.000Z" },
  ];
  db.tables.links = [{ id: LINK_1, owner_type: "task", owner_id: T1, name: "Guide", url: "https://example.com/guide", created_at: "2026-10-01T00:00:00.000Z" }];
  db.tables.note_snippets = [
    { id: "snip-in", owner_type: "task", owner_id: T1, content: "Earlier recap", context: "", source: "wind_down", created_at: "2026-10-09T20:00:00.000Z" },
    { id: "snip-manual", owner_type: "task", owner_id: T1, content: "From a page", context: "https://x", source: "page", created_at: "2026-10-09T20:00:00.000Z" },
    { id: "snip-old", owner_type: "task", owner_id: T2, content: "Yesterday recap", context: "", source: "wind_down", created_at: "2026-10-08T20:00:00.000Z" },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/wind-down (SPEC 8.12)", () => {
  it("returns 401 and queries nothing when unauthenticated", async () => {
    db.authed = false;
    const response = await GET();
    expect(response.status).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it("returns the modal context with Chicago day keys and per-task minutes", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.anchorDateKey).toBe("2026-10-09");
    expect(payload.planDateKey).toBe("2026-10-10");
    // Subtask minutes carry the full path label; sorted by minutes descending.
    expect(payload.taskTimes).toEqual([
      { taskId: T1, label: "Launch > Write intro", minutes: 25 },
      { taskId: S1, label: "Launch > Write intro > Draft outline", minutes: 10 },
    ]);
    // Existing wind-down snippet for the day; other sources and days excluded.
    expect(payload.recaps).toEqual([{ taskId: T1, text: "Earlier recap" }]);
    expect(payload.taskLinks).toEqual([{ ownerId: T1, name: "Guide", url: "https://example.com/guide" }]);
    expect(payload.settings).toEqual({ displayName: "Boss", windDownTime: "21:30" });
    expect(payload.projects).toEqual([
      {
        id: PRJ_A,
        name: "Launch",
        tasks: [
          { id: T1, title: "Write intro", done: false, subtasks: [{ id: S1, title: "Draft outline", done: false }] },
        ],
      },
      {
        id: PRJ_B,
        name: "Admin",
        tasks: [{ id: T2, title: "File receipts", done: true, subtasks: [] }],
      },
    ]);
  });

  it("returns the saved plan in position order with embedded titles", async () => {
    const planId = PLANNED_UUID;
    db.tables.day_plans = [{ id: planId, plan_date: "2026-10-10", start_time: "8am", location: "Office", prepped: true, created_at: "2026-10-09T20:00:00.000Z" }];
    db.tables.day_plan_tasks = [
      { plan_id: planId, task_id: S1, position: 1 },
      { plan_id: planId, task_id: T1, position: 0 },
    ];
    const response = await GET();
    const body = await json(response);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.plan).toEqual({
      startTime: "8am",
      location: "Office",
      prepped: true,
      tasks: [
        { taskId: T1, title: "Write intro", position: 0 },
        { taskId: S1, title: "Draft outline", position: 1 },
      ],
    });
  });

  it("maps a saved review and falls back to settings defaults", async () => {
    db.tables.day_reviews = [
      { review_date: "2026-10-09", done_today: "Shipped it", finished_goal: true, best_use: false, best_use_note: "Slow morning", learned: "", eod_sent_at: null },
    ];
    db.tables.settings = [];
    const response = await GET();
    const body = await json(response);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.review).toEqual({ doneToday: "Shipped it", finishedGoal: true, bestUse: false, bestUseNote: "Slow morning" });
    expect(payload.settings).toEqual({ displayName: "Boss", windDownTime: "" });
  });

  it("returns 500 with the database message when a query fails", async () => {
    db.failOn = { table: "sessions", op: "select" };
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain("sessions");
  });
});

describe("POST /api/wind-down guards (SPEC 8.12)", () => {
  it("returns 401 and writes nothing when unauthenticated", async () => {
    db.authed = false;
    const response = await POST(postRequest({ review: null, recaps: null, planning: null, prepped: false }));
    expect(response.status).toBe(401);
    expect(db.calls.every((call) => call.op !== "upsert" && call.op !== "insert" && call.op !== "delete")).toBe(true);
  });

  it("rejects bodies that are not JSON objects", async () => {
    const response = await POST(postRequest("not json"));
    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ ok: false, error: "Body must be JSON." });
  });

  it("rejects malformed sections with useful messages", () => {
    expect(parseSaveBody({ review: "yes" })).toEqual({ ok: false, error: "Review must be an object or null." });
    expect(parseSaveBody({ review: {} })).toEqual({ ok: false, error: "Review answers are missing." });
    expect(parseSaveBody({ recaps: "nope" })).toEqual({ ok: false, error: "Recaps must be a list of at most 50 answers." });
    expect(parseSaveBody({ recaps: [{ taskId: "not-a-uuid", text: "x" }] })).toEqual({ ok: false, error: "Recap task is not a valid task." });
    expect(parseSaveBody({ recaps: [{ taskId: T1, text: "   " }] })).toEqual({ ok: false, error: "Recap notes cannot be empty." });
    expect(parseSaveBody({ planning: { startTime: "", location: "", tasks: [{ kind: "mystery" }] } })).toEqual({ ok: false, error: "Planned tasks must be existing or new." });
    expect(parseSaveBody({ planning: { startTime: "", location: "", tasks: [{ kind: "new", projectId: null, projectName: "", taskTitle: "" }] } })).toEqual({ ok: false, error: "A new task needs a title." });
    expect(parseSaveBody({ planning: { startTime: "", location: "", tasks: [{ kind: "new", projectId: null, projectName: "  ", taskTitle: "x" }] } })).toEqual({ ok: false, error: "A new project needs a name." });
    expect(parseSaveBody({ planning: { startTime: "", location: "", tasks: [{ kind: "new", projectId: "abc", projectName: "", taskTitle: "x" }] } })).toEqual({ ok: false, error: "Planned project is not a valid project." });
    const fifty = Array.from({ length: 50 }, (_, index) => ({ taskId: T1, text: `Recap ${index}` }));
    const fiftyOne = [...fifty, { taskId: T1, text: "one too many" }];
    expect(parseSaveBody({ recaps: fiftyOne }).ok).toBe(false);
    expect(parseSaveBody({ recaps: fifty }).ok).toBe(true);
  });
});

describe("POST /api/wind-down review (SPEC 8.12 steps 1-3)", () => {
  it("upserts the review for the anchor date and never touches EOD fields", async () => {
    db.tables.day_reviews = [
      {
        review_date: "2026-10-09",
        done_today: "Old answer",
        finished_goal: null,
        best_use: null,
        best_use_note: "",
        learned: "Keep the learnings",
        eod_sent_at: "2026-10-09T02:00:00.000Z",
      },
    ];
    const response = await POST(
      postRequest({
        review: { doneToday: "  New words  ", finishedGoal: true, bestUse: false, bestUseNote: "Slow start" },
        recaps: null,
        planning: null,
        prepped: false,
      }),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toEqual({ ok: true, anchorDateKey: "2026-10-09", planDateKey: "2026-10-10" });
    expect(db.tables.day_reviews).toHaveLength(1);
    expect(db.tables.day_reviews[0]).toMatchObject({
      review_date: "2026-10-09",
      done_today: "New words",
      finished_goal: true,
      best_use: false,
      best_use_note: "Slow start",
      learned: "Keep the learnings",
      eod_sent_at: "2026-10-09T02:00:00.000Z",
    });
  });

  it("returns 500 with the database message when the upsert fails", async () => {
    db.failOn = { table: "day_reviews", op: "upsert" };
    const response = await POST(postRequest({ review: { doneToday: "x", finishedGoal: null, bestUse: null, bestUseNote: "" }, recaps: null, planning: null, prepped: false }));
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(String(body.error)).toContain("day_reviews write failed");
  });
});

describe("POST /api/wind-down recaps (SPEC 8.12 step 4)", () => {
  it("replaces only wind-down snippets for the anchor day window", async () => {
    const response = await POST(
      postRequest({
        review: null,
        recaps: [{ taskId: T1, text: "Fresh recap" }],
        planning: null,
        prepped: false,
      }),
    );
    expect(response.status).toBe(200);
    const snippets = db.tables.note_snippets;
    // Old in-window wind-down snippet gone, its replacement inserted with
    // source wind_down; page snippets and other-day snippets untouched.
    expect(snippets.some((row) => row.id === "snip-in")).toBe(false);
    expect(snippets.some((row) => row.id === "snip-manual")).toBe(true);
    expect(snippets.some((row) => row.id === "snip-old")).toBe(true);
    const fresh = snippets.filter((row) => row.source === "wind_down" && String(row.created_at) >= "2026-10-09");
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ owner_type: "task", owner_id: T1, content: "Fresh recap", source: "wind_down" });
  });

  it("keeps earlier recaps when a task no longer exists (validate before delete)", async () => {
    const response = await POST(
      postRequest({
        review: null,
        recaps: [{ taskId: NEW_UUID, text: "Dangling" }],
        planning: null,
        prepped: false,
      }),
    );
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(String(body.error)).toContain("no longer exists");
    expect(db.tables.note_snippets.some((row) => row.id === "snip-in")).toBe(true);
  });
});

describe("POST /api/wind-down planning (SPEC 8.12 steps 5-8)", () => {
  it("upserts the plan for the plan date, reuses existing tasks and creates new ones", async () => {
    const response = await POST(
      postRequest({
        review: null,
        recaps: null,
        planning: {
          startTime: "8am",
          location: "Office",
          tasks: [
            { kind: "existing", taskId: T1 },
            { kind: "new", projectId: null, projectName: "Side", taskTitle: "Brand new task" },
          ],
        },
        prepped: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(db.tables.day_plans).toHaveLength(1);
    expect(db.tables.day_plans[0]).toMatchObject({ plan_date: "2026-10-10", start_time: "8am", location: "Office", prepped: true });
    const createdProject = db.tables.projects.find((row) => row.name === "Side");
    expect(createdProject).toBeDefined();
    const createdTask = db.tables.tasks.find((row) => row.title === "Brand new task");
    expect(createdTask).toMatchObject({ project_id: createdProject?.id });
    expect(db.tables.day_plan_tasks).toEqual([
      { plan_id: db.tables.day_plans[0].id, task_id: T1, position: 0 },
      { plan_id: db.tables.day_plans[0].id, task_id: createdTask?.id, position: 1 },
    ]);
  });

  it("replaces the plan rows on a second save the same evening", async () => {
    await POST(
      postRequest({
        review: null,
        recaps: null,
        planning: { startTime: "8am", location: "Office", tasks: [{ kind: "existing", taskId: T1 }, { kind: "existing", taskId: T2 }] },
        prepped: false,
      }),
    );
    await POST(
      postRequest({
        review: null,
        recaps: null,
        planning: { startTime: "9am", location: "Home", tasks: [{ kind: "existing", taskId: T2 }] },
        prepped: true,
      }),
    );
    expect(db.tables.day_plans).toHaveLength(1);
    expect(db.tables.day_plan_tasks).toEqual([{ plan_id: db.tables.day_plans[0].id, task_id: T2, position: 0 }]);
    expect(db.tables.day_plans[0]).toMatchObject({ start_time: "9am", location: "Home", prepped: true });
  });

  it("rejects existing tasks that no longer exist and leaves the plan rows alone", async () => {
    db.tables.day_plan_tasks = [{ plan_id: PLANNED_UUID, task_id: T1, position: 0 }];
    db.tables.day_plans = [{ id: PLANNED_UUID, plan_date: "2026-10-10", start_time: "", location: "", prepped: false, created_at: "2026-10-09T20:00:00.000Z" }];
    const response = await POST(
      postRequest({
        review: null,
        recaps: null,
        planning: { startTime: "", location: "", tasks: [{ kind: "existing", taskId: NEW_UUID }] },
        prepped: false,
      }),
    );
    expect(response.status).toBe(400);
    expect(db.tables.day_plan_tasks).toHaveLength(1);
  });

  it("rejects a new task pointing at a project that no longer exists", async () => {
    const response = await POST(
      postRequest({
        review: null,
        recaps: null,
        planning: { startTime: "", location: "", tasks: [{ kind: "new", projectId: NEW_UUID, projectName: "", taskTitle: "Orphan" }] },
        prepped: false,
      }),
    );
    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ ok: false, error: "A planned project no longer exists." });
    expect(db.tables.tasks.some((row) => row.title === "Orphan")).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// Regression coverage for the panel data route: the nearest plan whose
// plan_date is today or later in America/Chicago is returned with its ordered
// rows and project context, past plans are ignored, and unauthenticated calls
// get 401. A chainable in-memory Supabase mock backs the four tables.

type Row = Record<string, unknown>;

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const db = vi.hoisted(() => {
  const emptyTables = (): Record<string, Row[]> => ({
    day_plans: [],
    day_plan_tasks: [],
    projects: [],
    tasks: [],
  });
  return {
    tables: emptyTables(),
    authed: true,
    failTable: null as string | null,
    reset(): void {
      this.tables = emptyTables();
      this.authed = true;
      this.failTable = null;
    },
  };
});

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => db.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const state = {
        filters: [] as Array<{ column: string; kind: "eq" | "gte"; value: unknown }>,
        orderColumn: null as string | null,
        limitCount: null as number | null,
        columns: "",
      };
      const run = (): QueryResult => {
        if (db.failTable === table) {
          return { data: null, error: { message: `${table} query failed` } };
        }
        let rows = [...(db.tables[table] ?? [])];
        rows = rows.filter((row) =>
          state.filters.every((filter) => {
            const cell = row[filter.column];
            return filter.kind === "eq" ? cell === filter.value : String(cell) >= String(filter.value);
          }),
        );
        if (state.orderColumn) {
          rows.sort((a, b) => {
            const left = a[state.orderColumn as string];
            const right = b[state.orderColumn as string];
            const order =
              typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
            return order;
          });
        }
        if (state.limitCount !== null) rows = rows.slice(0, state.limitCount);
        if (table === "day_plan_tasks" && state.columns.includes("tasks(")) {
          rows = rows.map((row) => {
            const task = db.tables.tasks.find((candidate) => candidate.id === row.task_id);
            return {
              ...row,
              tasks: task
                ? {
                    title: task.title,
                    done: task.done,
                    project_id: task.project_id,
                    parent_task_id: task.parent_task_id,
                  }
                : null,
            };
          });
        }
        return { data: rows, error: null };
      };
      const builder = {
        select(columns: string) {
          state.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ column, kind: "eq", value });
          return builder;
        },
        gte(column: string, value: unknown) {
          state.filters.push({ column, kind: "gte", value });
          return builder;
        },
        order(column: string) {
          state.orderColumn = column;
          return builder;
        },
        limit(count: number) {
          state.limitCount = count;
          return builder;
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | undefined | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
        ): PromiseLike<TResult1 | TResult2> {
          return Promise.resolve().then(() => run()).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  }),
}));

// Chicago midnight on 10 Oct 2026 (CDT, UTC-5): todayKey is "2026-10-10".
const MIDNIGHT = new Date("2026-10-10T05:00:00Z");

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PARENT_ID = "22222222-2222-2222-2222-222222222222";
const SUBTASK_ID = "33333333-3333-3333-3333-333333333333";
const TOP_TASK_ID = "44444444-4444-4444-4444-444444444444";
const DONE_TASK_ID = "55555555-5555-5555-5555-555555555555";
const PLAN_ID = "66666666-6666-6666-6666-666666666666";
const LATER_PLAN_ID = "77777777-7777-7777-7777-777777777777";

function seedWorld(): void {
  db.tables.projects = [{ id: PROJECT_ID, name: "Test", position: 0 }];
  db.tables.tasks = [
    { id: PARENT_ID, title: "Write intro", project_id: PROJECT_ID, parent_task_id: null },
    { id: SUBTASK_ID, title: "Outline", project_id: PROJECT_ID, parent_task_id: PARENT_ID },
    { id: TOP_TASK_ID, title: "Record audio", project_id: PROJECT_ID, parent_task_id: null },
    { id: DONE_TASK_ID, title: "Pick a day", project_id: PROJECT_ID, parent_task_id: null, done: true },
  ];
  db.tables.day_plans = [
    { id: PLAN_ID, plan_date: "2026-10-10", start_time: "8am", location: "home", prepped: true },
  ];
  db.tables.day_plan_tasks = [
    { plan_id: PLAN_ID, task_id: TOP_TASK_ID, position: 1 },
    { plan_id: PLAN_ID, task_id: DONE_TASK_ID, position: 2 },
    { plan_id: PLAN_ID, task_id: SUBTASK_ID, position: 0 },
  ];
}

interface PlanRowJson {
  taskId: string;
  title: string;
  done: boolean;
  contextLabel: string;
  position: number;
}

beforeEach(() => {
  db.reset();
  vi.useFakeTimers();
  vi.setSystemTime(MIDNIGHT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/day-plans/upcoming", () => {
  it("returns 401 without a session", async () => {
    db.authed = false;
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns plan null when nothing is saved", async () => {
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; plan: unknown };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.plan).toBeNull();
  });

  it("ignores plans dated before today in America/Chicago", async () => {
    seedWorld();
    db.tables.day_plans[0].plan_date = "2026-10-09"; // yesterday: skipped
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; plan: unknown };
    expect(body.plan).toBeNull();
  });

  it("picks the nearest plan when several future plans exist", async () => {
    seedWorld();
    db.tables.day_plans.push({ id: LATER_PLAN_ID, plan_date: "2026-10-11", start_time: "", location: "", prepped: false });
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; plan: { planDateKey: string } | null };
    expect(body.plan?.planDateKey).toBe("2026-10-10");
  });

  it("returns rows in plan order with project context and done flags", async () => {
    seedWorld();
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; plan: { startTime: string; location: string; prepped: boolean; rows: PlanRowJson[] } | null };
    expect(body.plan?.startTime).toBe("8am");
    expect(body.plan?.location).toBe("home");
    expect(body.plan?.prepped).toBe(true);
    expect(body.plan?.rows.map((row) => [row.taskId, row.contextLabel, row.done])).toEqual([
      [SUBTASK_ID, "Test > Write intro", false],
      [TOP_TASK_ID, "Test", false],
      [DONE_TASK_ID, "Test", true],
    ]);
    expect(body.plan?.rows.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("returns empty rows for a saved plan without tasks", async () => {
    seedWorld();
    db.tables.day_plan_tasks = [];
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; plan: { rows: PlanRowJson[] } | null };
    expect(body.plan?.rows).toEqual([]);
  });

  it("reports query failures instead of serving empty data", async () => {
    seedWorld();
    db.failTable = "day_plan_tasks";
    const response = await GET();
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("day_plan_tasks query failed");
  });
});

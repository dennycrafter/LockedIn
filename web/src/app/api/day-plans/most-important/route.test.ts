import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { todayKey } from "@/lib/time";

// Contract tests for POST /api/day-plans/most-important (SPEC 8.14 step 4):
// find-or-create today's day_plans row in America/Chicago, put the chosen
// task at position 0 of day_plan_tasks, keep the other tasks in order, and
// reject anything that is not a real tasks-table id (misc ids included,
// because day_plan_tasks can only reference tasks).

const state = vi.hoisted(() => ({
  authed: true,
  taskRows: [] as Array<{ id: string }>,
  planRows: [] as Array<{ id: string; plan_date: string }>,
  planTaskRows: [] as Array<{ plan_id: string; task_id: string; position: number }>,
  planSeq: 0,
  taskError: null as { message: string } | null,
  planError: null as { message: string } | null,
  planTaskError: null as { message: string } | null,
  upserts: [] as Array<{ table: string; payload: Record<string, unknown>; onConflict?: string }>,
  updates: [] as Array<{ planId: string; taskId: string; position: number }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === "tasks") {
        return {
          select: () => ({
            eq: (_column: string, id: string) => ({
              limit: async () => {
                if (state.taskError) return { data: null, error: state.taskError };
                return { data: state.taskRows.filter((t) => t.id === id), error: null };
              },
            }),
          }),
        };
      }
      if (table === "day_plans") {
        return {
          upsert: async (payload: Record<string, unknown>, options?: { onConflict?: string }) => {
            state.upserts.push({ table, payload, onConflict: options?.onConflict });
            if (state.planError) return { error: state.planError };
            const date = payload.plan_date as string;
            if (!state.planRows.some((p) => p.plan_date === date)) {
              state.planRows.push({ id: `plan-${++state.planSeq}`, plan_date: date });
            }
            return { error: null };
          },
          select: () => ({
            eq: (_column: string, dateKey: string) => ({
              limit: async () => {
                if (state.planError) return { data: null, error: state.planError };
                return { data: state.planRows.filter((p) => p.plan_date === dateKey), error: null };
              },
            }),
          }),
        };
      }
      // day_plan_tasks
      return {
        select: () => ({
          eq: (_column: string, planId: string) => ({
            order: async () => {
              if (state.planTaskError) return { data: null, error: state.planTaskError };
              const rows = state.planTaskRows
                .filter((r) => r.plan_id === planId)
                .map((r) => ({ task_id: r.task_id, position: r.position }));
              rows.sort((a, b) => a.position - b.position);
              return { data: rows, error: null };
            },
          }),
        }),
        upsert: async (payload: Record<string, unknown>, options?: { onConflict?: string }) => {
          state.upserts.push({ table, payload, onConflict: options?.onConflict });
          if (state.planTaskError) return { error: state.planTaskError };
          const planId = payload.plan_id as string;
          const taskId = payload.task_id as string;
          const position = payload.position as number;
          const existing = state.planTaskRows.find((r) => r.plan_id === planId && r.task_id === taskId);
          if (existing) existing.position = position;
          else state.planTaskRows.push({ plan_id: planId, task_id: taskId, position });
          return { error: null };
        },
        update: (payload: { position: number }) => ({
          eq: (_planColumn: string, planId: string) => ({
            eq: (_taskColumn: string, taskId: string) => {
              const row = state.planTaskRows.find((r) => r.plan_id === planId && r.task_id === taskId);
              if (row) row.position = payload.position;
              state.updates.push({ planId, taskId, position: payload.position });
              return Promise.resolve({ error: state.planTaskError });
            },
          }),
        }),
      };
    },
  }),
}));

// Import AFTER the mocks so the handler picks up the mocked modules.
const { POST } = await import("./route");

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "plan-1";

function post(taskId: unknown, rawBody?: string): NextRequest {
  return new Request("http://localhost/api/day-plans/most-important", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify({ taskId }),
  }) as NextRequest;
}

beforeEach(() => {
  state.authed = true;
  state.taskRows = [{ id: TASK_ID }];
  state.planRows = [];
  state.planTaskRows = [];
  state.planSeq = 0;
  state.taskError = null;
  state.planError = null;
  state.planTaskError = null;
  state.upserts = [];
  state.updates = [];
});

describe("POST /api/day-plans/most-important (SPEC 8.14 step 4)", () => {
  it("creates today's plan row when missing and inserts the chosen task first", async () => {
    const response = await POST(post(TASK_ID));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, planDate: todayKey() });

    // Today = America/Chicago, claimed with the unique plan_date upsert.
    expect(state.upserts[0]).toEqual({
      table: "day_plans",
      payload: { plan_date: todayKey() },
      onConflict: "plan_date",
    });
    expect(state.planRows).toEqual([{ id: PLAN_ID, plan_date: todayKey() }]);
    expect(state.planTaskRows).toEqual([{ plan_id: PLAN_ID, task_id: TASK_ID, position: 0 }]);
  });

  it("reuses an existing plan for today instead of creating a second row", async () => {
    state.planRows.push({ id: PLAN_ID, plan_date: todayKey() });
    state.planTaskRows.push({ plan_id: PLAN_ID, task_id: OTHER_ID, position: 0 });

    const response = await POST(post(TASK_ID));

    expect(response.status).toBe(200);
    expect(state.planRows).toHaveLength(1);
    expect(state.planTaskRows.map((r) => [r.task_id, r.position])).toEqual([
      [OTHER_ID, 1],
      [TASK_ID, 0],
    ]);
  });

  it("puts the chosen task first and shifts existing planned tasks down one slot", async () => {
    state.planRows.push({ id: PLAN_ID, plan_date: todayKey() });
    state.planTaskRows.push(
      { plan_id: PLAN_ID, task_id: OTHER_ID, position: 0 },
      { plan_id: PLAN_ID, task_id: THIRD_ID, position: 1 },
    );

    await POST(post(TASK_ID));

    const order = state.planTaskRows
      .map((r) => [r.task_id, r.position] as const)
      .sort((a, b) => a[1] - b[1]);
    expect(order).toEqual([
      [TASK_ID, 0],
      [OTHER_ID, 1],
      [THIRD_ID, 2],
    ]);
    // Relative order of the untouched tasks is preserved by the shift.
    expect(state.updates.map((u) => [u.taskId, u.position])).toEqual([
      [OTHER_ID, 1],
      [THIRD_ID, 2],
    ]);
    // The chosen task claims position 0 through the composite-key upsert.
    expect(state.upserts.at(-1)).toEqual({
      table: "day_plan_tasks",
      payload: { plan_id: PLAN_ID, task_id: TASK_ID, position: 0 },
      onConflict: "plan_id,task_id",
    });
  });

  it("moves a task that is already planned to the front without duplicating it", async () => {
    state.planRows.push({ id: PLAN_ID, plan_date: todayKey() });
    state.planTaskRows.push(
      { plan_id: PLAN_ID, task_id: OTHER_ID, position: 0 },
      { plan_id: PLAN_ID, task_id: TASK_ID, position: 1 },
    );

    const response = await POST(post(TASK_ID));

    expect(response.status).toBe(200);
    expect(state.planTaskRows).toHaveLength(2);
    const order = state.planTaskRows
      .map((r) => [r.task_id, r.position] as const)
      .sort((a, b) => a[1] - b[1]);
    expect(order).toEqual([
      [TASK_ID, 0],
      [OTHER_ID, 1],
    ]);
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const response = await POST(post(TASK_ID));
    expect(response.status).toBe(401);
    expect(state.upserts).toEqual([]);
    expect(state.planRows).toEqual([]);
  });

  it("returns 400 when taskId is missing or blank", async () => {
    for (const bad of [null, "", "   "]) {
      const response = await POST(post(bad));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toHaveProperty("error");
    }
    expect(state.upserts).toEqual([]);
  });

  it("returns 400 when the body is not JSON", async () => {
    const response = await POST(post(TASK_ID, "not json"));
    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown task, including a misc task id, and creates no plan", async () => {
    state.taskRows = [];
    const response = await POST(post("m-misc-id"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Task not found." });
    expect(state.planRows).toEqual([]);
    expect(state.upserts).toEqual([]);
  });

  it("returns 500 with the database error when the task lookup fails", async () => {
    state.taskError = { message: "permission denied" };
    const response = await POST(post(TASK_ID));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "permission denied" });
  });

  it("returns 500 with the database error when the plan upsert fails", async () => {
    state.planError = { message: "relation does not exist" };
    const response = await POST(post(TASK_ID));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "relation does not exist" });
    expect(state.planTaskRows).toEqual([]);
  });
});

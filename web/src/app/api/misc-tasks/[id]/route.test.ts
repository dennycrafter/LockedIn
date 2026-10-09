import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Regression coverage for the misc task delete path (SPEC 8.9). The panel's
// Delete button calls DELETE /api/misc-tasks/[id]; these tests pin the
// contract: the right table, the id from the route path, ok on success,
// 401 unauthenticated, 500 with the database error.

const state = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; title: string; done: boolean }>,
  deleteError: null as { message: string } | null,
  authed: true,
  calls: [] as Array<{ table: string; id: string }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: (_column: string, id: string) => {
          state.calls.push({ table, id });
          if (state.deleteError) {
            return Promise.resolve({ error: state.deleteError });
          }
          state.rows = state.rows.filter((row) => row.id !== id);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const { DELETE } = await import("./route");

const TASK_ID = "33333333-3333-4333-8333-333333333333";

function deleteRequest(id: string): { request: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    request: new Request(`http://localhost/api/misc-tasks/${id}`, { method: "DELETE" }) as NextRequest,
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  state.rows = [{ id: TASK_ID, title: "Reply to email", done: false }];
  state.deleteError = null;
  state.authed = true;
  state.calls = [];
});

describe("DELETE /api/misc-tasks/[id] (SPEC 8.9)", () => {
  it("deletes a misc task by id and confirms", async () => {
    const { request, ctx } = deleteRequest(TASK_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.rows).toHaveLength(0);
  });

  it("targets the misc_tasks table with the id from the route path", async () => {
    const { request, ctx } = deleteRequest(TASK_ID);
    await DELETE(request, ctx);
    expect(state.calls).toEqual([{ table: "misc_tasks", id: TASK_ID }]);
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const { request, ctx } = deleteRequest(TASK_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
    expect(state.rows).toHaveLength(1);
  });

  it("returns 500 with the database error when the delete fails", async () => {
    state.deleteError = { message: "delete blocked" };
    const { request, ctx } = deleteRequest(TASK_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "delete blocked" });
    expect(state.rows).toHaveLength(1);
  });
});

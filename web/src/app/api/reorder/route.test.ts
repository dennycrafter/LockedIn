import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Regression coverage for the drag-reorder persistence bug (SPEC 8.2). The
// dashboard's onReorder posts { kind, ids } with kind "projects" | "tasks" |
// "subtasks" (web/src/components/lockedin-app.tsx), so the route must accept
// exactly that shape: ids (not just orderedIds) and the "subtasks" kind,
// which persists positions into the tasks table. The misc task list posts
// { kind: "misc_tasks", orderedIds }, so orderedIds stays accepted.

const state = vi.hoisted(() => ({
  authed: true,
  updateError: null as { message: string } | null,
  calls: [] as Array<{ table: string; id: string; position: number }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (values: { position: number }) => ({
        eq: (_column: string, id: string) => {
          state.calls.push({ table, id, position: values.position });
          return Promise.resolve({ error: state.updateError });
        },
      }),
    }),
  }),
}));

const { POST } = await import("./route");

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const S1 = "44444444-4444-4444-8444-444444444444";
const S2 = "55555555-5555-4555-8555-555555555555";

function reorderRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  state.authed = true;
  state.updateError = null;
  state.calls = [];
});

describe("POST /api/reorder (SPEC 8.2 dashboard payload)", () => {
  it("persists a project drag posted as { kind: 'projects', ids }", async () => {
    const response = await POST(reorderRequest({ kind: "projects", ids: [P2, P1, P3] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.calls).toEqual([
      { table: "projects", id: P2, position: 0 },
      { table: "projects", id: P1, position: 1 },
      { table: "projects", id: P3, position: 2 },
    ]);
  });

  it("persists a subtask drag posted as { kind: 'subtasks', ids } into the tasks table", async () => {
    const response = await POST(reorderRequest({ kind: "subtasks", ids: [S2, S1] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.calls).toEqual([
      { table: "tasks", id: S2, position: 0 },
      { table: "tasks", id: S1, position: 1 },
    ]);
  });

  it("still accepts the { kind, orderedIds } shape used by misc task reorder", async () => {
    const response = await POST(reorderRequest({ kind: "misc_tasks", orderedIds: [P1, P2] }));
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([
      { table: "misc_tasks", id: P1, position: 0 },
      { table: "misc_tasks", id: P2, position: 1 },
    ]);
  });

  it("rejects ids that are not uuids and never touches the database", async () => {
    const response = await POST(reorderRequest({ kind: "projects", ids: ["not-a-uuid"] }));
    expect(response.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("rejects a payload with neither ids nor orderedIds", async () => {
    const response = await POST(reorderRequest({ kind: "projects" }));
    expect(response.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const response = await POST(reorderRequest({ kind: "projects", ids: [P1] }));
    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("returns 500 with the database error when an update fails", async () => {
    state.updateError = { message: "update blocked" };
    const response = await POST(reorderRequest({ kind: "tasks", ids: [P1, P2] }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "update blocked" });
  });
});

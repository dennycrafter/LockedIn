import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { decisionCount, loopCount, totalSavedCount } from "@/lib/open-loops";

// Regression coverage for the delete path (open loops AND decisions).
// A delete failure in dogfooding showed up as a 405: the collection route
// /api/open-loops only serves POST, so a DELETE without the id 405s by
// design. The dashboard client deletes by id on the [id] route; these tests
// pin that contract and prove deletion works for both kinds and that the
// counts move after a delete.

interface FakeRow {
  id: string;
  kind: "loop" | "decision";
  text: string;
}

// vi.hoisted so the vi.mock factories below can share this state even though
// they are hoisted above the variable declarations.
const state = vi.hoisted(() => ({
  rows: [] as FakeRow[],
  deleteError: null as { message: string } | null,
  authed: true,
  calls: [] as Array<{ table: string; column: string; id: string }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, id: string) => {
          state.calls.push({ table, column, id });
          if (state.deleteError) {
            return Promise.resolve({ error: state.deleteError });
          }
          state.rows = state.rows.filter((row) => row.id !== id);
          return Promise.resolve({ error: null });
        },
      }),
      select: () => Promise.resolve({ data: [...state.rows], error: null }),
    }),
  }),
}));

// Import AFTER the mocks so the handlers pick up the mocked modules.
const { DELETE } = await import("./route");
const collection = await import("../route");

function deleteRequest(id: string): { request: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    request: new Request(`http://localhost/api/open-loops/${id}`, { method: "DELETE" }) as NextRequest,
    ctx: { params: Promise.resolve({ id }) },
  };
}

const LOOP_ID = "11111111-1111-4111-8111-111111111111";
const DECISION_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.rows = [
    { id: LOOP_ID, kind: "loop", text: "Reply to the accountant" },
    { id: DECISION_ID, kind: "decision", text: "Vendor or in-house" },
  ];
  state.deleteError = null;
  state.authed = true;
  state.calls = [];
});

describe("DELETE /api/open-loops/[id] (SPEC 8.8)", () => {
  it("deletes an open loop by id and confirms", async () => {
    const { request, ctx } = deleteRequest(LOOP_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.rows.some((row) => row.id === LOOP_ID)).toBe(false);
  });

  it("deletes a decision through the same route (kind is a column, not a table)", async () => {
    const { request, ctx } = deleteRequest(DECISION_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(200);
    expect(state.rows.some((row) => row.id === DECISION_ID)).toBe(false);
    expect(state.rows.some((row) => row.id === LOOP_ID)).toBe(true);
  });

  it("targets the open_loops table with the id from the route path", async () => {
    const { request, ctx } = deleteRequest(DECISION_ID);
    await DELETE(request, ctx);
    expect(state.calls).toEqual([{ table: "open_loops", column: "id", id: DECISION_ID }]);
  });

  it("counts update after a deletion (loops 0, decisions 1, total 1)", async () => {
    const { request, ctx } = deleteRequest(LOOP_ID);
    await DELETE(request, ctx);
    const remaining: FakeRow[] = [...state.rows];
    expect(loopCount(remaining)).toBe(0);
    expect(decisionCount(remaining)).toBe(1);
    expect(totalSavedCount(remaining)).toBe(1);
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const { request, ctx } = deleteRequest(LOOP_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
    expect(state.rows).toHaveLength(2);
  });

  it("returns 500 with the database error when the delete fails", async () => {
    state.deleteError = { message: "operator does not exist" };
    const { request, ctx } = deleteRequest(LOOP_ID);
    const response = await DELETE(request, ctx);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "operator does not exist" });
    expect(state.rows).toHaveLength(2);
  });

  it("the collection route stays POST-only: a DELETE there 405s by design", () => {
    const exports = collection as Record<string, unknown>;
    expect(exports.DELETE).toBeUndefined();
    expect(exports.POST).toBeTypeOf("function");
  });
});

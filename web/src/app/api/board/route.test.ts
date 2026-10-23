import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Board API (Oct 2026): GET returns the saved board or null, PUT checks and
// upserts it, a missing table says which migration to run, and nothing
// touches the database without a session.

const state = vi.hoisted(() => ({
  authed: true,
  rows: [] as Array<{ scene: unknown; updated_at: string }>,
  error: null as { code?: string; message: string } | null,
  upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/require-user", () => ({ isAuthed: async () => state.authed }));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve(state.error ? { data: null, error: state.error } : { data: state.rows, error: null }),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        state.upserts.push(row);
        return Promise.resolve({ error: state.error });
      },
    }),
  }),
}));

const { GET, PUT } = await import("./route");

function put(body: unknown): NextRequest {
  return new Request("http://localhost/api/board", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as NextRequest;
}

const scene = { elements: [{ id: "a", type: "rectangle" }], files: {}, view: { scrollX: 0, scrollY: 0, zoom: 1 } };

beforeEach(() => {
  state.authed = true;
  state.rows = [];
  state.error = null;
  state.upserts = [];
});

describe("GET /api/board", () => {
  it("returns null before the first save", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ board: null });
  });

  it("returns the saved board with its time", async () => {
    state.rows = [{ scene, updated_at: "2026-10-22T10:00:00.000Z" }];
    expect(await (await GET()).json()).toEqual({ board: { scene, savedAt: "2026-10-22T10:00:00.000Z" } });
  });

  it("names the migration when the table is missing", async () => {
    state.error = { code: "PGRST205", message: "Could not find the table 'public.boards' in the schema cache" };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ needsMigration: true, error: expect.stringMatching(/0004_add_boards/) });
  });

  it("refuses without a session", async () => {
    state.authed = false;
    expect((await GET()).status).toBe(401);
  });
});

describe("PUT /api/board", () => {
  it("saves a valid board", async () => {
    const response = await PUT(put({ scene }));
    expect(response.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({ id: "main", scene });
  });

  it("rejects bad input without touching the database", async () => {
    expect((await PUT(put("not json"))).status).toBe(400);
    expect((await PUT(put({ scene: { elements: "x" } }))).status).toBe(400);
    expect(state.upserts).toHaveLength(0);
  });

  it("refuses without a session", async () => {
    state.authed = false;
    expect((await PUT(put({ scene }))).status).toBe(401);
    expect(state.upserts).toHaveLength(0);
  });
});

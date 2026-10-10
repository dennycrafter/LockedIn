import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Regression coverage for the wind-down time setting (SPEC 8.12, T6a-1) on
// PATCH /api/settings: the setting saves as free text, empty clears it, a
// non-string body is rejected, and unauthenticated requests never reach the
// database. The other settings fields belong to their own tickets; only the
// wind-down branch is exercised here.

const state = vi.hoisted(() => ({
  row: { id: 1, display_name: "Boss", completion_style: "dramatic", time_study_minutes: null, wind_down_time: "" },
  updateError: null as { message: string } | null,
  authed: true,
  calls: [] as Array<{ table: string; update: Record<string, unknown> }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (update: Record<string, unknown>) => ({
        eq: () => ({
          select: () => {
            state.calls.push({ table, update });
            if (state.updateError) return Promise.resolve({ data: null, error: state.updateError });
            state.row = { ...state.row, ...update };
            return Promise.resolve({ data: [state.row], error: null });
          },
        }),
      }),
    }),
  }),
}));

const { PATCH } = await import("./route");

function patchRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as NextRequest;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.row = { id: 1, display_name: "Boss", completion_style: "dramatic", time_study_minutes: null, wind_down_time: "" };
  state.updateError = null;
  state.authed = true;
  state.calls = [];
});

describe("PATCH /api/settings wind_down_time (SPEC 8.12, T6a-1)", () => {
  it("saves a trimmed wind-down time and returns the settings row", async () => {
    const response = await PATCH(patchRequest({ wind_down_time: "  21:30  " }));
    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body.settings as Record<string, unknown>).wind_down_time).toBe("21:30");
    expect(state.calls).toEqual([{ table: "settings", update: { wind_down_time: "21:30" } }]);
  });

  it("clears the wind-down time with an empty string", async () => {
    state.row.wind_down_time = "21:30";
    const response = await PATCH(patchRequest({ wind_down_time: "" }));
    expect(response.status).toBe(200);
    expect(state.row.wind_down_time).toBe("");
  });

  it("rejects a non-string wind-down time without touching the database", async () => {
    const response = await PATCH(patchRequest({ wind_down_time: 21 }));
    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ error: "Wind down time must be text." });
    expect(state.calls).toEqual([]);
  });

  it("returns 500 with the database error when the update fails", async () => {
    state.updateError = { message: "settings write failed" };
    const response = await PATCH(patchRequest({ wind_down_time: "21:30" }));
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.error).toBe("settings write failed");
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const response = await PATCH(patchRequest({ wind_down_time: "21:30" }));
    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
  });
});

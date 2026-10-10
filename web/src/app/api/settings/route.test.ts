import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Regression coverage for the settings API: the wind-down time setting
// (SPEC 8.12, T6a-1) and the helper mode setting (SPEC 8.15, T8) save on
// PATCH, and GET returns the row plus the computed aiAvailable flag so the
// settings toggle knows whether the Anthropic key is configured without the
// key ever reaching the browser. Unauthenticated requests never touch the
// database.

const state = vi.hoisted(() => ({
  row: {
    id: 1,
    display_name: "Boss",
    completion_style: "dramatic",
    time_study_minutes: null,
    wind_down_time: "",
    helper_mode: "scripted",
  },
  updateError: null as { message: string } | null,
  selectError: null as { message: string } | null,
  authed: true,
  calls: [] as Array<{ table: string; update: Record<string, unknown> }>,
  selects: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: () => ({
          limit: () => {
            state.selects.push({ table, columns });
            if (state.selectError) return Promise.resolve({ data: null, error: state.selectError });
            return Promise.resolve({ data: [state.row], error: null });
          },
        }),
      }),
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

const { GET, PATCH } = await import("./route");

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

function givenAnthropicKey(key: string | undefined) {
  if (key === undefined) {
    vi.unstubAllEnvs();
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    vi.stubEnv("ANTHROPIC_API_KEY", key);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  state.row = {
    id: 1,
    display_name: "Boss",
    completion_style: "dramatic",
    time_study_minutes: null,
    wind_down_time: "",
    helper_mode: "scripted",
  };
  state.updateError = null;
  state.selectError = null;
  state.authed = true;
  state.calls = [];
  state.selects = [];
  delete process.env.ANTHROPIC_API_KEY;
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

describe("PATCH /api/settings helper_mode (SPEC 8.15, T8)", () => {
  it("persists the helper mode and returns the updated row", async () => {
    const response = await PATCH(patchRequest({ helper_mode: "ai" }));
    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body.settings as Record<string, unknown>).helper_mode).toBe("ai");
    expect(state.calls).toEqual([{ table: "settings", update: { helper_mode: "ai" } }]);
  });

  it("saves scripted back over an ai default", async () => {
    state.row.helper_mode = "ai";
    const response = await PATCH(patchRequest({ helper_mode: "scripted" }));
    expect(response.status).toBe(200);
    expect(state.row.helper_mode).toBe("scripted");
  });

  it("rejects an unknown helper mode without touching the database", async () => {
    const response = await PATCH(patchRequest({ helper_mode: "chaotic" }));
    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({ error: "Helper mode must be scripted or ai." });
    expect(state.calls).toEqual([]);
  });
});

describe("GET /api/settings (SPEC 8.15 key presence)", () => {
  it("returns the settings row and aiAvailable true when the key exists", async () => {
    givenAnthropicKey("sk-ant-test");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.aiAvailable).toBe(true);
    expect(body.settings).toEqual(
      expect.objectContaining({ display_name: "Boss", helper_mode: "scripted" }),
    );
    expect(state.selects).toEqual([
      {
        table: "settings",
        columns: "display_name, completion_style, time_study_minutes, wind_down_time, helper_mode",
      },
    ]);
  });

  it("returns aiAvailable false when the key is missing", async () => {
    givenAnthropicKey(undefined);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.aiAvailable).toBe(false);
  });

  it("maps an unexpected helper_mode value back to scripted", async () => {
    state.row.helper_mode = "surprise";
    const response = await GET();
    const body = await json(response);
    expect((body.settings as Record<string, unknown>).helper_mode).toBe("scripted");
  });

  it("returns 401 and never touches the database when not authed", async () => {
    state.authed = false;
    const response = await GET();
    expect(response.status).toBe(401);
    expect(state.selects).toEqual([]);
  });

  it("returns 500 with the database error when the select fails", async () => {
    state.selectError = { message: "settings read failed" };
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.error).toBe("settings read failed");
  });
});

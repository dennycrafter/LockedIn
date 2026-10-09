// Regression coverage for POST /api/ai (SPEC 8.15). The Anthropic response is
// stubbed through a global fetch stub and the key comes from a stubbed env
// var; no test touches the network or a real key. The UI wiring lands later
// (T8-UI); these tests pin the JSON contract it will consume.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted so the mock factory below can share this state.
const state = vi.hoisted(() => ({ authed: true }));

vi.mock("@/lib/require-user", () => ({
  isAuthed: async () => state.authed,
}));

// Import AFTER the mocks so the handler picks up the mocked module.
const { POST } = await import("./route");

type FetchCall = { url: string; init: RequestInit };

const fetchCalls: FetchCall[] = [];

function stubFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function userMessage(text: string) {
  return { role: "user", content: text };
}

const RANKED_JSON = JSON.stringify({
  ranked: [
    { title: "Write intro", task_id: "t1", reason: "Highest impact" },
    { title: "Call bank", task_id: null, reason: "No deadline" },
  ],
});

beforeEach(() => {
  state.authed = true;
  fetchCalls.length = 0;
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(stubFetchResponse(200, { content: [{ type: "text", text: "Hello." }] })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/ai auth and validation", () => {
  it("returns 401 and never calls Anthropic when not signed in", async () => {
    state.authed = false;
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")] }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AI_UNAUTHORIZED", message: "Not signed in" },
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns 400 for an unreadable body", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AI_BAD_REQUEST");
  });

  it("returns 400 for a body that is not an object", async () => {
    const response = await POST(post('"just a string"'));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an unknown flow", async () => {
    const response = await POST(post({ flow: "chat", messages: [userMessage("hi")] }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("flow");
  });

  it("returns 400 for empty or malformed messages", async () => {
    const empty = await POST(post({ flow: "stuck", messages: [] }));
    expect(empty.status).toBe(400);

    const badRole = await POST(post({ flow: "stuck", messages: [{ role: "system", content: "hi" }] }));
    expect(badRole.status).toBe(400);

    const emptyContent = await POST(post({ flow: "stuck", messages: [{ role: "user", content: " " }] }));
    expect(emptyContent.status).toBe(400);

    const assistantLast = await POST(
      post({ flow: "stuck", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }),
    );
    expect(assistantLast.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns 400 for a malformed context", async () => {
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")], context: { undoneTasks: "nope" } }));
    expect(response.status).toBe(400);
    expect(fetchCalls).toHaveLength(0);
  });

  it("returns 503 AI_NOT_CONFIGURED when the key is missing, without calling Anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")] }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AI_NOT_CONFIGURED", message: "ANTHROPIC_API_KEY is not set. Add your Anthropic key in Vercel to turn this on." },
    });
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("POST /api/ai success paths", () => {
  it("returns the parsed stuck reply with the start action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(stubFetchResponse(200, { content: [{ type: "text", text: "Good, that is small enough.\nSTART_5_MIN: Write intro" }] })),
    );
    const response = await POST(post({ flow: "stuck", messages: [userMessage("I keep avoiding the intro")] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      flow: "stuck",
      reply: "Good, that is small enough.",
      start5min: true,
      startRef: "Write intro",
    });
  });

  it("returns start5min false when the model has no marker yet", async () => {
    const response = await POST(post({ flow: "stuck", messages: [userMessage("I am stuck")] }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; start5min: boolean; startRef: string | null };
    expect(body.ok).toBe(true);
    expect(body.start5min).toBe(false);
    expect(body.startRef).toBe(null);
  });

  it("returns the ranked list for the organize flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(stubFetchResponse(200, { content: [{ type: "text", text: `Ranking:\n\`\`\`json\n${RANKED_JSON}\n\`\`\`` }] })),
    );
    const response = await POST(post({ flow: "organize", messages: [userMessage("Rank my list")] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      flow: "organize",
      reply: `Ranking:\n\`\`\`json\n${RANKED_JSON}\n\`\`\``,
      ranked: [
        { title: "Write intro", taskId: "t1", reason: "Highest impact" },
        { title: "Call bank", taskId: null, reason: "No deadline" },
      ],
    });
  });

  it("sends the spec headers, model, capped messages and context to Anthropic", async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(stubFetchResponse(200, { content: [{ type: "text", text: `Ranking:\n\`\`\`json\n${RANKED_JSON}\n\`\`\`` }] })),
    );
    const response = await POST(
      post({ flow: "organize", messages, context: { undoneTasks: ["Site > Write intro"], openLoops: ["Reply to the accountant"], todayPlan: "Start 8am" } }),
    );
    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://api.anthropic.com/v1/messages");
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(fetchCalls[0].init.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(600);
    // Context lines reach the system prompt (SPEC 8.15).
    expect(body.system).toContain("- Site > Write intro");
    expect(body.system).toContain("- Reply to the accountant");
    expect(body.system).toContain("Start 8am");
    // 15 sent, capped to at most 12, conversation still opens with the user.
    expect(body.messages.length).toBeLessThanOrEqual(12);
    expect(body.messages[body.messages.length - 1].role).toBe("user");
  });
});

describe("POST /api/ai provider failures (typed errors, never raw throws)", () => {
  it("maps a 429 to AI_RATE_LIMITED with retry seconds in body and header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(stubFetchResponse(429, { error: { message: "Rate limited" } }, { "retry-after": "30" })),
    );
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")] }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AI_RATE_LIMITED", message: "Rate limited", retryAfterSeconds: 30 },
    });
  });

  it("maps a provider 500 to 502 AI_PROVIDER_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn(stubFetchResponse(500, { error: { message: "Overloaded" } })));
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")] }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AI_PROVIDER_ERROR", message: "Overloaded" },
    });
  });

  it("maps a network failure to 502 AI_NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection reset");
      }),
    );
    const response = await POST(post({ flow: "stuck", messages: [userMessage("hi")] }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "AI_NETWORK_ERROR", message: "connection reset" },
    });
  });

  it("maps an unparseable organize reply to 502 AI_RESPONSE_INVALID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(stubFetchResponse(200, { content: [{ type: "text", text: "No JSON here, sorry." }] })),
    );
    const response = await POST(post({ flow: "organize", messages: [userMessage("rank")] }));
    expect(response.status).toBe(502);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("AI_RESPONSE_INVALID");
  });
});

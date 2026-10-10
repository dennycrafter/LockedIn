// Unit tests for the /api/ai browser client: typed results for every failure
// shape the route or the network can produce, plus the display and context
// helpers. fetch is injected at the boundary, never global.

import { describe, expect, it, vi } from "vitest";
import { formatUndoneTaskContext, organizeChatText, sendAiChat } from "./ai-client";

function responseOf(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const STUCK_OK = { ok: true, flow: "stuck", reply: "Name the smallest step.", start5min: false, startRef: null };

describe("sendAiChat", () => {
  it("posts flow, messages and context to /api/ai and returns the stuck reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(200, { ...STUCK_OK, start5min: true, startRef: "Write intro" }));
    const result = await sendAiChat({
      flow: "stuck",
      messages: [{ role: "user", content: "I keep avoiding the doc" }],
      context: { undoneTasks: ["Launch > Write intro (task, id: t1)"] },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/ai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          flow: "stuck",
          messages: [{ role: "user", content: "I keep avoiding the doc" }],
          context: { undoneTasks: ["Launch > Write intro (task, id: t1)"] },
        }),
      }),
    );
    expect(result).toEqual({ ok: true, flow: "stuck", reply: "Name the smallest step.", start5min: true, startRef: "Write intro" });
  });

  it("returns the organize ranked list with task_id normalized to taskId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseOf(200, {
        ok: true,
        flow: "organize",
        reply: "Here is the ranking.",
        ranked: [{ title: "Write intro", task_id: "t1", reason: "Highest impact" }],
      }),
    );
    const result = await sendAiChat({
      flow: "organize",
      messages: [{ role: "user", content: "go" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: true,
      flow: "organize",
      reply: "Here is the ranking.",
      ranked: [{ title: "Write intro", taskId: "t1", reason: "Highest impact" }],
    });
  });

  it("passes the route error code and message through", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseOf(503, { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "Add your Anthropic key in Vercel." } }),
    );
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, code: "AI_NOT_CONFIGURED", message: "Add your Anthropic key in Vercel." });
  });

  it("keeps retryAfterSeconds when the rate limit error carries it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseOf(429, { ok: false, error: { code: "AI_RATE_LIMITED", message: "Slow down.", retryAfterSeconds: 12 } }),
    );
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, code: "AI_RATE_LIMITED", message: "Slow down.", retryAfterSeconds: 12 });
  });

  it("falls back to the default message for a known code without one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(401, { ok: false, error: { code: "AI_UNAUTHORIZED" } }));
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, code: "AI_UNAUTHORIZED", message: "Your session expired. Sign in again and reopen this helper." });
  });

  it("maps an unparseable error body to AI_PROVIDER_ERROR", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>boom</html>", { status: 500 }));
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AI_PROVIDER_ERROR");
  });

  it("maps a network failure to AI_NETWORK_ERROR", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("AI_NETWORK_ERROR");
      expect(result.message).toBe("Could not reach the AI helper. Check your connection and try again.");
    }
  });

  it("treats a 2xx body with an unexpected shape as AI_PROVIDER_ERROR", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(responseOf(200, { hello: "world" }));
    const result = await sendAiChat({ flow: "stuck", messages: [{ role: "user", content: "hi" }], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AI_PROVIDER_ERROR");
  });
});

describe("organizeChatText", () => {
  it("strips fenced blocks so raw JSON never shows in the chat", () => {
    const reply = 'Ranked it.\n```json\n{"ranked":[{"title":"Write intro","task_id":"t1","reason":"big"}]}\n```\nStart at the top.';
    expect(organizeChatText(reply)).toBe("Ranked it.\n\nStart at the top.");
  });

  it("returns plain replies unchanged", () => {
    expect(organizeChatText("Just words.")).toBe("Just words.");
  });
});

describe("formatUndoneTaskContext", () => {
  it("formats label, kind and id for the AI to echo back", () => {
    expect(formatUndoneTaskContext([{ label: "Launch > Write intro", id: "t1", kind: "task" }])).toEqual([
      "Launch > Write intro (task, id: t1)",
    ]);
  });
});

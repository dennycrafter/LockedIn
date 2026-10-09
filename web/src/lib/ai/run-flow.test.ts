// Unit tests for the flow orchestration (SPEC 8.15): cap, prompt build,
// Anthropic call and reply parsing composed, with fetch stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { runAiHelperFlow, type RunFlowInput } from "./run-flow";
import { STUCK_SYSTEM_PROMPT } from "./prompts";
import type { AiMessage } from "./types";

type FetchCall = { url: string; init: RequestInit };

function stubFetch(status: number, text: string) {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });
  });
  return { calls, impl };
}

function input(overrides: Partial<RunFlowInput> = {}): RunFlowInput {
  return {
    flow: "stuck",
    messages: [{ role: "user", content: "I am stuck on the intro" }],
    apiKey: "test-key",
    ...overrides,
  };
}

function alternating(count: number): AiMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `m${i}`,
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAiHelperFlow", () => {
  it("runs the stuck flow end to end and extracts the marker", async () => {
    const { calls, impl } = stubFetch(200, "Good, that is small enough.\nSTART_5_MIN: Write intro");
    const result = await runAiHelperFlow(input({ fetchImpl: impl }));
    expect(result).toEqual({
      ok: true,
      flow: "stuck",
      reply: "Good, that is small enough.",
      start5min: true,
      startRef: "Write intro",
    });
    const body = JSON.parse(String(calls[0].init.body)) as { system: string };
    expect(body.system).toBe(STUCK_SYSTEM_PROMPT);
  });

  it("runs the organize flow and returns the ranked list", async () => {
    const ranked = [
      { title: "Write intro", task_id: "t1", reason: "Highest impact" },
      { title: "Call bank", task_id: null, reason: "No deadline" },
    ];
    const { impl } = stubFetch(200, `Ranking:\n\`\`\`json\n${JSON.stringify({ ranked })}\n\`\`\``);
    const result = await runAiHelperFlow(input({ flow: "organize", fetchImpl: impl }));
    expect(result).toEqual({
      ok: true,
      flow: "organize",
      reply: `Ranking:\n\`\`\`json\n${JSON.stringify({ ranked })}\n\`\`\``,
      ranked: [
        { title: "Write intro", taskId: "t1", reason: "Highest impact" },
        { title: "Call bank", taskId: null, reason: "No deadline" },
      ],
    });
  });

  it("returns AI_RESPONSE_INVALID when the organize reply has no usable JSON", async () => {
    const { impl } = stubFetch(200, "I asked about deadlines instead.");
    const result = await runAiHelperFlow(input({ flow: "organize", fetchImpl: impl }));
    expect(result).toEqual({
      ok: false,
      code: "AI_RESPONSE_INVALID",
      message: "The AI reply did not contain a usable ranked JSON block",
    });
  });

  it("caps the conversation at 12 messages before calling the provider", async () => {
    const { calls, impl } = stubFetch(200, "What is the smallest step?");
    await runAiHelperFlow(input({ messages: alternating(15), fetchImpl: impl }));
    const body = JSON.parse(String(calls[0].init.body)) as { messages: { role: string }[] };
    expect(body.messages.length).toBeLessThanOrEqual(12);
    expect(body.messages[body.messages.length - 1].role).toBe("user");
  });

  it("interpolates context into the system prompt", async () => {
    const { calls, impl } = stubFetch(200, "Okay.");
    await runAiHelperFlow(
      input({ fetchImpl: impl, context: { undoneTasks: ["Site > Write intro"] } }),
    );
    const body = JSON.parse(String(calls[0].init.body)) as { system: string };
    expect(body.system).toContain("- Site > Write intro");
  });

  it("passes provider failures through untouched", async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Rate limited" } }), { status: 429, headers: { "retry-after": "12" } }));
    const result = await runAiHelperFlow(input({ fetchImpl: impl }));
    expect(result).toEqual({ ok: false, code: "AI_RATE_LIMITED", message: "Rate limited", retryAfterSeconds: 12 });
  });

  it("reports AI_NOT_CONFIGURED without any call when the key is missing", async () => {
    const impl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await runAiHelperFlow(input({ apiKey: undefined, fetchImpl: impl }));
    expect(result).toMatchObject({ ok: false, code: "AI_NOT_CONFIGURED" });
    expect(impl).not.toHaveBeenCalled();
  });
});

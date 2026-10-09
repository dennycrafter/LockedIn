// Unit tests for the Anthropic client (SPEC 7.3). Every response is stubbed
// through the injectable fetch; no test touches the network or a real key.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_MAX_TOKENS,
  AI_MODEL,
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  callAnthropic,
  type AnthropicDeps,
} from "./anthropic";

type FetchCall = { url: string; init: RequestInit };

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  });
  return { calls, impl };
}

function deps(overrides: Partial<AnthropicDeps> = {}): AnthropicDeps {
  return {
    apiKey: "test-key",
    system: "You are a focus coach.",
    messages: [{ role: "user", content: "I am stuck" }],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callAnthropic (SPEC 7.3 request shape)", () => {
  it("posts to the Messages URL with the spec headers, model and token cap", async () => {
    const { calls, impl } = makeFetch(200, { content: [{ type: "text", text: "hi" }] });
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: true, text: "hi" });
    expect(calls[0].url).toBe(ANTHROPIC_MESSAGES_URL);
    const init = calls[0].init;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe(AI_MODEL);
    expect(body.max_tokens).toBe(AI_MAX_TOKENS);
    expect(body.system).toBe("You are a focus coach.");
    expect(body.messages).toEqual([{ role: "user", content: "I am stuck" }]);
  });

  it("joins multiple text blocks and ignores non text blocks", async () => {
    const { impl } = makeFetch(200, {
      content: [
        { type: "text", text: "part one " },
        { type: "tool_use", id: "t1" },
        { type: "text", text: "part two" },
      ],
    });
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: true, text: "part one part two" });
  });
});

describe("callAnthropic error mapping (typed failures, never raw throws)", () => {
  it("returns AI_NOT_CONFIGURED without calling fetch when the key is missing", async () => {
    const { impl } = makeFetch(200, {});
    const result = await callAnthropic(deps({ apiKey: undefined, fetchImpl: impl }));
    expect(result).toMatchObject({ ok: false, code: "AI_NOT_CONFIGURED" });
    expect(impl).not.toHaveBeenCalled();
  });

  it("maps HTTP 429 to AI_RATE_LIMITED with the provider message and retry-after", async () => {
    const { impl } = makeFetch(429, { error: { message: "Rate limited" } }, { "retry-after": "30" });
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: false, code: "AI_RATE_LIMITED", message: "Rate limited", retryAfterSeconds: 30 });
  });

  it("omits retryAfterSeconds when the header is absent or non numeric", async () => {
    const noHeader = makeFetch(429, { error: { message: "slow down" } });
    const resultA = await callAnthropic(deps({ fetchImpl: noHeader.impl }));
    expect(resultA).toEqual({ ok: false, code: "AI_RATE_LIMITED", message: "slow down" });

    const badHeader = makeFetch(429, { error: { message: "slow down" } }, { "retry-after": "later" });
    const resultB = await callAnthropic(deps({ fetchImpl: badHeader.impl }));
    expect(resultB).toEqual({ ok: false, code: "AI_RATE_LIMITED", message: "slow down" });
  });

  it("maps other HTTP failures to AI_PROVIDER_ERROR with the provider message", async () => {
    const overloaded = makeFetch(529, { error: { message: "Overloaded" } });
    const resultA = await callAnthropic(deps({ fetchImpl: overloaded.impl }));
    expect(resultA).toEqual({ ok: false, code: "AI_PROVIDER_ERROR", message: "Overloaded" });

    const authError = makeFetch(401, { error: { message: "invalid x-api-key" } });
    const resultB = await callAnthropic(deps({ fetchImpl: authError.impl }));
    expect(resultB).toEqual({ ok: false, code: "AI_PROVIDER_ERROR", message: "invalid x-api-key" });
  });

  it("falls back to the HTTP status when the error body is not readable", async () => {
    const { impl } = makeFetch(500, "gateway exploded");
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: false, code: "AI_PROVIDER_ERROR", message: "Anthropic returned HTTP 500" });
  });

  it("maps a network failure to AI_NETWORK_ERROR", async () => {
    const impl = vi.fn(async () => {
      throw new Error("connection reset");
    });
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: false, code: "AI_NETWORK_ERROR", message: "connection reset" });
  });

  it("uses a generic message for non Error network failures", async () => {
    const impl = vi.fn(async () => {
      throw "nope";
    });
    const result = await callAnthropic(deps({ fetchImpl: impl }));
    expect(result).toEqual({ ok: false, code: "AI_NETWORK_ERROR", message: "Could not reach Anthropic" });
  });

  it("maps an empty or unreadable 200 body to AI_RESPONSE_INVALID", async () => {
    const empty = makeFetch(200, { content: [] });
    const resultA = await callAnthropic(deps({ fetchImpl: empty.impl }));
    expect(resultA).toMatchObject({ ok: false, code: "AI_RESPONSE_INVALID" });

    const unparseable = makeFetch(200, "not json at all");
    const resultB = await callAnthropic(deps({ fetchImpl: unparseable.impl }));
    expect(resultB).toMatchObject({ ok: false, code: "AI_RESPONSE_INVALID" });
  });
});

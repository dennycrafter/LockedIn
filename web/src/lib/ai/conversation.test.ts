// Unit tests for conversation validation and the 12 message cap (SPEC 8.15).

import { describe, expect, it } from "vitest";
import { capMessages, MAX_CONVERSATION_MESSAGES, parseAiContext, parseConversation } from "./conversation";
import type { AiMessage } from "./types";

function msg(role: "user" | "assistant", content: string): AiMessage {
  return { role, content };
}

// m0 user, m1 assistant, ... alternating, ending on the user's turn when the
// length is odd.
function alternating(count: number): AiMessage[] {
  return Array.from({ length: count }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `m${i}`));
}

describe("capMessages (SPEC 8.15: max 12 messages)", () => {
  it("leaves a conversation at or under the cap untouched", () => {
    const messages = alternating(MAX_CONVERSATION_MESSAGES);
    expect(capMessages(messages)).toEqual(messages);
  });

  it("keeps the most recent messages of a longer conversation, opening with a user turn", () => {
    const capped = capMessages(alternating(15));
    // Slice keeps m3..m14 (12 messages); m3 is an assistant message so the
    // cap drops it and the conversation opens with m4, the user's turn.
    expect(capped[0]).toEqual({ role: "user", content: "m4" });
    expect(capped[capped.length - 1]).toEqual({ role: "user", content: "m14" });
    expect(capped).toHaveLength(11);
  });

  it("drops leading assistant messages even when the conversation is under the cap", () => {
    const capped = capMessages([
      msg("assistant", "a"),
      msg("assistant", "b"),
      msg("user", "now help me start"),
    ]);
    expect(capped).toEqual([msg("user", "now help me start")]);
  });

  it("does not mutate the input array", () => {
    const messages = alternating(15);
    capMessages(messages);
    expect(messages).toHaveLength(15);
  });

  it("honours a custom cap", () => {
    const capped = capMessages([msg("assistant", "a"), msg("user", "1"), msg("assistant", "b"), msg("user", "2")], 2);
    // Last 2 are [assistant "b", user "2"]; the leading assistant is then
    // dropped so the call opens with the user's turn.
    expect(capped).toEqual([msg("user", "2")]);
  });
});

describe("parseConversation", () => {
  it("accepts a valid conversation", () => {
    const parsed = parseConversation([msg("user", "hi"), msg("assistant", "hello"), msg("user", "help me start")]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.messages).toHaveLength(3);
  });

  it("rejects non-arrays and empty arrays", () => {
    expect(parseConversation(undefined).ok).toBe(false);
    expect(parseConversation("not an array").ok).toBe(false);
    expect(parseConversation([]).ok).toBe(false);
  });

  it("rejects an invalid role with the index", () => {
    const parsed = parseConversation([{ role: "system", content: "hi" }]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain("messages[0].role");
  });

  it("rejects empty or non-string content with the index", () => {
    expect(parseConversation([msg("user", "  ")]).ok).toBe(false);
    const parsed = parseConversation([{ role: "user", content: 5 }]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain("messages[0].content");
  });

  it("rejects a conversation that ends on an assistant turn", () => {
    const parsed = parseConversation([msg("user", "hi"), msg("assistant", "hello")]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain("last message must be from the user");
  });
});

describe("parseAiContext", () => {
  it("accepts a missing context", () => {
    expect(parseAiContext(undefined)).toEqual({ ok: true, context: {} });
  });

  it("accepts the full context shape", () => {
    const parsed = parseAiContext({
      undoneTasks: ["Site > Write intro"],
      openLoops: ["Reply to the accountant"],
      todayPlan: "Start 8am at the library",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects wrong shapes", () => {
    expect(parseAiContext(null).ok).toBe(false);
    expect(parseAiContext(["array"]).ok).toBe(false);
    expect(parseAiContext({ undoneTasks: "nope" }).ok).toBe(false);
    expect(parseAiContext({ openLoops: [1] }).ok).toBe(false);
    expect(parseAiContext({ todayPlan: 8 }).ok).toBe(false);
  });
});

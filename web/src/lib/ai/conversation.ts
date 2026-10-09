// Conversation shape for /api/ai (SPEC 8.15): request validation plus the
// 12 message cap. Pure functions so the route stays thin and tests stay
// table driven.

import type { AiContext, AiMessage } from "./types";

export const MAX_CONVERSATION_MESSAGES = 12;

// SPEC 8.15: max 12 messages per conversation. Keeps the most recent ones.
// The Anthropic Messages API expects a conversation to open with a user
// message, so after truncation leading assistant messages are dropped (with a
// user/assistant pair per turn this is the common case, not an edge case).
// Precondition: at least one message with role "user" exists (the route
// validates that the last message is from the user before calling this).
export function capMessages(messages: AiMessage[], max: number = MAX_CONVERSATION_MESSAGES): AiMessage[] {
  let capped = messages.length > max ? messages.slice(messages.length - max) : messages;
  while (capped.length > 1 && capped[0].role === "assistant") {
    capped = capped.slice(1);
  }
  return capped;
}

export type ParsedConversation = { ok: true; messages: AiMessage[] } | { ok: false; message: string };

export function parseConversation(input: unknown): ParsedConversation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: "messages must be a non-empty array" };
  }
  const messages: AiMessage[] = [];
  for (let i = 0; i < input.length; i++) {
    const item = input[i] as { role?: unknown; content?: unknown } | null;
    const role = item?.role;
    const content = item?.content;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, message: `messages[${i}].role must be "user" or "assistant"` };
    }
    if (typeof content !== "string" || content.trim() === "") {
      return { ok: false, message: `messages[${i}].content must be a non-empty string` };
    }
    messages.push({ role, content });
  }
  // The model is asked for a reply, so the conversation has to end on the
  // user's turn.
  if (messages[messages.length - 1].role !== "user") {
    return { ok: false, message: "the last message must be from the user" };
  }
  return { ok: true, messages };
}

export type ParsedContext = { ok: true; context: AiContext } | { ok: false; message: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function parseAiContext(input: unknown): ParsedContext {
  if (input === undefined) return { ok: true, context: {} };
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, message: "context must be an object" };
  }
  const raw = input as { undoneTasks?: unknown; openLoops?: unknown; todayPlan?: unknown };
  if (raw.undoneTasks !== undefined && !isStringArray(raw.undoneTasks)) {
    return { ok: false, message: "context.undoneTasks must be an array of strings" };
  }
  if (raw.openLoops !== undefined && !isStringArray(raw.openLoops)) {
    return { ok: false, message: "context.openLoops must be an array of strings" };
  }
  if (raw.todayPlan !== undefined && typeof raw.todayPlan !== "string") {
    return { ok: false, message: "context.todayPlan must be a string" };
  }
  return {
    ok: true,
    context: {
      undoneTasks: Array.isArray(raw.undoneTasks) ? raw.undoneTasks : undefined,
      openLoops: Array.isArray(raw.openLoops) ? raw.openLoops : undefined,
      todayPlan: typeof raw.todayPlan === "string" ? raw.todayPlan : undefined,
    },
  };
}

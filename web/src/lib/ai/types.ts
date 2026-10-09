// Shared types for the AI helper backend (SPEC 8.15). The T8 UI consumes the
// /api/ai JSON; these types are that contract. Everything is server-shape:
// the Anthropic key never appears in any of these payloads.

export type AiFlow = "stuck" | "organize";

export type AiMessage = { role: "user" | "assistant"; content: string };

// Context the dashboard sends with each request (SPEC 8.15: undone tasks with
// projects, today's open loops, today's plan). Strings are already formatted
// by the caller; the backend only interpolates them into the system prompt.
export type AiContext = {
  undoneTasks?: string[];
  openLoops?: string[];
  todayPlan?: string;
};

// One entry of the ranked list the organize flow returns (SPEC 8.15 JSON:
// {"ranked":[{"title":"...","task_id":"...|null","reason":"..."}]}).
export type RankedItem = {
  title: string;
  taskId: string | null;
  reason: string;
};

export type AiErrorCode =
  | "AI_BAD_REQUEST"
  | "AI_UNAUTHORIZED"
  | "AI_NOT_CONFIGURED"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_ERROR"
  | "AI_NETWORK_ERROR"
  | "AI_RESPONSE_INVALID";

// Typed failure surfaced to the UI as {ok:false, error:{code, message}}.
// Never a raw throw: the UI offers "Switch to scripted" on any of these.
export type AiFailure = {
  ok: false;
  code: AiErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

export type AiHelperSuccess =
  | { ok: true; flow: "stuck"; reply: string; start5min: boolean; startRef: string | null }
  | { ok: true; flow: "organize"; reply: string; ranked: RankedItem[] };

// Parse result of one stuck reply: the marker line is removed from the chat
// text and surfaced as the start5min action instead.
export type StuckReply = { reply: string; start5min: boolean; startRef: string | null };

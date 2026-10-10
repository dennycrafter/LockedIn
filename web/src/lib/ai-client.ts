// Browser client for /api/ai (SPEC 8.15, T8-UI): the single fetch the helper
// modals make. Pure and injectable so tests stub fetch at this boundary;
// never imported by server code, so no key can leak into the bundle. Typed
// failures mirror the route contract ({ok:false, error:{code, message}});
// network drops and unparseable bodies become typed errors too, so the UI
// can always render something readable with a retry.

import type { AiContext, AiErrorCode, AiFlow, AiMessage, RankedItem } from "@/lib/ai/types";

export type AiChatFailure = {
  ok: false;
  code: AiErrorCode;
  message: string;
  retryAfterSeconds?: number;
};

export type AiChatSuccess =
  | { ok: true; flow: "stuck"; reply: string; start5min: boolean; startRef: string | null }
  | { ok: true; flow: "organize"; reply: string; ranked: RankedItem[] };

export type AiChatResult = AiChatSuccess | AiChatFailure;

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Readable per-code defaults; the route's own message wins when it has one. */
const DEFAULT_FAILURES: Record<AiErrorCode, string> = {
  AI_BAD_REQUEST: "The AI helper got an invalid request. Try again, or switch to scripted mode.",
  AI_UNAUTHORIZED: "Your session expired. Sign in again and reopen this helper.",
  AI_NOT_CONFIGURED: "AI help is not configured yet. Add your Anthropic key in Vercel to turn this on.",
  AI_RATE_LIMITED: "The AI helper is rate limited. Wait a moment and try again.",
  AI_PROVIDER_ERROR: "The AI helper is having trouble right now. Try again, or switch to scripted mode.",
  AI_NETWORK_ERROR: "Could not reach the AI helper. Check your connection and try again.",
  AI_RESPONSE_INVALID: "The AI helper returned an unusable answer. Try again, or switch to scripted mode.",
};

function isErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === "string" && value in DEFAULT_FAILURES;
}

function normalizeRanked(raw: unknown): RankedItem[] {
  if (!Array.isArray(raw)) return [];
  const items: RankedItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { title?: unknown; task_id?: unknown; taskId?: unknown; reason?: unknown };
    if (typeof record.title !== "string" || record.title.trim() === "") continue;
    const taskId =
      typeof record.taskId === "string" && record.taskId.trim() !== ""
        ? record.taskId
        : typeof record.task_id === "string" && record.task_id.trim() !== ""
          ? record.task_id
          : null;
    items.push({
      title: record.title.trim(),
      taskId,
      reason: typeof record.reason === "string" ? record.reason : "",
    });
  }
  return items;
}

export async function sendAiChat(input: {
  flow: AiFlow;
  messages: AiMessage[];
  context?: AiContext;
  fetchImpl?: typeof fetch;
}): Promise<AiChatResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("/api/ai", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ flow: input.flow, messages: input.messages, context: input.context }),
    });
  } catch {
    return { ok: false, code: "AI_NETWORK_ERROR", message: DEFAULT_FAILURES.AI_NETWORK_ERROR };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Fall through: an unreadable body is handled with the failures below.
  }

  const error =
    typeof body === "object" && body !== null
      ? (body as { error?: { code?: unknown; message?: unknown; retryAfterSeconds?: unknown } }).error
      : undefined;

  if (!response.ok || typeof body !== "object" || body === null) {
    const code = isErrorCode(error?.code) ? error.code : "AI_PROVIDER_ERROR";
    const message =
      typeof error?.message === "string" && error.message.trim() !== "" ? error.message : DEFAULT_FAILURES[code];
    const retryAfterSeconds = typeof error?.retryAfterSeconds === "number" ? error.retryAfterSeconds : undefined;
    return retryAfterSeconds === undefined
      ? { ok: false, code, message }
      : { ok: false, code, message, retryAfterSeconds };
  }

  const data = body as { ok?: unknown; flow?: unknown; reply?: unknown; ranked?: unknown; start5min?: unknown; startRef?: unknown };
  if (data.ok !== true || typeof data.reply !== "string") {
    return { ok: false, code: "AI_PROVIDER_ERROR", message: DEFAULT_FAILURES.AI_PROVIDER_ERROR };
  }
  if (data.flow === "stuck") {
    return {
      ok: true,
      flow: "stuck",
      reply: data.reply,
      start5min: data.start5min === true,
      startRef: typeof data.startRef === "string" ? data.startRef : null,
    };
  }
  if (data.flow === "organize") {
    return { ok: true, flow: "organize", reply: data.reply, ranked: normalizeRanked(data.ranked) };
  }
  return { ok: false, code: "AI_PROVIDER_ERROR", message: DEFAULT_FAILURES.AI_PROVIDER_ERROR };
}

const FENCED_BLOCK_RE = /```[\s\S]*?```/g;

/**
 * The organize reply ships the fenced JSON block for the parser; the chat
 * transcript shows only the prose around it.
 */
export function organizeChatText(reply: string): string {
  return reply.replace(FENCED_BLOCK_RE, "").trim();
}

export type UndoneTaskContextItem = {
  label: string;
  id: string;
  kind: "task" | "subtask" | "misc";
};

/**
 * Context entries the AI can reference back (SPEC 8.15): the picker label plus
 * the id the organize reply must echo in task_id for confirm-then-write.
 */
export function formatUndoneTaskContext(items: UndoneTaskContextItem[]): string[] {
  return items.map((item) => `${item.label} (${item.kind}, id: ${item.id})`);
}

// Anthropic Messages API client (SPEC 7.3), used only by /api/ai on the
// server. The fetch layer is injectable so tests stub responses and no test
// ever touches the network or a real key. Every provider failure maps to a
// typed AiFailure; nothing here throws raw.

import type { AiFailure } from "./types";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const AI_MODEL = "claude-haiku-5-5";
export const AI_MAX_TOKENS = 600;
const FETCH_TIMEOUT_MS = 30_000;

export type AnthropicDeps = {
  apiKey: string | undefined;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  fetchImpl?: typeof fetch;
  model?: string;
};

export type AnthropicSuccess = { ok: true; text: string };
export type AnthropicResult = AnthropicSuccess | AiFailure;

function readErrorDetail(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const err = (payload as { error?: unknown }).error;
    if (typeof err === "object" && err !== null && "message" in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string" && message !== "") return message;
    }
  }
  return `Anthropic returned HTTP ${status}`;
}

function readTextContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("content" in payload)) return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type?: unknown; text?: unknown } =>
        typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text",
    )
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("");
}

export async function callAnthropic(deps: AnthropicDeps): Promise<AnthropicResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (!deps.apiKey) {
    return {
      ok: false,
      code: "AI_NOT_CONFIGURED",
      message: "ANTHROPIC_API_KEY is not set. Add your Anthropic key in Vercel to turn this on.",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": deps.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: deps.model ?? AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system: deps.system,
        messages: deps.messages,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      code: "AI_NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Could not reach Anthropic",
    };
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = readErrorDetail(payload, response.status);
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const retryAfterSeconds = header === null ? undefined : Number(header);
      return {
        ok: false,
        code: "AI_RATE_LIMITED",
        message,
        retryAfterSeconds: retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      };
    }
    return { ok: false, code: "AI_PROVIDER_ERROR", message };
  }

  const text = readTextContent(payload);
  if (text.trim() === "") {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: "Anthropic returned no text content" };
  }
  return { ok: true, text };
}

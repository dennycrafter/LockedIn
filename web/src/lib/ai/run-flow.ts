// Runs one AI helper flow end to end (SPEC 8.15): cap the conversation,
// build the system prompt, call Anthropic, parse the structured reply. Pure
// orchestration with injectable fetch; the route only adds auth and HTTP.

import { callAnthropic } from "./anthropic";
import { capMessages } from "./conversation";
import { parseRankedReply, parseStuckReply } from "./parse";
import { buildSystemPrompt } from "./prompts";
import type { AiContext, AiFailure, AiHelperSuccess, AiFlow, AiMessage } from "./types";

export type RunFlowInput = {
  flow: AiFlow;
  messages: AiMessage[];
  context?: AiContext;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
};

export type RunFlowResult = AiHelperSuccess | AiFailure;

export async function runAiHelperFlow(input: RunFlowInput): Promise<RunFlowResult> {
  const capped = capMessages(input.messages);
  const result = await callAnthropic({
    apiKey: input.apiKey,
    system: buildSystemPrompt(input.flow, input.context),
    messages: capped,
    fetchImpl: input.fetchImpl,
  });
  if (!result.ok) return result;

  if (input.flow === "stuck") {
    const parsed = parseStuckReply(result.text);
    return {
      ok: true,
      flow: "stuck",
      reply: parsed.reply,
      start5min: parsed.start5min,
      startRef: parsed.startRef,
    };
  }

  const ranked = parseRankedReply(result.text);
  if (!ranked.ok) {
    return { ok: false, code: "AI_RESPONSE_INVALID", message: ranked.error };
  }
  return { ok: true, flow: "organize", reply: result.text, ranked: ranked.ranked };
}

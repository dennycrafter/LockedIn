import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { parseAiContext, parseConversation } from "@/lib/ai/conversation";
import { runAiHelperFlow } from "@/lib/ai/run-flow";
import type { AiFailure, AiFlow } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

// POST /api/ai: the AI helper backend (SPEC 8.15). Server only; the Anthropic
// key is read from the environment here and never leaves this process. Every
// failure returns {ok:false, error:{code, message}} so the UI can show it and
// offer "Switch to scripted"; nothing throws raw.

function parseFlow(input: unknown): AiFlow | null {
  return input === "stuck" || input === "organize" ? input : null;
}

function httpStatus(failure: AiFailure): number {
  switch (failure.code) {
    case "AI_BAD_REQUEST":
      return 400;
    case "AI_UNAUTHORIZED":
      return 401;
    case "AI_NOT_CONFIGURED":
      return 503;
    case "AI_RATE_LIMITED":
      return 429;
    default:
      return 502;
  }
}

function failureResponse(failure: AiFailure): NextResponse {
  const error =
    failure.retryAfterSeconds === undefined
      ? { code: failure.code, message: failure.message }
      : { code: failure.code, message: failure.message, retryAfterSeconds: failure.retryAfterSeconds };
  const headers = failure.retryAfterSeconds === undefined ? undefined : { "Retry-After": String(Math.ceil(failure.retryAfterSeconds)) };
  return NextResponse.json({ ok: false, error }, { status: httpStatus(failure), headers });
}

export async function POST(request: Request) {
  // Defense in depth: middleware already 401s unauthenticated calls, the
  // route re-checks like every other mutating API route.
  if (!(await isAuthed())) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_UNAUTHORIZED", message: "Not signed in" } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "AI_BAD_REQUEST", message: "Body must be valid JSON" } },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_BAD_REQUEST", message: "Body must be a JSON object" } },
      { status: 400 },
    );
  }

  const { flow: rawFlow, messages: rawMessages, context: rawContext } = body as {
    flow?: unknown;
    messages?: unknown;
    context?: unknown;
  };
  const flow = parseFlow(rawFlow);
  if (!flow) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_BAD_REQUEST", message: 'flow must be "stuck" or "organize"' } },
      { status: 400 },
    );
  }
  const conversation = parseConversation(rawMessages);
  if (!conversation.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_BAD_REQUEST", message: conversation.message } },
      { status: 400 },
    );
  }
  const context = parseAiContext(rawContext);
  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "AI_BAD_REQUEST", message: context.message } },
      { status: 400 },
    );
  }

  const result = await runAiHelperFlow({
    flow,
    messages: conversation.messages,
    context: context.context,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result);
}

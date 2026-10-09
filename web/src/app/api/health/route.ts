import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// T0 step 5: prove every service or report a readable error, never crash.
// Resend is a key format check only, so no email quota is spent here.
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
const FETCH_TIMEOUT_MS = 5000;

async function checkSupabase(): Promise<string> {
  try {
    const client = createServiceClient();
    const { error } = await client.from("settings").select("id").limit(1);
    if (error) return error.message;
    return "OK";
  } catch (err) {
    return err instanceof Error ? err.message : "unknown error";
  }
}

function checkResend(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "RESEND_API_KEY not set";
  return key.startsWith("re_") ? "KEY_FORMAT_OK" : "key does not start with re_";
}

async function checkAnthropic(): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return "NOT_SET";
  try {
    const res = await fetch(ANTHROPIC_MODELS_URL, {
      headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? "OK" : `HTTP ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : "unknown error";
  }
}

export async function GET() {
  const [supabase, anthropic] = await Promise.all([checkSupabase(), checkAnthropic()]);
  return NextResponse.json({ supabase, resend: checkResend(), anthropic });
}

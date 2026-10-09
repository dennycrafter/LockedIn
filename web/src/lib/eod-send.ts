// Sends the built EOD email through Resend (SPEC 7.2) and records
// eod_sent_at on today's day_reviews row. Server only; the fetch layer is
// injectable so tests can stub the Resend client (no key in the sandbox).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EodEdits } from "./eod-report";

export const RESEND_EMAIL_URL = "https://api.resend.com/emails";
const RESEND_FROM_FALLBACK = "LockedIn <onboarding@resend.dev>";

export type EodSendEnv = {
  resendApiKey: string | undefined;
  reportToEmail: string | undefined;
  reportFromEmail: string | undefined;
};

export type EodEmailPayload = { subject: string; html: string; text: string };

export type EodSendDeps = {
  client: SupabaseClient;
  env: EodSendEnv;
  email: EodEmailPayload;
  todayIso: string;
  fetchImpl?: typeof fetch;
};

export type EodSendResult = { ok: true } | { ok: false; error: string };

export function parseEodEdits(body: unknown): { ok: true; edits: EodEdits } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const candidate = body as { doneToday?: unknown; learned?: unknown };
  if (candidate.doneToday !== undefined && typeof candidate.doneToday !== "string") {
    return { ok: false, error: "doneToday must be a string" };
  }
  if (candidate.learned !== undefined && typeof candidate.learned !== "string") {
    return { ok: false, error: "learned must be a string" };
  }
  return {
    ok: true,
    edits: {
      doneToday: typeof candidate.doneToday === "string" ? candidate.doneToday : "",
      learned: typeof candidate.learned === "string" ? candidate.learned : "",
    },
  };
}

export async function sendEodReport(deps: EodSendDeps): Promise<EodSendResult> {
  const { client, env, email, todayIso } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (!env.resendApiKey) return { ok: false, error: "RESEND_API_KEY is not set" };
  if (!env.reportToEmail) return { ok: false, error: "REPORT_TO_EMAIL is not set" };

  try {
    const response = await fetchImpl(RESEND_EMAIL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.reportFromEmail && env.reportFromEmail !== "" ? env.reportFromEmail : RESEND_FROM_FALLBACK,
        to: [env.reportToEmail],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
    if (!response.ok) {
      const message =
        payload && typeof payload.message === "string" && payload.message !== ""
          ? payload.message
          : `Resend returned HTTP ${response.status}`;
      return { ok: false, error: message };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Resend" };
  }

  // SPEC 8.13: on success set eod_sent_at for today.
  const { error } = await client
    .from("day_reviews")
    .upsert({ review_date: todayIso, eod_sent_at: new Date().toISOString() }, { onConflict: "review_date" });
  if (error) {
    return { ok: false, error: `Report sent, but saving eod_sent_at failed: ${error.message}` };
  }
  return { ok: true };
}

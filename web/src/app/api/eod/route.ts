import { NextResponse } from "next/server";
import { buildEodEmail, getEodContext } from "@/lib/eod-report";
import { fetchEodDayData } from "@/lib/eod-data";
import { parseEodEdits, sendEodReport, type EodSendEnv } from "@/lib/eod-send";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected server error";
}

// GET /api/eod: the preview data for the modal (SPEC 8.13). Returns the raw
// day data plus the Chicago day context; the modal renders the sections and
// prefills the two editable fields from data.review.
export async function GET() {
  try {
    const client = createServiceClient();
    const context = getEodContext(new Date());
    const data = await fetchEodDayData(client, context);
    return NextResponse.json({ ok: true, context, data });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 500 });
  }
}

// POST /api/eod: rebuild the report from current data with the owner's edited
// fields and send it through Resend (SPEC 7.2). Server only.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be valid JSON" }, { status: 400 });
  }
  const parsed = parseEodEdits(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const context = getEodContext(new Date());
    const data = await fetchEodDayData(client, context);
    const email = buildEodEmail(data, context, parsed.edits);
    const env: EodSendEnv = {
      resendApiKey: process.env.RESEND_API_KEY,
      reportToEmail: process.env.REPORT_TO_EMAIL,
      reportFromEmail: process.env.REPORT_FROM_EMAIL,
    };
    const result = await sendEodReport({ client, env, email, todayIso: context.todayIso });
    if (!result.ok) {
      // SPEC 8.13: show the error text; the preview stays open client side.
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 500 });
  }
}

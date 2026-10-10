import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";
import { isTimeStudyChoice } from "@/lib/time-study";
import { mapSettingsRow, SETTINGS_COLUMNS, type HelperMode } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const STYLES = ["dramatic", "hype", "calm"] as const;
const HELPER_MODES = ["scripted", "ai"] as const;

// Settings row (single row, id=1): display name for the greeting and the
// celebration message, completion message style (SPEC 8.10), the time
// study check-in interval (SPEC 8.11), the wind down evening reminder
// target (T6a-1), and the helper flow open mode (SPEC 8.15, T8).

// GET /api/settings: the settings row plus a computed aiAvailable flag, so
// the settings toggle knows whether the Anthropic key is configured. The
// key itself never leaves the server (SPEC 8.15, SPEC 12).
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createServiceClient();
  const { data, error } = await client.from("settings").select(SETTINGS_COLUMNS).eq("id", 1).limit(1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    settings: mapSettingsRow(data?.[0] as Parameters<typeof mapSettingsRow>[0]),
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const raw = body as {
    display_name?: unknown;
    completion_style?: unknown;
    time_study_minutes?: unknown;
    wind_down_time?: unknown;
    helper_mode?: unknown;
  };

  const update: {
    display_name?: string;
    completion_style?: (typeof STYLES)[number];
    time_study_minutes?: number | null;
    wind_down_time?: string;
    helper_mode?: HelperMode;
  } = {};
  if (raw.display_name !== undefined) {
    if (typeof raw.display_name !== "string" || raw.display_name.trim() === "") {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }
    update.display_name = raw.display_name.trim().slice(0, 60);
  }
  if (raw.completion_style !== undefined) {
    if (typeof raw.completion_style !== "string" || !STYLES.includes(raw.completion_style as (typeof STYLES)[number])) {
      return NextResponse.json({ error: "Completion style must be dramatic, hype or calm." }, { status: 400 });
    }
    update.completion_style = raw.completion_style as (typeof STYLES)[number];
  }
  if (raw.time_study_minutes !== undefined) {
    // null = off; otherwise one of the SPEC 8.11 intervals.
    if (raw.time_study_minutes === null) {
      update.time_study_minutes = null;
    } else if (isTimeStudyChoice(raw.time_study_minutes)) {
      update.time_study_minutes = raw.time_study_minutes;
    } else {
      return NextResponse.json({ error: "Time study must be off or 5, 15, 30, 45 or 60 minutes." }, { status: 400 });
    }
  }
  if (raw.wind_down_time !== undefined) {
    // Free text evening target like "21:30"; empty clears it.
    if (typeof raw.wind_down_time !== "string") {
      return NextResponse.json({ error: "Wind down time must be text." }, { status: 400 });
    }
    update.wind_down_time = raw.wind_down_time.trim().slice(0, 60);
  }
  if (raw.helper_mode !== undefined) {
    // SPEC 8.15: which mode the helper flows open in. The client only offers
    // AI when the key is configured (aiAvailable), and the server-side
    // /api/ai enforces that again, so a stale client cannot spend credits.
    if (typeof raw.helper_mode !== "string" || !HELPER_MODES.includes(raw.helper_mode as HelperMode)) {
      return NextResponse.json({ error: "Helper mode must be scripted or ai." }, { status: 400 });
    }
    update.helper_mode = raw.helper_mode as HelperMode;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("settings")
    .update(update)
    .eq("id", 1)
    .select(SETTINGS_COLUMNS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Settings row missing. Run supabase/schema.sql." }, { status: 500 });
  }
  return NextResponse.json({ settings: data[0] });
}

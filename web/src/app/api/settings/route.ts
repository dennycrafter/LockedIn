import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STYLES = ["dramatic", "hype", "calm"] as const;

// Settings row (single row, id=1): display name for the greeting and the
// celebration message, and the completion message style (SPEC 8.10). Other
// settings fields land with their own tickets (default minutes T3, helper
// mode T8, time study T5).
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
  const raw = body as { display_name?: unknown; completion_style?: unknown };

  const update: { display_name?: string; completion_style?: (typeof STYLES)[number] } = {};
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
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("settings")
    .update(update)
    .eq("id", 1)
    .select("display_name, completion_style");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Settings row missing. Run supabase/schema.sql." }, { status: 500 });
  }
  return NextResponse.json({ settings: data[0] });
}

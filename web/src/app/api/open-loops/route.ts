import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const KINDS = ["loop", "decision"] as const;

// Open loops and decisions (SPEC 8.8): one-line items captured in the quick
// capture panel. The database check constraint enforces the kind; this route
// rejects bad input before it reaches Supabase.
export async function POST(request: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const raw = body as { kind?: unknown; text?: unknown };
  if (typeof raw.kind !== "string" || !KINDS.includes(raw.kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "kind must be 'loop' or 'decision'." }, { status: 400 });
  }
  if (typeof raw.text !== "string" || raw.text.trim() === "") {
    return NextResponse.json({ error: "Write the loop or decision first." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("open_loops")
    .insert({ kind: raw.kind, text: raw.text.trim().slice(0, 500) })
    .select("id, kind, text, created_at");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ loop: data?.[0] ?? null }, { status: 201 });
}

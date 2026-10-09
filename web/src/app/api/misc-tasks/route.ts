import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Misc tasks (SPEC 8.9): one-line items under "Tomorrow's task list". They
// have no notes, no links, and never appear in wind down. New tasks go to the
// end of the list (position = max + 1; the reorder route reindexes from 0).
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
  const raw = body as { title?: unknown };
  if (typeof raw.title !== "string" || raw.title.trim() === "") {
    return NextResponse.json({ error: "Write the misc task first." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data: last, error: lastError } = await client
    .from("misc_tasks")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 });
  }
  const position = last && last.length > 0 ? (last[0]!.position ?? 0) + 1 : 0;

  const { data, error } = await client
    .from("misc_tasks")
    .insert({ title: raw.title.trim().slice(0, 300), position })
    .select("id, title, done, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ task: data?.[0] ?? null }, { status: 201 });
}

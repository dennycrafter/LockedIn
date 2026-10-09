import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Tick or rename one misc task (SPEC 8.9). Reorder is not here: the bulk
// /api/reorder route persists positions.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const raw = body as { done?: unknown; title?: unknown };

  const update: { done?: boolean; title?: string } = {};
  if (raw.done !== undefined) {
    if (typeof raw.done !== "boolean") {
      return NextResponse.json({ error: "done must be a boolean." }, { status: 400 });
    }
    update.done = raw.done;
  }
  if (raw.title !== undefined) {
    if (typeof raw.title !== "string" || raw.title.trim() === "") {
      return NextResponse.json({ error: "Misc task title is required." }, { status: 400 });
    }
    update.title = raw.title.trim().slice(0, 300);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("misc_tasks")
    .update(update)
    .eq("id", id)
    .select("id, title, done, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Misc task not found." }, { status: 404 });
  }
  return NextResponse.json({ task: data[0] });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const client = createServiceClient();
  const { error } = await client.from("misc_tasks").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

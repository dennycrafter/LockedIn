import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Deleting a project cascades to its tasks (schema on delete cascade); the UI
// asks for confirmation first.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const client = createServiceClient();
  const { error } = await client.from("projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}


// Rename a project or save its project notes/context (SPEC 8.2, 8.7).
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
  const raw = body as { name?: unknown; notes?: unknown };

  const update: { name?: string; notes?: string } = {};
  if (raw.name !== undefined) {
    if (typeof raw.name !== "string" || raw.name.trim() === "") {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }
    update.name = raw.name.trim().slice(0, 120);
  }
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string." }, { status: 400 });
    }
    update.notes = raw.notes.slice(0, 20000);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("projects")
    .update(update)
    .eq("id", id)
    .select("id, name, notes, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  return NextResponse.json({ project: data[0] });
}

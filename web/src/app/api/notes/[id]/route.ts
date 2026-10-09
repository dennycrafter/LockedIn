import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Single note for the pop out window (SPEC 8.7): it opens with ?id= and
// refetches on focus, so one note is all it needs.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Note id must be a uuid." }, { status: 400 });
  }
  const client = createServiceClient();
  const { data, error } = await client
    .from("notes")
    .select("id, body, created_at, updated_at")
    .eq("id", id)
    .limit(1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  return NextResponse.json({ note: data[0] });
}

// Autosave writes here (SPEC 8.7): PATCH stores the body and bumps
// updated_at; DELETE removes the note after the panel's confirmation.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Note id must be a uuid." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const raw = (body as { body?: unknown }).body;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "Note body must be text." }, { status: 400 });
  }
  if (raw.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("notes")
    .update({ body: raw, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, body, created_at, updated_at")
    .single();
  if (error) {
    const notFound = error.code === "PGRST116"; // no rows matched the id
    return NextResponse.json(
      { error: notFound ? "Note not found." : error.message },
      { status: notFound ? 404 : 500 },
    );
  }
  return NextResponse.json({ note: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Note id must be a uuid." }, { status: 400 });
  }
  const client = createServiceClient();
  const { error } = await client.from("notes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

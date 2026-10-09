import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 100_000;

// Simple Notes (SPEC 8.7): the whole notes table for the one user, newest
// first by creation so editing a note never moves it in the list.
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const client = createServiceClient();
  const { data, error } = await client
    .from("notes")
    .select("id, body, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notes: data ?? [] });
}

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
  const raw = typeof (body as { body?: unknown }).body === "string" ? (body as { body: string }).body : "";
  if (raw.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("notes")
    .insert({ body: raw })
    .select("id, body, created_at, updated_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ note: data }, { status: 201 });
}

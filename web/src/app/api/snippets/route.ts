import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTENT_LENGTH = 10_000;
const MAX_CONTEXT_LENGTH = 2_000;

// Attach from a note (SPEC 8.7): selected text becomes a dated note_snippets
// row on a project, task or subtask. The source is always "note" here; page
// captures arrive through the extension queue and /api/sync instead.
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
  const raw = body as Record<string, unknown>;
  const ownerType = raw.ownerType;
  if (ownerType !== "project" && ownerType !== "task") {
    return NextResponse.json({ error: "Snippets attach to a project or a task." }, { status: 400 });
  }
  const ownerId = raw.ownerId;
  if (typeof ownerId !== "string" || !UUID_PATTERN.test(ownerId)) {
    return NextResponse.json({ error: "Pick where the snippet goes." }, { status: 400 });
  }
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (content.length === 0) {
    return NextResponse.json({ error: "Select some text to attach." }, { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Selection is too long to attach." }, { status: 400 });
  }
  const context = typeof raw.context === "string" ? raw.context.trim().slice(0, MAX_CONTEXT_LENGTH) : "";

  const client = createServiceClient();
  const ownerTable = ownerType === "project" ? "projects" : "tasks";
  const { data: owner, error: ownerError } = await client.from(ownerTable).select("id").eq("id", ownerId).limit(1);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.message }, { status: 500 });
  }
  if (!owner || owner.length === 0) {
    return NextResponse.json({ error: "That project or task no longer exists." }, { status: 400 });
  }

  const { data, error } = await client
    .from("note_snippets")
    .insert({ owner_type: ownerType, owner_id: ownerId, content, context, source: "note" })
    .select("id, owner_type, owner_id, content, context, source, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snippet: data }, { status: 201 });
}

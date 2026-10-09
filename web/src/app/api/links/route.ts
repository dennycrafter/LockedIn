import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { normalizeUrl } from "@/lib/links";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Add a link to a project or task incl. subtasks (SPEC 8.3). The server
// normalizes the URL so what is stored always opens: bare domains get
// https:// prepended.
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
  const raw = body as { ownerType?: unknown; ownerId?: unknown; name?: unknown; url?: unknown };
  if (raw.ownerType !== "project" && raw.ownerType !== "task") {
    return NextResponse.json({ error: "ownerType must be 'project' or 'task'." }, { status: 400 });
  }
  if (typeof raw.ownerId !== "string" || !UUID_RE.test(raw.ownerId)) {
    return NextResponse.json({ error: "ownerId must be a uuid." }, { status: 400 });
  }
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : "";
  if (!name) {
    return NextResponse.json({ error: "Link name is required." }, { status: 400 });
  }
  const url = typeof raw.url === "string" ? normalizeUrl(raw.url) : null;
  if (!url) {
    return NextResponse.json({ error: "Enter a valid URL, like example.com." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data, error } = await client
    .from("links")
    .insert({ owner_type: raw.ownerType, owner_id: raw.ownerId, name, url })
    .select("id, owner_type, owner_id, name, url");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: data[0] }, { status: 201 });
}

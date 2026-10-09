import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
  const raw = body as { projectId?: unknown; title?: unknown };
  if (typeof raw.projectId !== "string" || raw.projectId.length === 0) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
  if (!title) {
    return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  }

  const client = createServiceClient();
  const { data: last } = await client
    .from("tasks")
    .select("position")
    .eq("project_id", raw.projectId)
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await client
    .from("tasks")
    .insert({ project_id: raw.projectId, title, position })
    .select("id, project_id, title, done, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ task: data[0] }, { status: 201 });
}

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
  const raw = body as { projectId?: unknown; parentId?: unknown; title?: unknown };
  if (typeof raw.projectId !== "string" || raw.projectId.length === 0) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
  if (!title) {
    return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  }

  const client = createServiceClient();

  // A subtask carries parentId: the parent must be an existing task of the
  // same project with no parent of its own (one level only, SPEC 8.2).
  let parentId: string | null = null;
  if (raw.parentId !== undefined && raw.parentId !== null) {
    if (typeof raw.parentId !== "string" || raw.parentId.length === 0) {
      return NextResponse.json({ error: "parentId must be a task id." }, { status: 400 });
    }
    const { data: parent } = await client
      .from("tasks")
      .select("id, project_id, parent_task_id")
      .eq("id", raw.parentId)
      .limit(1);
    if (!parent || parent.length === 0) {
      return NextResponse.json({ error: "Parent task not found." }, { status: 404 });
    }
    if (parent[0].project_id !== raw.projectId) {
      return NextResponse.json({ error: "Parent task is in a different project." }, { status: 400 });
    }
    if (parent[0].parent_task_id !== null) {
      return NextResponse.json({ error: "Subtasks cannot have subtasks." }, { status: 400 });
    }
    parentId = raw.parentId;
  }

  const positionFilter = parentId === null ? "project_id" : "parent_task_id";
  const { data: last } = await client
    .from("tasks")
    .select("position")
    .eq(positionFilter, parentId === null ? raw.projectId : parentId)
    .order("position", { ascending: false })
    .limit(1);
  const position = last && last.length > 0 ? last[0].position + 1 : 0;

  const { data, error } = await client
    .from("tasks")
    .insert({ project_id: raw.projectId, parent_task_id: parentId, title, position })
    .select("id, project_id, parent_task_id, title, done, notes, position");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ task: data[0] }, { status: 201 });
}

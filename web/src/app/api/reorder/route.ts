import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Bulk drag-reorder persistence (SPEC 8.2): position = index for every id of
// one scope (projects, or the tasks/subtasks of one parent list). The client
// sends the full post-drag order so a reload renders exactly what was dragged.
// Two payload shapes arrive here: the project tree posts { kind, ids } with
// kind 'projects' | 'tasks' | 'subtasks' (lockedin-app onReorder), while the
// misc list posts { kind: 'misc_tasks', orderedIds }. Subtasks live in the
// tasks table (parent_task_id set), so 'tasks' and 'subtasks' both persist
// positions there.
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
  const raw = body as { kind?: unknown; ids?: unknown; orderedIds?: unknown };
  if (raw.kind !== "projects" && raw.kind !== "tasks" && raw.kind !== "subtasks" && raw.kind !== "misc_tasks") {
    return NextResponse.json({ error: "kind must be 'projects', 'tasks', 'subtasks' or 'misc_tasks'." }, { status: 400 });
  }
  const list = raw.ids ?? raw.orderedIds;
  if (!Array.isArray(list) || list.length === 0 || list.length > 500) {
    return NextResponse.json({ error: "ids must be a non-empty list (max 500)." }, { status: 400 });
  }
  const orderedIds = list as unknown[];
  if (!orderedIds.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return NextResponse.json({ error: "ids must be uuids." }, { status: 400 });
  }

  const table = raw.kind === "projects" ? "projects" : raw.kind === "misc_tasks" ? "misc_tasks" : "tasks";
  const client = createServiceClient();
  // Sequential: keeps failure reporting simple, and reorder bursts are small.
  for (let position = 0; position < orderedIds.length; position++) {
    const { error } = await client
      .from(table)
      .update({ position })
      .eq("id", orderedIds[position] as string);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

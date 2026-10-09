import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";
import { todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

// "Make #1 my most important task" (SPEC 8.14 step 4): puts one task or
// subtask first in TODAY'S plan (plan_date = today in America/Chicago),
// creating the day_plans row when missing. Own route (not a shared day-plans
// collection) so the wind-down ticket can evolve its endpoints without
// colliding; this file only claims position 0 for one task.
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
  const raw = body as { taskId?: unknown };
  if (typeof raw.taskId !== "string" || raw.taskId.trim() === "") {
    return NextResponse.json({ error: "Pick a task to make most important." }, { status: 400 });
  }
  const taskId = raw.taskId;

  const client = createServiceClient();

  // day_plan_tasks references tasks(id), so a stale or misc id must be
  // rejected here rather than failing the foreign key mid-write.
  const taskRes = await client.from("tasks").select("id").eq("id", taskId).limit(1);
  if (taskRes.error) {
    return NextResponse.json({ error: taskRes.error.message }, { status: 500 });
  }
  if (!taskRes.data || taskRes.data.length === 0) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const planDate = todayKey();

  // Unique(plan_date) makes the find-or-create a single idempotent upsert;
  // a second run of the same request updates nothing.
  const planUpsert = await client
    .from("day_plans")
    .upsert({ plan_date: planDate }, { onConflict: "plan_date" });
  if (planUpsert.error) {
    return NextResponse.json({ error: planUpsert.error.message }, { status: 500 });
  }
  const planRes = await client.from("day_plans").select("id").eq("plan_date", planDate).limit(1);
  if (planRes.error) {
    return NextResponse.json({ error: planRes.error.message }, { status: 500 });
  }
  const plan = (planRes.data as Array<{ id: string }> | null)?.[0];
  if (!plan) {
    return NextResponse.json({ error: "Plan row missing after upsert." }, { status: 500 });
  }

  // Existing planned tasks keep their relative order but each move down one
  // slot; the chosen task then claims position 0 whether it is new to the
  // plan or already in it.
  const existingRes = await client
    .from("day_plan_tasks")
    .select("task_id, position")
    .eq("plan_id", plan.id)
    .order("position");
  if (existingRes.error) {
    return NextResponse.json({ error: existingRes.error.message }, { status: 500 });
  }
  const existing = (existingRes.data ?? []) as Array<{ task_id: string; position: number }>;
  const others = existing.filter((row) => row.task_id !== taskId);
  for (const [index, row] of others.entries()) {
    const shifted = await client
      .from("day_plan_tasks")
      .update({ position: index + 1 })
      .eq("plan_id", plan.id)
      .eq("task_id", row.task_id);
    if (shifted.error) {
      return NextResponse.json({ error: shifted.error.message }, { status: 500 });
    }
  }
  const claimed = await client
    .from("day_plan_tasks")
    .upsert({ plan_id: plan.id, task_id: taskId, position: 0 }, { onConflict: "plan_id,task_id" });
  if (claimed.error) {
    return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, planDate });
}

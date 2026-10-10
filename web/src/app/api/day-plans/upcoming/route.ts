import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";
import { upcomingPlanKey, type TomorrowPlan, type TomorrowPlanRow } from "@/lib/tomorrow-plan";

export const dynamic = "force-dynamic";

// Tomorrow's task list panel data (SPEC 8.12): the nearest saved plan whose
// plan_date is today or later in America/Chicago, with its ordered rows and
// the project and parent context each row needs. The panel polls this route so
// a plan the wind-down modal just saved appears without a reload.

interface PlannedTaskEmbed {
  title: string;
  done: boolean;
  project_id: string;
  parent_task_id: string | null;
}

interface PlanTaskRow {
  position: number;
  task_id: string;
  // PostgREST embed of tasks(title, done, project_id, parent_task_id); parses
  // as object or single-element array.
  tasks: PlannedTaskEmbed | PlannedTaskEmbed[] | null;
}

function embedTask(row: PlanTaskRow): PlannedTaskEmbed | null {
  const embed = row.tasks;
  if (!embed) return null;
  const task = Array.isArray(embed) ? embed[0] : embed;
  if (!task || typeof task.title !== "string" || typeof task.project_id !== "string") return null;
  return task;
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const client = createServiceClient();
    const todayKey = upcomingPlanKey(new Date());

    // Unique(plan_date) keeps one plan per day, so ascending order plus limit 1
    // picks the day being lived (or about to be lived), never later plans.
    const plansRes = await client
      .from("day_plans")
      .select("id, plan_date, start_time, location, prepped")
      .gte("plan_date", todayKey)
      .order("plan_date")
      .limit(1);
    if (plansRes.error) throw new Error(`day_plans query failed: ${plansRes.error.message}`);
    const plan = (plansRes.data ?? [])[0] as
      | { id: string; plan_date: string; start_time: string; location: string; prepped: boolean }
      | undefined;
    if (!plan) {
      return NextResponse.json({ ok: true, plan: null });
    }

    const [planTasksRes, projectsRes, tasksRes] = await Promise.all([
      client
        .from("day_plan_tasks")
        .select("position, task_id, tasks(title, done, project_id, parent_task_id)")
        .eq("plan_id", plan.id)
        .order("position"),
      client.from("projects").select("id, name").order("position"),
      client.from("tasks").select("id, title, project_id, parent_task_id").order("position"),
    ]);
    if (planTasksRes.error) throw new Error(`day_plan_tasks query failed: ${planTasksRes.error.message}`);
    if (projectsRes.error) throw new Error(`projects query failed: ${projectsRes.error.message}`);
    if (tasksRes.error) throw new Error(`tasks query failed: ${tasksRes.error.message}`);

    const projectName = new Map(
      ((projectsRes.data ?? []) as Array<{ id: string; name: string }>).map((project) => [project.id, project.name]),
    );
    const taskById = new Map(
      ((tasksRes.data ?? []) as Array<{ id: string; title: string; project_id: string; parent_task_id: string | null }>).map(
        (task) => [task.id, task],
      ),
    );

    // Rows keep the plan order and their done flag; the panel hides completed
    // and blank rows (lib/tomorrow-plan), the route stays truthful about data.
    const rows: TomorrowPlanRow[] = [];
    for (const row of (planTasksRes.data ?? []) as PlanTaskRow[]) {
      const task = embedTask(row);
      if (!task) continue;
      const parent = task.parent_task_id ? taskById.get(task.parent_task_id) : undefined;
      const contextLabel = [projectName.get(task.project_id) ?? "", parent?.title]
        .filter((part) => typeof part === "string" && part !== "")
        .join(" > ");
      rows.push({
        taskId: row.task_id,
        title: task.title,
        done: task.done === true,
        contextLabel,
        position: row.position,
      });
    }

    const payload: TomorrowPlan = {
      planDateKey: plan.plan_date,
      startTime: plan.start_time,
      location: plan.location,
      prepped: plan.prepped === true,
      rows,
    };
    return NextResponse.json({ ok: true, plan: payload });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not load the plan" },
      { status: 500 },
    );
  }
}

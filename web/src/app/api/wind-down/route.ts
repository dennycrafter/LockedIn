import { NextResponse, type NextRequest } from "next/server";
import { isAuthed } from "@/lib/require-user";
import { createServiceClient } from "@/lib/supabase";
import {
  windDownAnchorKey,
  windDownDayWindow,
  windDownPlanKey,
} from "@/lib/wind-down-time";
import type {
  WindDownGetPayload,
  WindDownPickerProject,
  WindDownTaskTime,
} from "@/lib/wind-down-state";
import { parseSaveBody } from "@/lib/wind-down-save";

export const dynamic = "force-dynamic";

// Wind down evening flow API (SPEC 8.12). GET returns everything the modal
// needs for the wind-down day: the anchor and plan date keys computed in
// America/Chicago, the saved review and plan, per-task focus minutes for the
// day, the project tree for the step 7 picker, task links for the prep step,
// and the wind_down_time setting. POST saves the review (day_reviews), recap
// snippets (note_snippets, source wind_down) and tomorrow's plan (day_plans
// plus day_plan_tasks), creating new projects and tasks from step 7 entries.

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

interface TaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  done: boolean;
}

interface PlanTaskRow {
  position: number;
  task_id: string;
  // PostgREST embed of tasks(title); parses as object or single-element array.
  tasks: { title: string } | { title: string }[] | null;
}

function embedTitle(row: PlanTaskRow): string {
  const embed = row.tasks;
  if (!embed) return "";
  const title = Array.isArray(embed) ? embed[0]?.title : embed.title;
  return typeof title === "string" ? title : "";
}

/** "Project > Task" or "Project > Task > Subtask" labels for step 4 rows. */
function buildLabelMap(projects: Array<{ id: string; name: string }>, tasks: TaskRow[]): Map<string, string> {
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const taskRow = new Map(tasks.map((task) => [task.id, task]));
  const labels = new Map<string, string>();
  for (const task of tasks) {
    const parent = task.parent_task_id ? taskRow.get(task.parent_task_id) : undefined;
    const project = projectName.get(task.project_id) ?? "";
    const label = parent ? `${project} > ${parent.title} > ${task.title}` : `${project} > ${task.title}`;
    labels.set(task.id, label);
  }
  return labels;
}

function summarizeTaskTimes(
  sessions: Array<{ task_id: string | null; active_seconds: number }>,
  labels: Map<string, string>,
): WindDownTaskTime[] {
  const secondsByTask = new Map<string, number>();
  for (const session of sessions) {
    if (typeof session.task_id !== "string" || session.task_id === "") continue;
    const seconds = Number(session.active_seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    secondsByTask.set(session.task_id, (secondsByTask.get(session.task_id) ?? 0) + seconds);
  }
  return [...secondsByTask.entries()]
    .map(([taskId, seconds]) => ({
      taskId,
      label: labels.get(taskId) ?? "Removed task",
      minutes: Math.round(seconds / 60),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
}

// supabase-js type-parses select strings, so table and column names stay as
// literals at each call site; these helpers only shape rows and errors.
async function queryFirst<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>, table: string): Promise<T | null> {
  const { data, error } = await promise;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  const rows = (data ?? []) as T[];
  return rows.length > 0 ? rows[0] : null;
}

async function queryRows<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>, table: string): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  return (data ?? []) as T[];
}

export async function GET() {
  if (!(await isAuthed())) {
    return errorResponse("Unauthorized", 401);
  }
  try {
    const client = createServiceClient();
    const now = new Date();
    const anchorKey = windDownAnchorKey(now);
    const planKey = windDownPlanKey(now);
    const window = windDownDayWindow(anchorKey);
    const startIso = window.start.toISOString();
    const endIso = window.end.toISOString();

    const [reviewRow, planRow, sessions, projects, tasks, taskLinks, snippets, settingsRow] = await Promise.all([
      queryFirst<{ done_today: string; finished_goal: boolean | null; best_use: boolean | null; best_use_note: string }>(
        client.from("day_reviews").select("done_today, finished_goal, best_use, best_use_note").eq("review_date", anchorKey).limit(1),
        "day_reviews",
      ),
      queryFirst<{ id: string; start_time: string; location: string; prepped: boolean }>(
        client.from("day_plans").select("id, start_time, location, prepped").eq("plan_date", planKey).limit(1),
        "day_plans",
      ),
      queryRows<{ task_id: string | null; active_seconds: number }>(
        client.from("sessions").select("task_id, active_seconds").gte("started_at", startIso).lt("started_at", endIso),
        "sessions",
      ),
      queryRows<{ id: string; name: string }>(client.from("projects").select("id, name").order("position"), "projects"),
      queryRows<TaskRow>(
        client.from("tasks").select("id, project_id, parent_task_id, title, done").order("position"),
        "tasks",
      ),
      queryRows<{ owner_id: string; name: string; url: string }>(
        client.from("links").select("owner_id, name, url").eq("owner_type", "task").order("created_at"),
        "links",
      ),
      queryRows<{ owner_id: string; content: string }>(
        client.from("note_snippets").select("owner_id, content").eq("source", "wind_down").gte("created_at", startIso).lt("created_at", endIso),
        "note_snippets",
      ),
      queryFirst<{ display_name: string; wind_down_time: string }>(
        client.from("settings").select("display_name, wind_down_time").eq("id", 1).limit(1),
        "settings",
      ),
    ]);

    // The plan's ordered tasks need the plan id first, so they run after.
    const planTasks = planRow
      ? await queryRows<PlanTaskRow>(
          client.from("day_plan_tasks").select("position, task_id, tasks(title)").eq("plan_id", planRow.id).order("position"),
          "day_plan_tasks",
        )
      : [];

    const labels = buildLabelMap(projects, tasks);
    const treeProjects: WindDownPickerProject[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      tasks: tasks
        .filter((task) => task.project_id === project.id && task.parent_task_id === null)
        .map((task) => ({
          id: task.id,
          title: task.title,
          done: task.done,
          subtasks: tasks
            .filter((sub) => sub.parent_task_id === task.id)
            .map((sub) => ({ id: sub.id, title: sub.title, done: sub.done })),
        })),
    }));

    const payload: WindDownGetPayload = {
      anchorDateKey: anchorKey,
      planDateKey: planKey,
      review: reviewRow
        ? {
            doneToday: reviewRow.done_today,
            finishedGoal: reviewRow.finished_goal,
            bestUse: reviewRow.best_use,
            bestUseNote: reviewRow.best_use_note,
          }
        : null,
      plan: planRow
        ? {
            startTime: planRow.start_time,
            location: planRow.location,
            prepped: planRow.prepped,
            tasks: planTasks.map((row) => ({ taskId: row.task_id, title: embedTitle(row), position: row.position })),
          }
        : null,
      recaps: snippets.map((row) => ({ taskId: row.owner_id, text: row.content })),
      taskTimes: summarizeTaskTimes(sessions, labels),
      projects: treeProjects,
      taskLinks: taskLinks.map((link) => ({ ownerId: link.owner_id, name: link.name, url: link.url })),
      settings: {
        displayName: settingsRow?.display_name ?? "Boss",
        windDownTime: settingsRow?.wind_down_time ?? "",
      },
    };
    return NextResponse.json({ ok: true, payload });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not load the wind down", 500);
  }
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function highestPosition(client: ServiceClient, table: string, projectId: string | null): Promise<number> {
  let builder = client.from(table).select("position");
  builder = projectId === null ? builder : builder.eq("project_id", projectId);
  const { data, error } = await builder.order("position", { ascending: false }).limit(1);
  if (error) throw new Error(`${table} position query failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ position: number }>;
  return rows.length > 0 ? rows[0].position + 1 : 0;
}

export async function POST(request: NextRequest) {
  if (!(await isAuthed())) {
    return errorResponse("Unauthorized", 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body must be JSON.", 400);
  }
  const parsed = parseSaveBody(body);
  if (!parsed.ok) {
    return errorResponse(parsed.error, 400);
  }
  const save = parsed.value;

  try {
    const client = createServiceClient();
    const now = new Date();
    const anchorKey = windDownAnchorKey(now);
    const planKey = windDownPlanKey(now);
    const window = windDownDayWindow(anchorKey);
    const startIso = window.start.toISOString();
    const endIso = window.end.toISOString();

    // Review (SPEC 8.12 steps 1 to 3): upsert on the unique review_date so a
    // second run the same day updates instead of failing. learned and
    // eod_sent_at belong to the EOD flow and are never touched here.
    if (save.review) {
      const { error } = await client.from("day_reviews").upsert(
        {
          review_date: anchorKey,
          done_today: save.review.doneToday,
          finished_goal: save.review.finishedGoal,
          best_use: save.review.bestUse,
          best_use_note: save.review.bestUseNote,
        },
        { onConflict: "review_date" },
      );
      if (error) throw new Error(`day_reviews write failed: ${error.message}`);
    }

    // Recap snippets (step 4): wind-down snippets for the anchor day are
    // replaced, so re-running the flow never duplicates them and clearing an
    // answer really clears it. Snippets from other sources stay untouched.
    // Existing tasks are checked before the delete so a failed save keeps the
    // owner's earlier recaps.
    if (save.recaps) {
      if (save.recaps.length > 0) {
        const ids = save.recaps.map((recap) => recap.taskId);
        const existing = await queryRows<{ id: string }>(client.from("tasks").select("id").in("id", ids), "tasks");
        const known = new Set(existing.map((row) => row.id));
        if (ids.some((id) => !known.has(id))) {
          return errorResponse("A task you wrote a recap for no longer exists.", 400);
        }
      }
      const { error: deleteError } = await client
        .from("note_snippets")
        .delete()
        .eq("source", "wind_down")
        .gte("created_at", startIso)
        .lt("created_at", endIso);
      if (deleteError) throw new Error(`note_snippets delete failed: ${deleteError.message}`);
      if (save.recaps.length > 0) {
        const { error: insertError } = await client
          .from("note_snippets")
          .insert(
            save.recaps.map((recap) => ({
              owner_type: "task",
              owner_id: recap.taskId,
              content: recap.text,
              context: "",
              source: "wind_down",
            })),
          );
        if (insertError) throw new Error(`note_snippets insert failed: ${insertError.message}`);
      }
    }

    // Plan (steps 5 to 8): upsert the plan row, create any new projects and
    // tasks, then replace the ordered day_plan_tasks rows.
    if (save.planning) {
      const { data: planData, error: planError } = await client
        .from("day_plans")
        .upsert(
          {
            plan_date: planKey,
            start_time: save.planning.startTime,
            location: save.planning.location,
            prepped: save.prepped,
          },
          { onConflict: "plan_date" },
        )
        .select("id")
        .single();
      if (planError) throw new Error(`day_plans write failed: ${planError.message}`);
      const planId = (planData as { id: string } | null)?.id;
      if (typeof planId !== "string") {
        throw new Error("day_plans write returned no id");
      }

      const taskIds: string[] = [];
      for (const entry of save.planning.tasks) {
        if (entry.kind === "existing") {
          taskIds.push(entry.taskId);
          continue;
        }
        let projectId = entry.projectId;
        if (projectId === null) {
          const projectPosition = await highestPosition(client, "projects", null);
          const { data: projectData, error: projectError } = await client
            .from("projects")
            .insert({ name: entry.projectName, position: projectPosition })
            .select("id")
            .single();
          if (projectError) throw new Error(`projects insert failed: ${projectError.message}`);
          const createdProjectId = (projectData as { id: string } | null)?.id;
          if (typeof createdProjectId !== "string") {
            throw new Error("projects insert returned no id");
          }
          projectId = createdProjectId;
        } else {
          const owner = await queryRows<{ id: string }>(client.from("projects").select("id").eq("id", projectId).limit(1), "projects");
          if (owner.length === 0) {
            return errorResponse("A planned project no longer exists.", 400);
          }
        }
        const taskPosition = await highestPosition(client, "tasks", projectId);
        const { data: taskData, error: taskError } = await client
          .from("tasks")
          .insert({ project_id: projectId, title: entry.taskTitle, position: taskPosition })
          .select("id")
          .single();
        if (taskError) throw new Error(`tasks insert failed: ${taskError.message}`);
        const createdTaskId = (taskData as { id: string } | null)?.id;
        if (typeof createdTaskId !== "string") {
          throw new Error("tasks insert returned no id");
        }
        taskIds.push(createdTaskId);
      }

      // Existing planned tasks must still exist (they may have been deleted
      // while the modal was open).
      if (taskIds.length > 0) {
        const existing = await queryRows<{ id: string }>(client.from("tasks").select("id").in("id", taskIds), "tasks");
        const known = new Set(existing.map((row) => row.id));
        if (taskIds.some((id) => !known.has(id))) {
          return errorResponse("A planned task no longer exists.", 400);
        }
      }

      const { error: replaceError } = await client.from("day_plan_tasks").delete().eq("plan_id", planId);
      if (replaceError) throw new Error(`day_plan_tasks delete failed: ${replaceError.message}`);
      if (taskIds.length > 0) {
        const { error: planTaskError } = await client
          .from("day_plan_tasks")
          .insert(taskIds.map((taskId, index) => ({ plan_id: planId, task_id: taskId, position: index })));
        if (planTaskError) throw new Error(`day_plan_tasks insert failed: ${planTaskError.message}`);
      }
    }

    return NextResponse.json({ ok: true, anchorDateKey: anchorKey, planDateKey: planKey });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not save the wind down", 500);
  }
}

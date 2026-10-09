// Server-side EOD day data fetch (SPEC 8.13). Runs only in API routes with
// the service role client; returns raw rows for the pure builder.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EodContext,
  EodDayData,
  EodInfractionRow,
  EodSessionRow,
  EodTimeStudyRow,
} from "./eod-report";

type SessionRow = {
  task_id: string | null;
  project_id: string | null;
  misc_task_id: string | null;
  active_seconds: number;
  started_at: string;
};

type InfractionRow = { kind: string; detail: string; occurred_at: string };
type TimeStudyRow = { text: string; occurred_at: string };
type ReviewRow = {
  done_today: string | null;
  learned: string | null;
  finished_goal: boolean | null;
  best_use: boolean | null;
  best_use_note: string | null;
};
type PlanRow = { id: string; start_time: string | null; location: string | null };
// PostgREST returns to-one embeds as objects; supabase-js's parser may type
// them as arrays, so accept both and normalize at runtime.
type PlanTaskRow = { position: number; tasks: { title: string } | { title: string }[] | null };

function planTaskTitle(row: PlanTaskRow): string {
  const tasks = row.tasks;
  if (!tasks) return "";
  const title = Array.isArray(tasks) ? tasks[0]?.title : tasks.title;
  return typeof title === "string" ? title : "";
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

async function queryRows<T>(promise: PromiseLike<QueryResult<T[]>>, table: string): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  return (data ?? []) as T[];
}

async function queryMaybe<T>(promise: PromiseLike<QueryResult<T>>, table: string): Promise<T | null> {
  const { data, error } = await promise;
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  return (data ?? null) as T | null;
}

type NameRow = { id: string; title?: string | null; name?: string | null };

// supabase-js type-parses select strings, so table and column must be literals
// at each call site; only the row-to-map conversion is shared.
function toNameMap(rows: NameRow[], useName: boolean): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const label = useName ? row.name : row.title;
    if (label) map.set(row.id, label);
  }
  return map;
}

async function fetchNameMap(
  promise: PromiseLike<QueryResult<NameRow[]>>,
  table: string,
  useName: boolean,
): Promise<Map<string, string>> {
  return toNameMap(await queryRows<NameRow>(promise, table), useName);
}

export async function fetchEodDayData(client: SupabaseClient, context: EodContext): Promise<EodDayData> {
  const [sessions, infractions, timeStudies, reviewRow, planRow] = await Promise.all([
    queryRows<SessionRow>(
      client
        .from("sessions")
        .select("task_id, project_id, misc_task_id, active_seconds, started_at")
        .gte("started_at", context.startIso)
        .lt("started_at", context.endIso)
        .order("started_at"),
      "sessions",
    ),
    queryRows<InfractionRow>(
      client
        .from("infractions")
        .select("kind, detail, occurred_at")
        .gte("occurred_at", context.startIso)
        .lt("occurred_at", context.endIso)
        .order("occurred_at"),
      "infractions",
    ),
    queryRows<TimeStudyRow>(
      client
        .from("time_studies")
        .select("text, occurred_at")
        .gte("occurred_at", context.startIso)
        .lt("occurred_at", context.endIso)
        .order("occurred_at"),
      "time_studies",
    ),
    queryMaybe<ReviewRow>(
      client
        .from("day_reviews")
        .select("done_today, learned, finished_goal, best_use, best_use_note")
        .eq("review_date", context.todayIso)
        .limit(1)
        .maybeSingle(),
      "day_reviews",
    ),
    queryMaybe<PlanRow>(
      client
        .from("day_plans")
        .select("id, start_time, location")
        .eq("plan_date", context.tomorrowIso)
        .limit(1)
        .maybeSingle(),
      "day_plans",
    ),
  ]);

  // Resolve display labels for sessions (task > project > misc task).
  const taskIds = [...new Set(sessions.map((s) => s.task_id).filter((id): id is string => id !== null))];
  const projectIds = [...new Set(sessions.map((s) => s.project_id).filter((id): id is string => id !== null))];
  const miscIds = [...new Set(sessions.map((s) => s.misc_task_id).filter((id): id is string => id !== null))];
  const [taskTitles, projectNames, miscTitles] = await Promise.all([
    taskIds.length === 0
      ? new Map<string, string>()
      : fetchNameMap(
          client.from("tasks").select("id, title").in("id", taskIds),
          "tasks",
          false,
        ),
    projectIds.length === 0
      ? new Map<string, string>()
      : fetchNameMap(
          client.from("projects").select("id, name").in("id", projectIds),
          "projects",
          true,
        ),
    miscIds.length === 0
      ? new Map<string, string>()
      : fetchNameMap(
          client.from("misc_tasks").select("id, title").in("id", miscIds),
          "misc_tasks",
          false,
        ),
  ]);

  const sessionRows: EodSessionRow[] = sessions.map((s) => {
    let label: string | null = null;
    if (s.task_id && taskTitles.has(s.task_id)) label = taskTitles.get(s.task_id) ?? null;
    else if (s.project_id && projectNames.has(s.project_id)) label = projectNames.get(s.project_id) ?? null;
    else if (s.misc_task_id && miscTitles.has(s.misc_task_id)) {
      label = `Misc: ${miscTitles.get(s.misc_task_id) ?? "task"}`;
    }
    return { activeSeconds: s.active_seconds, startedAt: s.started_at, label };
  });

  const planTasks = planRow
    ? (
        await queryRows<PlanTaskRow>(
          client
            .from("day_plan_tasks")
            .select("position, tasks(title)")
            .eq("plan_id", planRow.id)
            .order("position"),
          "day_plan_tasks",
        )
      )
        .map(planTaskTitle)
        .filter((title) => title !== "")
    : [];

  return {
    sessions: sessionRows,
    infractions: infractions.map((i): EodInfractionRow => ({
      kind: i.kind === "manual" ? "manual" : "site",
      detail: i.detail,
      occurredAt: i.occurred_at,
    })),
    timeStudies: timeStudies.map((t): EodTimeStudyRow => ({ text: t.text, occurredAt: t.occurred_at })),
    review: reviewRow
      ? {
          doneToday: reviewRow.done_today ?? "",
          learned: reviewRow.learned ?? "",
          finishedGoal: typeof reviewRow.finished_goal === "boolean" ? reviewRow.finished_goal : null,
          bestUse: typeof reviewRow.best_use === "boolean" ? reviewRow.best_use : null,
          bestUseNote: reviewRow.best_use_note ?? "",
        }
      : null,
    plan: planRow
      ? {
          startTime: planRow.start_time ?? "",
          location: planRow.location ?? "",
          tasks: planTasks,
        }
      : null,
  };
}

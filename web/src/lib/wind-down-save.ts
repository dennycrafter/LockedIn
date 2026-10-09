// Server-side validation for the wind-down save body (SPEC 8.12). Lives in
// the lib so Next.js route files export only their HTTP handlers; the route
// calls parseSaveBody before any database write.

import type { WindDownSavePayload } from "@/lib/wind-down-state";

export interface WindDownSaveBody {
  review: WindDownSavePayload["review"];
  recaps: WindDownSavePayload["recaps"];
  planning: WindDownSavePayload["planning"];
  prepped: boolean;
}

type PlanTaskInput = NonNullable<WindDownSavePayload["planning"]>["tasks"][number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REVIEW_TEXT = 5_000;
const MAX_RECAP_TEXT = 2_000;
const MAX_RECAPS = 50;
const MAX_PLAN_TASKS = 50;
const MAX_TIME_TEXT = 60;
const MAX_TITLE = 300;
const MAX_PROJECT_NAME = 120;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseSaveBody(body: unknown): { ok: true; value: WindDownSaveBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;

  let review: WindDownSaveBody["review"] = null;
  if (raw.review !== null && raw.review !== undefined) {
    if (typeof raw.review !== "object" || raw.review === null) {
      return { ok: false, error: "Review must be an object or null." };
    }
    const rawReview = raw.review as Record<string, unknown>;
    if (
      rawReview.doneToday === undefined &&
      rawReview.finishedGoal === undefined &&
      rawReview.bestUse === undefined &&
      rawReview.bestUseNote === undefined
    ) {
      return { ok: false, error: "Review answers are missing." };
    }
    review = {
      doneToday: cleanText(rawReview.doneToday, MAX_REVIEW_TEXT),
      finishedGoal: typeof rawReview.finishedGoal === "boolean" ? rawReview.finishedGoal : null,
      bestUse: typeof rawReview.bestUse === "boolean" ? rawReview.bestUse : null,
      bestUseNote: cleanText(rawReview.bestUseNote, MAX_REVIEW_TEXT),
    };
  }

  let recaps: WindDownSaveBody["recaps"] = null;
  if (raw.recaps !== null && raw.recaps !== undefined) {
    if (!Array.isArray(raw.recaps) || raw.recaps.length > MAX_RECAPS) {
      return { ok: false, error: "Recaps must be a list of at most 50 answers." };
    }
    const parsedRecaps: Array<{ taskId: string; text: string }> = [];
    for (const entry of raw.recaps) {
      if (typeof entry !== "object" || entry === null) {
        return { ok: false, error: "Each recap needs a task and a note." };
      }
      const rawRecap = entry as Record<string, unknown>;
      if (!isUuid(rawRecap.taskId)) {
        return { ok: false, error: "Recap task is not a valid task." };
      }
      const text = cleanText(rawRecap.text, MAX_RECAP_TEXT);
      if (text === "") {
        return { ok: false, error: "Recap notes cannot be empty." };
      }
      parsedRecaps.push({ taskId: rawRecap.taskId, text });
    }
    recaps = parsedRecaps;
  }

  let planning: WindDownSaveBody["planning"] = null;
  if (raw.planning !== null && raw.planning !== undefined) {
    if (typeof raw.planning !== "object" || raw.planning === null) {
      return { ok: false, error: "Planning must be an object." };
    }
    const rawPlanning = raw.planning as Record<string, unknown>;
    if (!Array.isArray(rawPlanning.tasks) || rawPlanning.tasks.length > MAX_PLAN_TASKS) {
      return { ok: false, error: "The plan holds at most 50 tasks." };
    }
    const plannedTasks: PlanTaskInput[] = [];
    for (const entry of rawPlanning.tasks) {
      if (typeof entry !== "object" || entry === null) {
        return { ok: false, error: "Each planned task must be an object." };
      }
      const rawTask = entry as Record<string, unknown>;
      if (rawTask.kind === "existing") {
        if (!isUuid(rawTask.taskId)) {
          return { ok: false, error: "Planned task is not a valid task." };
        }
        plannedTasks.push({ kind: "existing", taskId: rawTask.taskId });
      } else if (rawTask.kind === "new") {
        const taskTitle = cleanText(rawTask.taskTitle, MAX_TITLE);
        if (taskTitle === "") {
          return { ok: false, error: "A new task needs a title." };
        }
        const projectId = rawTask.projectId === null || rawTask.projectId === undefined ? null : rawTask.projectId;
        if (projectId !== null && !isUuid(projectId)) {
          return { ok: false, error: "Planned project is not a valid project." };
        }
        const projectName = cleanText(rawTask.projectName, MAX_PROJECT_NAME);
        if (projectId === null && projectName === "") {
          return { ok: false, error: "A new project needs a name." };
        }
        plannedTasks.push({ kind: "new", projectId, projectName, taskTitle });
      } else {
        return { ok: false, error: "Planned tasks must be existing or new." };
      }
    }
    planning = {
      startTime: cleanText(rawPlanning.startTime, MAX_TIME_TEXT),
      location: cleanText(rawPlanning.location, MAX_TIME_TEXT),
      tasks: plannedTasks,
    };
  }

  return {
    ok: true,
    value: { review, recaps, planning, prepped: raw.prepped === true },
  };
}

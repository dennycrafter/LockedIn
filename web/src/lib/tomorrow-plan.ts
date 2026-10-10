// Tomorrow's task list panel logic (SPEC 8.12): pick the plan the panel shows
// (the nearest plan whose date is today or later in America/Chicago) and shape
// its ordered rows for display. Pure module so vitest can pin instants; the
// route supplies rows already ordered by day_plan_tasks.position, and this
// module re-exports through the panel, never touching the wind-down modal's
// internals.

import { chicagoDateKey } from "./time";
import { addDaysToKey } from "./wind-down-time";

/** One planned task as the panel renders it (SPEC 8.12: tick box, timer, context). */
export interface TomorrowPlanRow {
  taskId: string;
  title: string;
  done: boolean;
  /** Ancestor chain "Project" or "Project > Task"; the row shows its own title. */
  contextLabel: string;
  position: number;
}

/** The plan the panel shows: meta plus rows in day_plan_tasks order. */
export interface TomorrowPlan {
  planDateKey: string;
  startTime: string;
  location: string;
  prepped: boolean;
  rows: TomorrowPlanRow[];
}

/**
 * Oldest plan_date the panel will show (SPEC 8.12: "the latest plan whose date
 * is today or later"). It is today's Chicago key, so the selection rolls over
 * at local midnight, not UTC: the plan built yesterday evening surfaces when
 * the calendar day turns.
 */
export function upcomingPlanKey(now: Date): string {
  return chicagoDateKey(now);
}

/**
 * The rows the panel shows: planned order restored, completed tasks removed
 * (ticking a row is how items leave the list, SPEC 8.12 tick boxes), and rows
 * whose task record went away dropped rather than rendered blank.
 */
export function visiblePlanRows(rows: TomorrowPlanRow[]): TomorrowPlanRow[] {
  return rows
    .filter((row) => row.taskId !== "" && row.title !== "" && !row.done)
    .sort((a, b) => a.position - b.position);
}

/** Task id under the "Most important task" label: first visible row, null when none. */
export function mostImportantRowId(rows: TomorrowPlanRow[]): string | null {
  return visiblePlanRows(rows)[0]?.taskId ?? null;
}

/**
 * Celebration trigger (SPEC 8.10): the last item of the plan was ticked. Only
 * fires when the visible list held exactly one row before the tick and holds
 * none after, so a failed save (row still there afterwards) never celebrates.
 */
export function shouldCelebratePlanFinish(
  rowsBefore: TomorrowPlanRow[],
  rowsAfter: TomorrowPlanRow[],
): boolean {
  return visiblePlanRows(rowsBefore).length === 1 && visiblePlanRows(rowsAfter).length === 0;
}

/**
 * "Today" / "Tomorrow" / weekday name for the plan's date, judged in
 * America/Chicago so the label follows the same rollover as the selection.
 */
export function planDateHeading(planDateKey: string, now: Date): string {
  const today = chicagoDateKey(now);
  if (planDateKey === today) return "Today";
  if (planDateKey === addDaysToKey(today, 1)) return "Tomorrow";
  // Noon UTC is midday in Chicago on any date, DST edges included, so the
  // weekday is read off the key without zone drift.
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${planDateKey}T12:00:00Z`),
  );
}

/** "Tomorrow · Starts 8am · Location: home"; quiet parts drop when empty. */
export function planMetaLine(plan: TomorrowPlan, now: Date): string {
  const parts = [planDateHeading(plan.planDateKey, now)];
  if (plan.startTime !== "") parts.push(`Starts ${plan.startTime}`);
  if (plan.location !== "") parts.push(`Location: ${plan.location}`);
  return parts.join(" · ");
}

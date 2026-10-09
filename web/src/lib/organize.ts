// Organize flow (SPEC 8.14, T7a): pure selection and ranking logic for the
// "Organize my task list" helper modal. Kept separate from the wind-down
// selectors in planning.ts on purpose: the organize dump explicitly includes
// misc tasks (SPEC 8.14 step 1), while wind down excludes them (SPEC 8.9).

import type { MiscTaskData, ProjectData } from "./dashboard-data";

export type DeadlineBucket = "none" | "today" | "week" | "later";

/** SPEC 8.14 step 3: today 6, this week 3, later 1, none 0. */
export const DEADLINE_BONUS: Record<DeadlineBucket, number> = { none: 0, today: 6, week: 3, later: 1 };

/** Stronger deadline wins a score tie; "today" sorts before "none". */
const DEADLINE_RANK: Record<DeadlineBucket, number> = { today: 0, week: 1, later: 2, none: 3 };

/**
 * One dumpable work item. The id follows the kind: tasks-table id for tasks
 * and subtasks (the id day_plan_tasks references), misc_tasks id for misc
 * (which cannot be planned: day_plan_tasks only references tasks).
 */
export type OrganizeItem =
  | { kind: "task" | "subtask"; id: string; title: string; label: string }
  | { kind: "misc"; id: string; title: string; label: string };

export interface OrganizeRating {
  deadline: DeadlineBucket;
  /** 1 to 5. */
  impact: number;
  /** 1 to 5. */
  effort: number;
}

export const DEFAULT_RATING: OrganizeRating = { deadline: "none", impact: 3, effort: 3 };

/** SPEC 8.14 step 3: impact * 2 + deadline bonus - effort. */
export function organizeScore(rating: OrganizeRating): number {
  return rating.impact * 2 + DEADLINE_BONUS[rating.deadline] - rating.effort;
}

export interface RankedOrganizeItem {
  item: OrganizeItem;
  rating: OrganizeRating;
  score: number;
}

/** Sort descending by score; ties by deadline (strongest first) then title. */
export function rankOrganizeItems(entries: Array<{ item: OrganizeItem; rating: OrganizeRating }>): RankedOrganizeItem[] {
  return entries
    .map((entry) => ({ item: entry.item, rating: entry.rating, score: organizeScore(entry.rating) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const deadlineGap = DEADLINE_RANK[a.rating.deadline] - DEADLINE_RANK[b.rating.deadline];
      if (deadlineGap !== 0) return deadlineGap;
      return a.item.title.localeCompare(b.item.title);
    });
}

/**
 * Every undone work item, tree order first (projects > tasks > subtasks),
 * then undone misc tasks. Done items are never dumped.
 */
export function organizeDumpItems(projects: ProjectData[], miscTasks: MiscTaskData[]): OrganizeItem[] {
  const items: OrganizeItem[] = [];
  for (const project of projects) {
    for (const task of project.tasks) {
      if (!task.done) {
        items.push({ kind: "task", id: task.id, title: task.title, label: `${project.name} > ${task.title}` });
      }
      for (const sub of task.subtasks) {
        if (!sub.done) {
          items.push({
            kind: "subtask",
            id: sub.id,
            title: sub.title,
            label: `${project.name} > ${task.title} > ${sub.title}`,
          });
        }
      }
    }
  }
  for (const misc of miscTasks) {
    if (!misc.done) {
      items.push({ kind: "misc", id: misc.id, title: misc.title, label: misc.title });
    }
  }
  return items;
}

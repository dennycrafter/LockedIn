// Delete with undo (UI polish, Oct 2026): a delete hides the item right away
// and only reaches the database after the undo window closes. Until then the
// dashboard data is filtered through hidePending, so refetches that still
// contain the item never bring it back on screen.

import type { DashboardData, TaskData } from "./dashboard-data";

export const UNDO_WINDOW_MS = 6000;

function pruneTasks(tasks: TaskData[], hidden: ReadonlySet<string>): TaskData[] {
  return tasks
    .filter((task) => !hidden.has(task.id))
    .map((task) => (task.subtasks.length > 0 ? { ...task, subtasks: pruneTasks(task.subtasks, hidden) } : task));
}

/** Dashboard data with every pending-delete id removed (projects, tasks, subtasks, misc tasks, open loops). */
export function hidePending(data: DashboardData, hidden: ReadonlySet<string>): DashboardData {
  if (hidden.size === 0) return data;
  return {
    ...data,
    projects: data.projects
      .filter((project) => !hidden.has(project.id))
      .map((project) => ({ ...project, tasks: pruneTasks(project.tasks, hidden) })),
    miscTasks: data.miscTasks.filter((task) => !hidden.has(task.id)),
    openLoops: data.openLoops.filter((loop) => !hidden.has(loop.id)),
  };
}

/** Short quoted name for the undo toast: "Deleted "Apply to 5 roles..."". */
export function undoLabel(name: string, max = 32): string {
  const clean = name.trim();
  const short = clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
  return `Deleted "${short}"`;
}

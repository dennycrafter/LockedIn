// Tree math for the three-level project tree (SPEC 8.2). Pure functions so
// vitest can pin the acceptance numbers (1 of 4 = 25%, 0 items = 0%).

import type { ProjectData } from "./dashboard-data";

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

/** Every task and subtask of a project, depth first, in display order. */
export function projectItems(project: Pick<ProjectData, "tasks">): ProjectData["tasks"] {
  const items: ProjectData["tasks"] = [];
  for (const task of project.tasks) {
    items.push(task);
    for (const subtask of task.subtasks) items.push(subtask);
  }
  return items;
}

/**
 * Project progress: done tasks and subtasks / all tasks and subtasks, rounded.
 * A project with no items is 0%, not a division by zero (SPEC 8.2).
 */
export function projectProgress(project: Pick<ProjectData, "tasks">): Progress {
  const items = projectItems(project);
  const total = items.length;
  if (total === 0) return { done: 0, total: 0, percent: 0 };
  const done = items.filter((item) => item.done).length;
  return { done, total, percent: Math.round((done / total) * 100) };
}

/** The project that owns a task or subtask id, or null when not found. */
export function projectOfTask(
  projects: ProjectData[],
  taskId: string,
): ProjectData | null {
  for (const project of projects) {
    if (project.tasks.some((task) => task.id === taskId || task.subtasks.some((sub) => sub.id === taskId))) {
      return project;
    }
  }
  return null;
}

/** A new projects array with one task or subtask ticked, for local projection. */
export function withTaskDone(projects: ProjectData[], taskId: string, done: boolean): ProjectData[] {
  return projects.map((project) => {
    const touches = project.tasks.some(
      (task) => task.id === taskId || task.subtasks.some((sub) => sub.id === taskId),
    );
    if (!touches) return project;
    return {
      ...project,
      tasks: project.tasks.map((task) => ({
        ...task,
        done: task.id === taskId ? done : task.done,
        subtasks: task.subtasks.map((sub) => (sub.id === taskId ? { ...sub, done } : sub)),
      })),
    };
  });
}

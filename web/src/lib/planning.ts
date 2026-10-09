// Planning selectors for the surfaces that list work to do next: the wind
// down (T6) and the organize flow (T7). Misc tasks are their own list with no
// notes or links, and SPEC 8.9 forbids them from appearing in wind down. This
// selector is the one enforcement point: it accepts the misc list as input
// (call sites pass their whole data bundle) and structurally drops it, so no
// future caller can leak a misc task into a plan by accident.

import type { MiscTaskData, ProjectData } from "./dashboard-data";

export interface PlanningCandidate {
  taskId: string;
  projectId: string;
  /** Display label, most specific first: "Project > Task > Subtask". */
  label: string;
}

/**
 * Undone tasks and subtasks only, in tree order. Misc tasks passed in are
 * ignored by design (SPEC 8.9); done items are never planning candidates.
 */
export function windDownCandidates(projects: ProjectData[], miscTasks: MiscTaskData[]): PlanningCandidate[] {
  void miscTasks; // Excluded on purpose: see module comment.
  const candidates: PlanningCandidate[] = [];
  for (const project of projects) {
    for (const task of project.tasks) {
      if (!task.done) {
        candidates.push({ taskId: task.id, projectId: project.id, label: `${project.name} > ${task.title}` });
      }
      for (const sub of task.subtasks) {
        if (!sub.done) {
          candidates.push({
            taskId: sub.id,
            projectId: project.id,
            label: `${project.name} > ${task.title} > ${sub.title}`,
          });
        }
      }
    }
  }
  return candidates;
}

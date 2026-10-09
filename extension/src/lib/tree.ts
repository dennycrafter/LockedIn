// Project/task/subtask tree cached from the dashboard (SPEC 8.17 setTree,
// used by the right-click picker in SPEC 8.7). sanitizeTree is the strict
// reader: anything malformed yields null and the picker shows "no tree".

export interface TreeSubtask {
  id: string;
  title: string;
}

export interface TreeTask {
  id: string;
  title: string;
  subtasks: TreeSubtask[];
}

export interface TreeProject {
  id: string;
  name: string;
  tasks: TreeTask[];
}

export interface TreeState {
  projects: TreeProject[];
}

export interface PickerOption {
  ownerType: "project" | "task";
  ownerId: string;
  // "p:" ids are projects, "t:" tasks, "s:" subtasks; the picker select uses
  // these codes and maps a pick back to ownerType + ownerId.
  code: string;
  label: string; // full path, e.g. "Site redesign › Write copy › Draft"
}

/** Returns null when the payload is not a well-formed dashboard tree. */
export function sanitizeTree(payload: unknown): TreeState | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.projects)) return null;
  const projects: TreeProject[] = [];
  for (const item of raw.projects) {
    if (typeof item !== "object" || item === null) return null;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || p.id === "" || typeof p.name !== "string") return null;
    const tasks: TreeTask[] = [];
    if (p.tasks !== undefined) {
      if (!Array.isArray(p.tasks)) return null;
      for (const taskItem of p.tasks) {
        if (typeof taskItem !== "object" || taskItem === null) return null;
        const t = taskItem as Record<string, unknown>;
        if (typeof t.id !== "string" || t.id === "" || typeof t.title !== "string") return null;
        const subtasks: TreeSubtask[] = [];
        if (t.subtasks !== undefined) {
          if (!Array.isArray(t.subtasks)) return null;
          for (const subItem of t.subtasks) {
            if (typeof subItem !== "object" || subItem === null) return null;
            const s = subItem as Record<string, unknown>;
            if (typeof s.id !== "string" || s.id === "" || typeof s.title !== "string") return null;
            subtasks.push({ id: s.id, title: s.title });
          }
        }
        tasks.push({ id: t.id, title: t.title, subtasks });
      }
    }
    projects.push({ id: p.id, name: p.name, tasks });
  }
  return { projects };
}

/** Flattened picker options: every project, then its tasks, then subtasks. */
export function flattenPickerOptions(tree: TreeState | null): PickerOption[] {
  if (!tree) return [];
  const options: PickerOption[] = [];
  for (const project of tree.projects) {
    options.push({ ownerType: "project", ownerId: project.id, code: `p:${project.id}`, label: project.name });
    for (const task of project.tasks) {
      options.push({
        ownerType: "task",
        ownerId: task.id,
        code: `t:${task.id}`,
        label: `${project.name} \u203A ${task.title}`,
      });
      for (const subtask of task.subtasks) {
        options.push({
          ownerType: "task",
          ownerId: subtask.id,
          code: `s:${subtask.id}`,
          label: `${project.name} \u203A ${task.title} \u203A ${subtask.title}`,
        });
      }
    }
  }
  return options;
}

/** Maps a picker code back to the snippet owner; null for unknown codes. */
export function ownerOfCode(options: PickerOption[], code: string): { ownerType: "project" | "task"; ownerId: string } | null {
  const option = options.find((o) => o.code === code);
  if (!option) return null;
  return { ownerType: option.ownerType, ownerId: option.ownerId };
}

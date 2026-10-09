// Dashboard tree for the extension's right-click picker (SPEC 8.17 setTree):
// the dashboard pushes this shape on load and on every change; the extension
// caches it and the capture picker reads it from chrome.storage.local.

import type { ProjectData, TaskData } from "@/lib/dashboard-data";

export interface ExtensionTreeSubtask {
  id: string;
  title: string;
}

export interface ExtensionTreeTask {
  id: string;
  title: string;
  subtasks: ExtensionTreeSubtask[];
}

export interface ExtensionTreeProject {
  id: string;
  name: string;
  tasks: ExtensionTreeTask[];
}

export interface ExtensionTree {
  projects: ExtensionTreeProject[];
}

export function toExtensionTree(projects: ProjectData[]): ExtensionTree {
  const toSubtask = (task: TaskData): ExtensionTreeSubtask => ({ id: task.id, title: task.title });
  return {
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      tasks: project.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        subtasks: task.subtasks.map(toSubtask),
      })),
    })),
  };
}

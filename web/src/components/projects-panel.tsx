"use client";

// Projects panel, T1 scope (SPEC 8.2 minus drag/subtasks, which land in T2):
// collapsible project blocks, add project, add task, tick, delete, progress %.
import { useState } from "react";
import type { ProjectData } from "@/lib/dashboard-data";

function progressPercent(project: ProjectData): number {
  const items = project.tasks.length;
  if (items === 0) return 0;
  return Math.round((project.tasks.filter((task) => task.done).length / items) * 100);
}

export function ProjectsPanel({
  projects,
  onCreateProject,
  onCreateTask,
  onToggleTask,
  onDeleteProject,
  onDeleteTask,
  onStartTask,
}: {
  projects: ProjectData[];
  onCreateProject: (name: string) => void;
  onCreateTask: (projectId: string, title: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTask: (taskId: string) => void;
}) {
  const [newProjectName, setNewProjectName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});

  return (
    <section aria-label="Projects" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--fg)]">Projects</h2>
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newProjectName.trim();
          if (name) {
            onCreateProject(name);
            setNewProjectName("");
          }
        }}
      >
        <input
          type="text"
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder="New project name"
          aria-label="New project name"
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Add project
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No projects yet. Add one above to get started.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const isCollapsed = collapsed[project.id] ?? false;
            return (
              <div key={project.id} className="rounded-md border border-[var(--line)]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [project.id]: !isCollapsed }))}
                    aria-label={isCollapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
                    aria-expanded={!isCollapsed}
                    className="text-[var(--muted)] hover:text-[var(--fg)]"
                  >
                    {isCollapsed ? ">" : "v"}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">{project.name}</span>
                  <span className="shrink-0 text-xs text-[var(--muted)]" aria-label={`${progressPercent(project)} percent done`}>
                    {progressPercent(project)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete project "${project.name}" and all of its tasks?`)) {
                        onDeleteProject(project.id);
                      }
                    }}
                    aria-label={`Delete project ${project.name}`}
                    className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
                  >
                    Delete
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="border-t border-[var(--line)] px-3 py-2">
                    {project.tasks.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No tasks yet.</p>
                    ) : (
                      <ul>
                        {project.tasks.map((task) => (
                          <li key={task.id} className="flex items-center gap-2 border-b border-[var(--line)] py-2 last:border-b-0">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={(event) => onToggleTask(task.id, event.target.checked)}
                              aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
                              className="h-4 w-4"
                            />
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--fg)]"}`}
                            >
                              {task.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => onStartTask(task.id)}
                              aria-label={`Start a session on ${task.title}`}
                              className="text-[var(--muted)] hover:text-[var(--fg)]"
                              title="Start a session on this task"
                            >
                              ▶
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.id)}
                              aria-label={`Delete ${task.title}`}
                              className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const title = (taskDrafts[project.id] ?? "").trim();
                        if (title) {
                          onCreateTask(project.id, title);
                          setTaskDrafts((prev) => ({ ...prev, [project.id]: "" }));
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={taskDrafts[project.id] ?? ""}
                        onChange={(event) => setTaskDrafts((prev) => ({ ...prev, [project.id]: event.target.value }))}
                        placeholder="New task"
                        aria-label={`New task in ${project.name}`}
                        className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
                      >
                        Add task
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

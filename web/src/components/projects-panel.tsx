"use client";

// Projects panel (T2, SPEC 8.2, 8.3, 8.7): the full three-level tree.
// Drag reorder via @dnd-kit at three scopes (projects, tasks in a project,
// subtasks in a task), rename inline, tick, delete with confirm on projects,
// links modal per item, item notes with dated snippets, progress rings.

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectData, TaskData } from "@/lib/dashboard-data";
import { applyReorder } from "@/lib/reorder";
import { projectProgress } from "@/lib/tree";
import { EditableTitle } from "./editable-title";
import { ItemNotes } from "./item-notes";
import { LinksModal } from "./links-modal";
import { ProgressRing } from "./progress-ring";

export type LinkOwner = { ownerType: "project" | "task"; ownerId: string; label: string };

export interface ProjectsPanelHandlers {
  onCreateProject: (name: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onUpdateProjectNotes: (projectId: string, notes: string) => void;
  onDeleteProject: (projectId: string) => void;
  onReorder: (kind: "projects" | "tasks" | "subtasks", orderedIds: string[]) => void;
  onCreateTask: (projectId: string, parentId: string | null, title: string) => void;
  onRenameTask: (taskId: string, title: string) => void;
  onToggleTask: (taskId: string, done: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTaskNotes: (taskId: string, notes: string) => void;
  onStartTask: (taskId: string) => void;
  onStartProject: (projectId: string) => void;
  onAddLink: (ownerType: "project" | "task", ownerId: string, name: string, url: string) => void;
  onDeleteLink: (linkId: string) => void;
}

const HANDLE_CLASS = "cursor-grab select-none touch-none px-1 text-[var(--muted)] hover:text-[var(--fg)]";
const ROW_CLASS = "flex items-center gap-2 px-3 py-2";
const ICON_BUTTON = "shrink-0 px-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]";
const COLLAPSED_KEY = "lockedin-collapsed-projects";

function readCollapsedProjects(): string[] {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistCollapsedProjects(ids: string[]) {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
  } catch {
    // Private mode or storage full: collapse state just does not persist.
  }
}

function sortableStyle(transform: never, transition: string | undefined, isDragging: boolean): React.CSSProperties {
  return {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    background: isDragging ? "var(--surface-2)" : undefined,
  };
}

/** The shared drag handle. dnd-kit keyboard sensor activates from focus here. */
function DragHandle({
  activatorRef,
  attributes,
  listeners,
  label,
}: {
  activatorRef: (node: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  label: string;
}) {
  return (
    <button
      ref={activatorRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={label}
      className={HANDLE_CLASS}
    >
      ⠿
    </button>
  );
}

interface RowProps {
  task: TaskData;
  depth: "task" | "subtask";
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  /** A session is running, so the SPEC 8.4 one-session rule disables its timer button. */
  sessionActive: boolean;
}

function TaskRow({ task, depth, handlers, onOpenLinks, sessionActive }: RowProps) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const [notesOpen, setNotesOpen] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  const subtasks =
    depth === "task" ? (
      <div className="pb-2 pl-8">
        <SubtaskDnd task={task} handlers={handlers} onOpenLinks={onOpenLinks} sessionActive={sessionActive} />
        <form
          className="mt-1 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const title = subtaskDraft.trim();
            if (title) {
              handlers.onCreateTask(task.project_id, task.id, title);
              setSubtaskDraft("");
            }
          }}
        >
          <input
            type="text"
            value={subtaskDraft}
            onChange={(event) => setSubtaskDraft(event.target.value)}
            placeholder="+ Add subtask"
            aria-label={`New subtask in ${task.title}`}
            className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--fg)] placeholder:text-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={subtaskDraft.trim() === ""}
            className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>
    ) : null;

  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform as never, transition, isDragging)}
      className="border-b border-[var(--line)] last:border-b-0"
    >
      <div className={`${ROW_CLASS} ${depth === "subtask" ? "pl-8" : ""}`}>
        <DragHandle
          activatorRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          label="Drag to reorder"
        />
        <input
          type="checkbox"
          checked={task.done}
          onChange={(event) => handlers.onToggleTask(task.id, event.target.checked)}
          aria-label={task.done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
          className="h-4 w-4"
        />
        <EditableTitle
          title={task.title}
          onRename={(title) => handlers.onRenameTask(task.id, title)}
          label={task.title}
          className={`text-sm ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--fg)]"}`}
        />
        <button
          type="button"
          onClick={() => onOpenLinks({ ownerType: "task", ownerId: task.id, label: task.title })}
          aria-label={`Links on ${task.title}`}
          title="Links"
          className={ICON_BUTTON}
        >
          ↗ {task.links.length > 0 ? task.links.length : ""}
        </button>
        <button
          type="button"
          onClick={() => setNotesOpen((prev) => !prev)}
          aria-label={`Notes on ${task.title}`}
          aria-expanded={notesOpen}
          title="Notes"
          className={ICON_BUTTON}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => handlers.onStartTask(task.id)}
          disabled={sessionActive}
          aria-label={`Start a session on ${task.title}`}
          title={sessionActive ? "A session is already running" : "Start a session on this item"}
          className={`${ICON_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => handlers.onDeleteTask(task.id)}
          aria-label={`Delete ${task.title}`}
          className={`${ICON_BUTTON} hover:text-[var(--bad)]`}
        >
          Delete
        </button>
      </div>

      {notesOpen && (
        <div className="px-3 pb-2 pl-9">
          <ItemNotes
            notes={task.notes}
            snippets={task.snippets}
            ownerLabel={task.title}
            onSave={(notes) => handlers.onUpdateTaskNotes(task.id, notes)}
          />
        </div>
      )}

      {subtasks}
    </li>
  );
}

/** Subtask drag scope: one DndContext per task so scopes stay independent. */
function SubtaskDnd({
  task,
  handlers,
  onOpenLinks,
  sessionActive,
}: {
  task: TaskData;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const subtaskIds = task.subtasks.map((sub) => sub.id);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = task.subtasks.map((sub) => sub.id);
    const next = applyReorder(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    handlers.onReorder("subtasks", next);
  }

  if (task.subtasks.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
        <ul aria-label={`Subtasks of ${task.title}`}>
          {task.subtasks.map((sub) => (
            <TaskRow
              key={sub.id}
              task={sub}
              depth="subtask"
              handlers={handlers}
              onOpenLinks={onOpenLinks}
              sessionActive={sessionActive}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** Task drag scope: one DndContext per project. */
function TaskDnd({
  project,
  handlers,
  onOpenLinks,
  sessionActive,
}: {
  project: ProjectData;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const taskIds = project.tasks.map((task) => task.id);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = project.tasks.map((task) => task.id);
    const next = applyReorder(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    handlers.onReorder("tasks", next);
  }

  if (project.tasks.length === 0) {
    return <p className="px-3 py-2 text-sm text-[var(--muted)]">No tasks yet.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul aria-label={`Tasks in ${project.name}`}>
          {project.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              depth="task"
              handlers={handlers}
              onOpenLinks={onOpenLinks}
              sessionActive={sessionActive}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function ProjectBlock({
  project,
  collapsed,
  onToggleCollapsed,
  handlers,
  onOpenLinks,
  sessionActive,
}: {
  project: ProjectData;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: project.id });
  const progress = projectProgress(project);
  const [taskDraft, setTaskDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle(transform as never, transition, isDragging)}
      className="rounded-md border border-[var(--line)]"
    >
      <div className={ROW_CLASS}>
        <DragHandle
          activatorRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          label="Drag to reorder project"
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
          aria-expanded={!collapsed}
          className="text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {collapsed ? ">" : "v"}
        </button>
        <EditableTitle
          title={project.name}
          onRename={(name) => handlers.onRenameProject(project.id, name)}
          label={project.name}
          className="text-sm font-medium"
        />
        <ProgressRing percent={progress.percent} label={project.name} />
        <button
          type="button"
          onClick={() => handlers.onStartProject(project.id)}
          disabled={sessionActive}
          aria-label={`Start a session on ${project.name}`}
          title={sessionActive ? "A session is already running" : "Start a session on this project"}
          className={`${ICON_BUTTON} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => onOpenLinks({ ownerType: "project", ownerId: project.id, label: project.name })}
          aria-label={`Links on ${project.name}`}
          title="Links"
          className={ICON_BUTTON}
        >
          ↗ {project.links.length > 0 ? project.links.length : ""}
        </button>
        <button
          type="button"
          onClick={() => setNotesOpen((prev) => !prev)}
          aria-label={`Notes on ${project.name}`}
          aria-expanded={notesOpen}
          title="Project notes"
          className={ICON_BUTTON}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete project "${project.name}" and all of its tasks?`)) {
              handlers.onDeleteProject(project.id);
            }
          }}
          aria-label={`Delete project ${project.name}`}
          className={`${ICON_BUTTON} hover:text-[var(--bad)]`}
        >
          Delete
        </button>
      </div>

      {notesOpen && (
        <div className="px-3 pb-2">
          <ItemNotes
            notes={project.notes}
            snippets={project.snippets}
            ownerLabel={project.name}
            onSave={(notes) => handlers.onUpdateProjectNotes(project.id, notes)}
          />
        </div>
      )}

      {!collapsed && (
        <div className="border-t border-[var(--line)] px-3 py-2">
          <TaskDnd project={project} handlers={handlers} onOpenLinks={onOpenLinks} sessionActive={sessionActive} />
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const title = taskDraft.trim();
              if (title) {
                handlers.onCreateTask(project.id, null, title);
                setTaskDraft("");
              }
            }}
          >
            <input
              type="text"
              value={taskDraft}
              onChange={(event) => setTaskDraft(event.target.value)}
              placeholder="New task"
              aria-label={`New task in ${project.name}`}
              className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
            <button
              type="submit"
              disabled={taskDraft.trim() === ""}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
            >
              Add task
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function ProjectsPanel({
  projects,
  handlers,
  addLinkError,
  sessionActive,
}: {
  projects: ProjectData[];
  handlers: ProjectsPanelHandlers;
  addLinkError: string | null;
  sessionActive: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [newProjectName, setNewProjectName] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [linksOwner, setLinksOwner] = useState<LinkOwner | null>(null);

  useEffect(() => {
    setCollapsedIds(readCollapsedProjects());
  }, []);

  function toggleCollapsed(projectId: string) {
    setCollapsedIds((prev) => {
      const next = prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId];
      persistCollapsedProjects(next);
      return next;
    });
  }

  function onProjectDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = projects.map((project) => project.id);
    const next = applyReorder(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    handlers.onReorder("projects", next);
  }

  const projectIds = projects.map((project) => project.id);

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
            handlers.onCreateProject(name);
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
          disabled={newProjectName.trim() === ""}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
        >
          Add project
        </button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No projects yet. Add one above to get started.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProjectDragEnd}>
          <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {projects.map((project) => (
                <ProjectBlock
                  key={project.id}
                  project={project}
                  collapsed={collapsedIds.includes(project.id)}
                  onToggleCollapsed={() => toggleCollapsed(project.id)}
                  handlers={handlers}
                  onOpenLinks={setLinksOwner}
                  sessionActive={sessionActive}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {linksOwner && (
        <LinksModal
          ownerLabel={linksOwner.label}
          links={
            linksOwner.ownerType === "project"
              ? (projects.find((project) => project.id === linksOwner.ownerId)?.links ?? [])
              : findLinks(projects, linksOwner.ownerId)
          }
          error={addLinkError}
          onClose={() => setLinksOwner(null)}
          onAdd={(name, url) =>
            linksOwner && handlers.onAddLink(linksOwner.ownerType, linksOwner.ownerId, name, url)
          }
          onDelete={handlers.onDeleteLink}
        />
      )}
    </section>
  );
}

/** Find links for a task or subtask anywhere in the tree. */
function findLinks(projects: ProjectData[], ownerId: string) {
  for (const project of projects) {
    for (const task of project.tasks) {
      if (task.id === ownerId) return task.links;
      const sub = task.subtasks.find((item) => item.id === ownerId);
      if (sub) return sub.links;
    }
  }
  return [];
}

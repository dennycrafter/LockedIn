"use client";

// Projects panel (T2, SPEC 8.2, 8.3, 8.7): the full three-level tree.
// Drag reorder via @dnd-kit at three scopes (projects, tasks in a project,
// subtasks in a task), rename inline, tick, delete with undo, links modal per
// item, item notes with dated snippets, progress rings.
//
// UI polish (Oct 2026): rows read as a list, not a wall of buttons. Each row
// keeps its checkbox and title; links and notes show as small indicators
// only when they exist; Start and the "more" menu (Links, Notes, Add
// subtask, Delete) appear on hover or keyboard focus (always on touch).
// Finished items hide behind "Show N done" per project.

import { useEffect, useRef, useState } from "react";
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
import { projectItems, projectProgress } from "@/lib/tree";
import { EditableTitle } from "./editable-title";
import { ChevronIcon, GripIcon, LinkIcon, NoteIcon, PlayIcon, PlusIcon } from "./icons";
import { ItemNotes } from "./item-notes";
import { LinksModal } from "./links-modal";
import { Modal } from "./modal";
import { ProgressRing } from "./progress-ring";
import { BTN_ICON, BTN_PRIMARY, BTN_QUIET, CARD, CARD_TITLE, FIELD_LABEL, INPUT, RowMenu } from "./ui";

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

const HANDLE_CLASS =
  "lockedin-on-hover inline-flex h-8 w-5 shrink-0 cursor-grab select-none touch-none items-center justify-center rounded text-[var(--muted)] hover:text-[var(--fg)]";
const ROW_CLASS = "lockedin-row flex items-center gap-1.5 rounded-md hover:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)] sm:gap-2";
const INDICATOR =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs tabular-nums text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]";
const QUIET_INPUT =
  "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-[var(--fg)] placeholder:text-[var(--muted)] hover:border-[var(--line)] focus:border-[var(--line)] focus:bg-[var(--bg)] focus:outline-none";
const CHECKBOX = "h-4 w-4 shrink-0 accent-[var(--silver)]";
const COLLAPSED_KEY = "lockedin-collapsed-projects";
const SHOW_DONE_KEY = "lockedin-show-done-projects";

function readIds(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persistIds(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Private mode or storage full: the choice just does not persist.
  }
}

function sortableStyle(transform: never, transition: string | undefined, isDragging: boolean): React.CSSProperties {
  return {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    background: isDragging ? "var(--surface-2)" : undefined,
    position: isDragging ? "relative" : undefined,
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
      title="Drag to reorder"
      className={HANDLE_CLASS}
    >
      <GripIcon size={14} />
    </button>
  );
}

/** Links count and a notes mark: shown only when there is something to show. */
function Indicators({
  links,
  hasNotes,
  label,
  onOpenLinks,
  onOpenNotes,
}: {
  links: number;
  hasNotes: boolean;
  label: string;
  onOpenLinks: () => void;
  onOpenNotes: () => void;
}) {
  return (
    <>
      {links > 0 && (
        <button type="button" onClick={onOpenLinks} aria-label={`Links on ${label} (${links})`} title="Links" className={INDICATOR}>
          <LinkIcon size={14} />
          {links}
        </button>
      )}
      {hasNotes && (
        <button type="button" onClick={onOpenNotes} aria-label={`Notes on ${label}`} title="Notes" className={INDICATOR}>
          <NoteIcon size={14} />
        </button>
      )}
    </>
  );
}

interface RowProps {
  task: TaskData;
  depth: "task" | "subtask";
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  /** A session is running, so the SPEC 8.4 one-session rule disables its timer button. */
  sessionActive: boolean;
  /** Finished items stay mounted (drag order needs them) but hide until "Show done". */
  showDone: boolean;
}

function TaskRow({ task, depth, handlers, onOpenLinks, sessionActive, showDone }: RowProps) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesFromMenu, setNotesFromMenu] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSubtask) subtaskInputRef.current?.focus();
  }, [addingSubtask]);

  const openNotes = (fromMenu: boolean) => {
    setNotesFromMenu(fromMenu && task.notes.trim() === "");
    setNotesOpen((prev) => (fromMenu ? true : !prev));
  };

  const hidden = task.done && !showDone;
  const openLinks = () => onOpenLinks({ ownerType: "task", ownerId: task.id, label: task.title });

  return (
    <li ref={setNodeRef} style={sortableStyle(transform as never, transition, isDragging)} hidden={hidden}>
      <div className={`${ROW_CLASS} py-1 pl-0.5 pr-1`}>
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
          className={CHECKBOX}
        />
        <div className="flex min-w-0 flex-1 pl-1">
          <EditableTitle
            title={task.title}
            onRename={(title) => handlers.onRenameTask(task.id, title)}
            label={task.title}
            className={`text-sm ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--fg)]"}`}
          />
        </div>
        <Indicators
          links={task.links.length}
          hasNotes={task.notes.trim() !== "" || task.snippets.length > 0}
          label={task.title}
          onOpenLinks={openLinks}
          onOpenNotes={() => openNotes(false)}
        />
        {!task.done && (
          <button
            type="button"
            onClick={() => handlers.onStartTask(task.id)}
            disabled={sessionActive}
            aria-label={`Start a session on ${task.title}`}
            title={sessionActive ? "A session is already running" : "Start a session on this item"}
            className={`${BTN_ICON} lockedin-on-hover`}
          >
            <PlayIcon size={14} />
          </button>
        )}
        <RowMenu
          className="lockedin-on-hover"
          label={`More actions for ${task.title}`}
          items={[
            { label: "Links", onSelect: openLinks },
            { label: "Notes", onSelect: () => openNotes(true) },
            ...(depth === "task" ? [{ label: "Add subtask", onSelect: () => setAddingSubtask(true) }] : []),
            { label: "Delete", danger: true, onSelect: () => handlers.onDeleteTask(task.id) },
          ]}
        />
      </div>

      {notesOpen && (
        <div className="pb-2 pl-12 pr-2">
          <ItemNotes
            notes={task.notes}
            snippets={task.snippets}
            ownerLabel={task.title}
            startEditing={notesFromMenu}
            onSave={(notes) => handlers.onUpdateTaskNotes(task.id, notes)}
          />
        </div>
      )}

      {depth === "task" && (task.subtasks.length > 0 || addingSubtask) && (
        <div className="pl-4 sm:pl-7">
          <SubtaskDnd
            task={task}
            handlers={handlers}
            onOpenLinks={onOpenLinks}
            sessionActive={sessionActive}
            showDone={showDone}
          />
          {addingSubtask && (
            <form
              className="flex gap-2 py-1 pl-6 pr-1 sm:pl-7"
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
                ref={subtaskInputRef}
                type="text"
                value={subtaskDraft}
                onChange={(event) => setSubtaskDraft(event.target.value)}
                onBlur={() => {
                  if (subtaskDraft.trim() === "") setAddingSubtask(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSubtaskDraft("");
                    setAddingSubtask(false);
                  }
                }}
                placeholder="New subtask, Enter to add"
                aria-label={`New subtask in ${task.title}`}
                className={QUIET_INPUT}
              />
            </form>
          )}
        </div>
      )}
    </li>
  );
}

/** Subtask drag scope: one DndContext per task so scopes stay independent. */
function SubtaskDnd({
  task,
  handlers,
  onOpenLinks,
  sessionActive,
  showDone,
}: {
  task: TaskData;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
  showDone: boolean;
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
              showDone={showDone}
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
  showDone,
}: {
  project: ProjectData;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
  showDone: boolean;
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

  if (project.tasks.length === 0) return null;

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
              showDone={showDone}
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
  showDone,
  onToggleShowDone,
  handlers,
  onOpenLinks,
  sessionActive,
}: {
  project: ProjectData;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  showDone: boolean;
  onToggleShowDone: () => void;
  handlers: ProjectsPanelHandlers;
  onOpenLinks: (owner: LinkOwner) => void;
  sessionActive: boolean;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: project.id });
  const progress = projectProgress(project);
  const doneCount = projectItems(project).filter((item) => item.done).length;
  const [taskDraft, setTaskDraft] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesFromMenu, setNotesFromMenu] = useState(false);
  const openLinks = () => onOpenLinks({ ownerType: "project", ownerId: project.id, label: project.name });
  const openNotes = (fromMenu: boolean) => {
    setNotesFromMenu(fromMenu && project.notes.trim() === "");
    setNotesOpen((prev) => (fromMenu ? true : !prev));
  };

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle(transform as never, transition, isDragging)}
      className="rounded-md border border-[var(--line)] bg-[var(--surface)]"
    >
      <div className={`${ROW_CLASS} rounded-b-none py-1.5 pl-1.5 pr-3 sm:pl-2`}>
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
          className="-ml-1 inline-flex h-8 w-6 shrink-0 items-center justify-center rounded text-[var(--muted)] hover:text-[var(--fg)]"
        >
          <ChevronIcon size={14} className={`transition-transform ${collapsed ? "" : "rotate-90"}`} />
        </button>
        <div className="flex min-w-0 flex-1">
          <EditableTitle
            title={project.name}
            onRename={(name) => handlers.onRenameProject(project.id, name)}
            label={project.name}
            className="text-[15px] font-semibold text-[var(--fg)]"
          />
        </div>
        <Indicators
          links={project.links.length}
          hasNotes={project.notes.trim() !== "" || project.snippets.length > 0}
          label={project.name}
          onOpenLinks={openLinks}
          onOpenNotes={() => openNotes(false)}
        />
        <ProgressRing percent={progress.percent} done={progress.done} total={progress.total} label={project.name} />
        <button
          type="button"
          onClick={() => handlers.onStartProject(project.id)}
          disabled={sessionActive}
          aria-label={`Start a session on ${project.name}`}
          title={sessionActive ? "A session is already running" : "Start a session on this project"}
          className={`${BTN_ICON} lockedin-on-hover max-sm:hidden`}
        >
          <PlayIcon size={14} />
        </button>
        <RowMenu
          className="lockedin-on-hover"
          label={`More actions for ${project.name}`}
          items={[
            { label: "Links", onSelect: openLinks },
            { label: "Project notes", onSelect: () => openNotes(true) },
            { label: "Delete project", danger: true, onSelect: () => handlers.onDeleteProject(project.id) },
          ]}
        />
      </div>

      {notesOpen && (
        <div className="px-3 pb-2 pl-12">
          <ItemNotes
            notes={project.notes}
            snippets={project.snippets}
            ownerLabel={project.name}
            startEditing={notesFromMenu}
            onSave={(notes) => handlers.onUpdateProjectNotes(project.id, notes)}
          />
        </div>
      )}

      {!collapsed && (
        <div className="border-t border-[var(--line)] px-1.5 py-1.5 sm:px-2">
          <TaskDnd
            project={project}
            handlers={handlers}
            onOpenLinks={onOpenLinks}
            sessionActive={sessionActive}
            showDone={showDone}
          />
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <form
              className="flex min-w-[12rem] flex-1"
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
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setTaskDraft("");
                    event.currentTarget.blur();
                  }
                }}
                placeholder="+ Add task"
                aria-label={`New task in ${project.name}`}
                className={QUIET_INPUT}
              />
            </form>
            {doneCount > 0 && (
              <button type="button" onClick={onToggleShowDone} aria-expanded={showDone} className={`${BTN_QUIET} text-[13px]`}>
                {showDone ? "Hide done" : `Show ${doneCount} done`}
              </button>
            )}
          </div>
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
  const [newOpen, setNewOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [showDoneIds, setShowDoneIds] = useState<string[]>([]);
  const [linksOwner, setLinksOwner] = useState<LinkOwner | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    setCollapsedIds(readIds(COLLAPSED_KEY));
    setShowDoneIds(readIds(SHOW_DONE_KEY));
  }, []);

  // Fade the bottom edge only while there is more to scroll to.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const update = () => setMoreBelow(box.scrollHeight - box.scrollTop - box.clientHeight > 4);
    update();
    box.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [projects]);

  function toggleIn(key: string, setter: React.Dispatch<React.SetStateAction<string[]>>, projectId: string) {
    setter((prev) => {
      const next = prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId];
      persistIds(key, next);
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

  const closeNew = () => {
    setNewOpen(false);
    setNewProjectName("");
  };

  const projectIds = projects.map((project) => project.id);

  return (
    <section aria-label="Projects" className={`${CARD} flex min-h-0 flex-col lg:max-h-[78vh]`}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>
          Projects
          {projects.length > 0 && <span className="ml-2 text-sm font-normal text-[var(--muted)]">{projects.length}</span>}
        </h2>
        <button type="button" onClick={() => setNewOpen(true)} className={BTN_QUIET}>
          <PlusIcon size={14} />
          New project
        </button>
      </div>

      {/* On desktop only the project list scrolls; phones scroll the page instead of a box inside it. */}
      <div
        ref={scrollRef}
        className={`-mx-1 min-h-0 flex-1 px-1 lg:overflow-y-auto ${moreBelow ? "lg:lockedin-fade-bottom" : ""}`}
      >
        {projects.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--line)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--fg)]">No projects yet.</p>
            <p className="mt-1 text-[13px] text-[var(--muted)]">A project holds the tasks you start sessions on.</p>
            <button type="button" onClick={() => setNewOpen(true)} className={`${BTN_PRIMARY} mt-4`}>
              Create a project
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProjectDragEnd}>
            <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3 pb-1">
                {projects.map((project) => (
                  <ProjectBlock
                    key={project.id}
                    project={project}
                    collapsed={collapsedIds.includes(project.id)}
                    onToggleCollapsed={() => toggleIn(COLLAPSED_KEY, setCollapsedIds, project.id)}
                    showDone={showDoneIds.includes(project.id)}
                    onToggleShowDone={() => toggleIn(SHOW_DONE_KEY, setShowDoneIds, project.id)}
                    handlers={handlers}
                    onOpenLinks={setLinksOwner}
                    sessionActive={sessionActive}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {newOpen && (
        <Modal
          title="New project"
          onClose={closeNew}
          footer={
            <>
              <button type="button" onClick={closeNew} className={BTN_QUIET}>
                Cancel
              </button>
              <button type="submit" form="new-project-form" disabled={newProjectName.trim() === ""} className={BTN_PRIMARY}>
                Add project
              </button>
            </>
          }
        >
          <form
            id="new-project-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newProjectName.trim();
              if (name) {
                handlers.onCreateProject(name);
                closeNew();
              }
            }}
          >
            <label className={FIELD_LABEL} htmlFor="new-project-name">
              Project name
            </label>
            <input
              id="new-project-name"
              type="text"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="e.g. Job search"
              aria-label="New project name"
              className={INPUT}
            />
          </form>
        </Modal>
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

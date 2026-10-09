"use client";

// Tomorrow's task list panel (SPEC 8.9, SPEC 10 layout): the wind down (T6)
// builds the plan itself; T5 ships the panel shell, the "+" for misc tasks,
// and the misc task rows (tick, delete, drag reorder, start timer). Misc
// tasks never appear in wind down and have no notes or links (SPEC 8.9).
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MiscTaskData } from "@/lib/dashboard-data";
import { applyReorder } from "@/lib/reorder";

const ICON_BUTTON = "shrink-0 px-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]";

function MiscTaskRow({
  task,
  startDisabled,
  onToggle,
  onDelete,
  onStart,
}: {
  task: MiscTaskData;
  startDisabled: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        background: isDragging ? "var(--surface-2)" : undefined,
      }}
      className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder misc task: ${task.title}`}
        className="cursor-grab select-none touch-none px-1 text-[var(--muted)] hover:text-[var(--fg)]"
      >
        ⠿
      </button>
      <input
        type="checkbox"
        checked={task.done}
        onChange={(event) => onToggle(task.id, event.target.checked)}
        aria-label={`Tick misc task: ${task.title}`}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--fg)]"}`}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={() => onStart(task.id)}
        disabled={startDisabled}
        aria-label={`Start a timer on misc task: ${task.title}`}
        className={`${ICON_BUTTON} disabled:opacity-40`}
      >
        ▶
      </button>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete misc task: ${task.title}`}
        className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--bad)]"
      >
        Delete
      </button>
    </li>
  );
}

export function MiscTasksPanel({
  miscTasks,
  startDisabled,
  onCreate,
  onToggle,
  onDelete,
  onReorder,
  onStart,
}: {
  miscTasks: MiscTaskData[];
  /** True while a session runs: only one session at a time (SPEC 8.4). */
  startDisabled: boolean;
  onCreate: (title: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onStart: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <section aria-label="Tomorrow's task list" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--fg)]">Tomorrow&apos;s task list</h2>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          aria-label="Add a misc task"
          aria-expanded={adding}
          className="rounded-md border border-[var(--line)] px-2 py-0.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          +
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">Wind down builds this list. Use + for misc tasks.</p>

      {adding && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const title = draft.trim();
            if (title) {
              onCreate(title);
              setDraft("");
              setAdding(false);
            }
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="One line, e.g. post the letter"
            aria-label="New misc task"
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={draft.trim() === ""}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      {/* The plan itself is drawn here by the wind down ticket (T6). */}
      <p className="mt-3 text-xs text-[var(--muted)]">No plan yet. Wind down builds this list.</p>

      {miscTasks.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Misc tasks</h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const from = miscTasks.findIndex((t) => t.id === active.id);
              const to = miscTasks.findIndex((t) => t.id === over.id);
              const next = applyReorder(miscTasks, from, to);
              onReorder(next.map((t) => t.id));
            }}
          >
            <SortableContext items={miscTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="mt-1 rounded-md border border-[var(--line)]">
                {miscTasks.map((task) => (
                  <MiscTaskRow
                    key={task.id}
                    task={task}
                    startDisabled={startDisabled}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onStart={onStart}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </section>
  );
}

"use client";

// Misc task rows (SPEC 8.9): one-line items with tick, delete, drag reorder
// and a start timer. Misc tasks never appear in wind down and have no notes
// or links. Since the UI polish (Oct 2026) they live inside the plan card
// (PlanPanel) under a small "Misc" label instead of their own card.
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
import { GripIcon, PlayIcon, TrashIcon } from "./icons";
import { BTN_ICON } from "./ui";

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
        position: isDragging ? "relative" : undefined,
      }}
      className="lockedin-row flex items-center gap-2 border-b border-[var(--line)] py-1 pl-1 pr-1 last:border-b-0"
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder misc task: ${task.title}`}
        className="lockedin-on-hover inline-flex h-8 w-5 shrink-0 cursor-grab select-none touch-none items-center justify-center text-[var(--muted)] hover:text-[var(--fg)]"
      >
        <GripIcon size={14} />
      </button>
      <input
        type="checkbox"
        checked={task.done}
        onChange={(event) => onToggle(task.id, event.target.checked)}
        aria-label={`Tick misc task: ${task.title}`}
        className="h-4 w-4 shrink-0 accent-[var(--silver)]"
      />
      <span
        className={`min-w-0 flex-1 break-words pl-1 text-sm ${task.done ? "text-[var(--muted)] line-through" : "text-[var(--fg)]"}`}
      >
        {task.title}
      </span>
      {!task.done && (
        <button
          type="button"
          onClick={() => onStart(task.id)}
          disabled={startDisabled}
          aria-label={`Start a timer on misc task: ${task.title}`}
          className={`${BTN_ICON} lockedin-on-hover`}
        >
          <PlayIcon size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label={`Delete misc task: ${task.title}`}
        title="Delete"
        className={`${BTN_ICON} lockedin-on-hover hover:text-[var(--bad)]`}
      >
        <TrashIcon size={14} />
      </button>
    </li>
  );
}

export function MiscTaskList({
  miscTasks,
  startDisabled,
  onToggle,
  onDelete,
  onReorder,
  onStart,
}: {
  miscTasks: MiscTaskData[];
  /** True while a session runs: only one session at a time (SPEC 8.4). */
  startDisabled: boolean;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onStart: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (miscTasks.length === 0) return null;

  return (
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
        <ul aria-label="Misc tasks">
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
  );
}

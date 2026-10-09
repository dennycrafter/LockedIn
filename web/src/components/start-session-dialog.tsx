"use client";

// Start session dialog (SPEC 8.4): pick project > task (both optional), a
// duration, and a lock mode. "Start session" is the one accent action here.
import { useMemo, useState } from "react";
import type { ProjectData } from "@/lib/dashboard-data";
import type { LockMode } from "@/lib/extension-session";
import { Modal } from "./modal";

const DURATION_CHOICES = [15, 25, 45, 60, 90];
const LOCK_CHOICES: LockMode[] = ["none", "soft", "hard"];

export function StartSessionDialog({
  projects,
  miscTask,
  onClose,
  onStart,
}: {
  projects: ProjectData[];
  /** Set when the timer was started from a misc task row (SPEC 8.9). */
  miscTask?: { id: string; title: string } | null;
  onClose: () => void;
  onStart: (spec: {
    projectId: string | null;
    taskId: string | null;
    miscTaskId: string | null;
    minutes: number;
    lockMode: LockMode;
  }) => void;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [minutes, setMinutes] = useState<number>(25);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [lockMode, setLockMode] = useState<LockMode>("hard");

  const tasks = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.tasks : [];
  }, [projects, projectId]);

  const resolvedMinutes = customMinutes.trim() !== "" ? Number(customMinutes) : minutes;
  const minutesValid = Number.isInteger(resolvedMinutes) && resolvedMinutes >= 5 && resolvedMinutes <= 180;

  return (
    <Modal title="Start a session" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!minutesValid) return;
          onStart({
            projectId: miscTask ? null : projectId || null,
            taskId: miscTask ? null : taskId || null,
            miscTaskId: miscTask ? miscTask.id : null,
            minutes: resolvedMinutes,
            lockMode,
          });
        }}
      >
        {miscTask ? (
          <p className="text-sm text-[var(--fg)]">
            Timer on: <span className="font-medium">{miscTask.title}</span> (misc task)
          </p>
        ) : (
          <>
            <label className="block text-sm">
          <span className="text-[var(--muted)]">Project (optional)</span>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setTaskId("");
            }}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Task (optional)</span>
          <select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            disabled={tasks.length === 0}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] disabled:opacity-50"
          >
            <option value="">No task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
          </>
        )}

        <fieldset>
          <legend className="text-sm text-[var(--muted)]">Minutes</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {DURATION_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => {
                  setMinutes(choice);
                  setCustomMinutes("");
                }}
                aria-pressed={!customMinutes && minutes === choice}
                className="rounded-md border px-3 py-1.5 text-sm"
                style={
                  !customMinutes && minutes === choice
                    ? { borderColor: "var(--accent-ink)", color: "var(--accent-ink)" }
                    : { borderColor: "var(--line)", color: "var(--fg)" }
                }
              >
                {choice}
              </button>
            ))}
            <input
              type="number"
              min={5}
              max={180}
              placeholder="Custom 5-180"
              aria-label="Custom minutes between 5 and 180"
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              className="w-28 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm text-[var(--muted)]">Lock</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {LOCK_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setLockMode(choice)}
                aria-pressed={lockMode === choice}
                className="rounded-md border px-3 py-1.5 text-sm capitalize"
                style={
                  lockMode === choice
                    ? { borderColor: "var(--accent-ink)", color: "var(--accent-ink)" }
                    : { borderColor: "var(--line)", color: "var(--fg)" }
                }
              >
                {choice}
              </button>
            ))}
          </div>
        </fieldset>

        {!minutesValid && customMinutes !== "" && (
          <p className="text-sm text-[var(--bad)]">Custom minutes must be a whole number from 5 to 180.</p>
        )}

        <button
          type="submit"
          disabled={!minutesValid}
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          Start session
        </button>
      </form>
    </Modal>
  );
}

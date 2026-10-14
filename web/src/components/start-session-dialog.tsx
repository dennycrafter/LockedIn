"use client";

// Start session dialog (SPEC 8.4): pick project > task (both optional), a
// duration, and a lock mode. "Start session" is the one accent action here.
// Remembers the last duration and lock mode per device, and can arrive with a
// pre-selected project/task when opened from a row timer button.
import { useEffect, useMemo, useState } from "react";
import type { ProjectData } from "@/lib/dashboard-data";
import type { LockMode } from "@/lib/extension-session";
import { loadTimerPrefs, saveTimerPrefs } from "@/lib/timer-prefs";
import { Modal } from "./modal";
import { BTN_PRIMARY, FIELD_LABEL, INPUT_BOX, SELECT, Segmented } from "./ui";

const DURATION_CHOICES = [15, 25, 45, 60, 90];
const LOCK_CHOICES: Array<{ value: LockMode; label: string; help: string }> = [
  { value: "none", label: "None", help: "Timer only. Nothing is blocked." },
  { value: "soft", label: "Soft", help: "Blocks your sites. You can end early after a 2 minute wait." },
  { value: "hard", label: "Hard", help: "Blocks your sites until the timer runs out. No ending early." },
];

export function StartSessionDialog({
  projects,
  initialProjectId = null,
  initialTaskId = null,
  miscTask,
  onClose,
  onStart,
}: {
  projects: ProjectData[];
  initialProjectId?: string | null;
  initialTaskId?: string | null;
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
  const prefs = useMemo(loadTimerPrefs, []);
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [taskId, setTaskId] = useState<string>(initialTaskId ?? "");
  const [minutes, setMinutes] = useState<number>(prefs.minutes ?? 25);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [lockMode, setLockMode] = useState<LockMode>(prefs.lockMode ?? "hard");

  // A pre-selected task whose project is not in the tree (deleted mid-open)
  // would leave the selects disagreeing; clear the task in that case.
  useEffect(() => {
    if (initialTaskId && !projects.some((project) => project.id === initialProjectId)) {
      setTaskId("");
    }
    // Runs once on open; the dialog is unmounted on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tasks and their subtasks, so a session started from a subtask row shows
  // that subtask selected instead of a blank "No task".
  const tasks = useMemo(() => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return [];
    return project.tasks.flatMap((task) => [
      { id: task.id, title: task.title, done: task.done },
      ...task.subtasks.map((sub) => ({ id: sub.id, title: `${task.title} > ${sub.title}`, done: sub.done })),
    ]);
  }, [projects, projectId]);

  const resolvedMinutes = customMinutes.trim() !== "" ? Number(customMinutes) : minutes;
  const minutesValid = Number.isInteger(resolvedMinutes) && resolvedMinutes >= 5 && resolvedMinutes <= 180;

  const lockHelp = LOCK_CHOICES.find((choice) => choice.value === lockMode)?.help ?? "";

  return (
    <Modal
      title="Start a session"
      onClose={onClose}
      footer={
        <button type="submit" form="start-session-form" disabled={!minutesValid} className={`${BTN_PRIMARY} w-full`}>
          Start {resolvedMinutes > 0 && minutesValid ? `${resolvedMinutes} minutes` : "session"}
        </button>
      }
    >
      <form
        id="start-session-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!minutesValid) return;
          saveTimerPrefs({ minutes: resolvedMinutes, lockMode });
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
          <p className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]">
            <span className="text-[var(--muted)]">Working on </span>
            <span className="font-medium">{miscTask.title}</span>
          </p>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className={FIELD_LABEL} htmlFor="start-project">
                Project
              </label>
              <select
                id="start-project"
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setTaskId("");
                }}
                className={SELECT}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="start-task">
                Task
              </label>
              <select
                id="start-task"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                disabled={tasks.length === 0}
                className={`${SELECT} disabled:opacity-50`}
              >
                <option value="">{tasks.length === 0 ? "Pick a project first" : "No task"}</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.done ? `${task.title} (done)` : task.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <fieldset>
          <legend className={FIELD_LABEL}>Minutes</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Minutes"
              value={customMinutes.trim() === "" ? minutes : undefined}
              onChange={(choice) => {
                setMinutes(choice);
                setCustomMinutes("");
              }}
              options={DURATION_CHOICES.map((choice) => ({ value: choice, label: String(choice) }))}
            />
            <input
              type="number"
              min={5}
              max={180}
              placeholder="Other"
              aria-label="Custom minutes between 5 and 180"
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              className={`${INPUT_BOX} w-24 py-1.5`}
            />
          </div>
          {!minutesValid && customMinutes !== "" && (
            <p className="mt-2 text-[13px] text-[var(--bad)]">Pick a whole number from 5 to 180.</p>
          )}
        </fieldset>

        <fieldset>
          <legend className={FIELD_LABEL}>Lock</legend>
          <Segmented
            label="Lock"
            className="flex w-full"
            value={lockMode}
            onChange={setLockMode}
            options={LOCK_CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))}
          />
          <p className="mt-2 text-[13px] text-[var(--muted)]">{lockHelp}</p>
        </fieldset>
      </form>
    </Modal>
  );
}

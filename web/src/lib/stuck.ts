// "I'm stuck, help me start" (SPEC 8.14, T7b): pure logic for the scripted
// check-in modal. The suggestion is deterministic local logic on purpose, so
// nothing here calls /api/ai. The later AI mode (T8-UI) can slot in without
// rework: StuckCheckIn is serializable (it can be sent to /api/ai as context)
// and the modal renders whatever StuckSuggestion it is given, whichever
// producer made it.

import type { ProjectData } from "./dashboard-data";

/** Answer to "What have you already tried?"; null = question left untouched. */
export type TriedLevel = "little" | "some" | "everything";

/** Chip labels for the tried question, keyed by TriedLevel. */
export const TRIED_LABELS: Record<TriedLevel, string> = {
  little: "Not much yet",
  some: "A few things",
  everything: "Everything I can think of",
};

export interface StuckCheckIn {
  /** "What have you worked on so far?" Empty text means no work yet. */
  workedOn: string;
  /** "Where exactly are you stuck?" Context only; never changes the branch. */
  stuckWhere: string;
  /** Chip answer; untouched counts as "little". */
  tried: TriedLevel | null;
}

/** Fresh check-in: every answer empty. Routes to the start-small suggestion. */
export const EMPTY_CHECK_IN: StuckCheckIn = { workedOn: "", stuckWhere: "", tried: null };

export type StuckSuggestionKind = "start" | "break_down" | "park";

export interface StuckSuggestion {
  kind: StuckSuggestionKind;
  headline: string;
  detail: string;
}

/**
 * The deterministic suggestion (T7b scope):
 * - tried everything -> park it as an open loop (most specific signal wins),
 * - else any work done -> break the task into a smaller next step,
 * - else (including the empty-answers default) -> just start a 5 minute mini
 *   session.
 */
export function suggestStuckHelp(checkIn: StuckCheckIn): StuckSuggestion {
  if (checkIn.tried === "everything") {
    return {
      kind: "park",
      headline: "Park it and come back fresh",
      detail:
        "You have tried everything you can think of for now. Write the loop down so your brain can put it down, then come back to it with fresh eyes.",
    };
  }
  if (checkIn.workedOn.trim() !== "") {
    return {
      kind: "break_down",
      headline: "Shrink it to one smaller next step",
      detail:
        "You have already put work in, so the wall is specific. Name the smallest next step, add it as a subtask, then give it five minutes.",
    };
  }
  return {
    kind: "start",
    headline: "Start a 5 minute mini session",
    detail:
      "You have not gotten into the work yet, and that is the hardest part. Five focused minutes breaks the seal, and you can stop after.",
  };
}

/** Text for the parked open loop, built from whatever the check-in captured. */
export function openLoopText(checkIn: StuckCheckIn, taskTitle: string | null): string {
  const where = checkIn.stuckWhere.trim();
  const subject = taskTitle ? `Stuck on "${taskTitle}"` : "Stuck";
  return where === "" ? subject : `${subject}: ${where}`;
}

/**
 * One pickable stuck item: an undone task or subtask. topTaskId is the
 * top-level task every action hangs off: the session handoff pre-targets it
 * in the start dialog and the subtask quick-add creates its child (a subtask
 * of a subtask is not allowed, SPEC 8.2).
 */
export interface StuckTaskOption {
  id: string;
  title: string;
  /** Breadcrumb shown in the picker, e.g. "Launch > Write intro". */
  label: string;
  kind: "task" | "subtask";
  projectId: string;
  topTaskId: string;
}

/** Undone tasks and subtasks in tree order; done items are never offered. */
export function stuckTaskOptions(projects: ProjectData[]): StuckTaskOption[] {
  const options: StuckTaskOption[] = [];
  for (const project of projects) {
    for (const task of project.tasks) {
      if (!task.done) {
        options.push({
          id: task.id,
          title: task.title,
          label: `${project.name} > ${task.title}`,
          kind: "task",
          projectId: project.id,
          topTaskId: task.id,
        });
      }
      for (const sub of task.subtasks) {
        if (!sub.done) {
          options.push({
            id: sub.id,
            title: sub.title,
            label: `${project.name} > ${task.title} > ${sub.title}`,
            kind: "subtask",
            projectId: project.id,
            topTaskId: task.id,
          });
        }
      }
    }
  }
  return options;
}

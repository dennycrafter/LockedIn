// State machine for the wind-down modal (SPEC 8.12). Pure on purpose: step
// flow, skip-to-planning, plan-list edits, draft persistence and the save
// payload are all testable without a DOM. The component holds the DOM and the
// fetches; drafts persist in localStorage under the wind-down anchor date so
// X closing keeps progress until the modal is reopened the same day.

export type WindDownStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const WIND_DOWN_LAST_STEP: WindDownStep = 8;
/** "Skip to planning tomorrow" jumps here (SPEC 8.12 first screen). */
export const WIND_DOWN_PLANNING_STEP: WindDownStep = 5;
const MAX_PLANNED = 50;

export interface WindDownReviewAnswers {
  doneToday: string;
  finishedGoal: boolean | null;
  bestUse: boolean | null;
  bestUseNote: string;
}

/** One entry in tomorrow's ordered plan (SPEC 8.12 step 7). */
export type PlannedEntry =
  | { kind: "existing"; taskId: string; label: string }
  | { kind: "new"; projectId: string | null; projectName: string; label: string };

export interface WindDownDraft {
  step: WindDownStep;
  review: WindDownReviewAnswers;
  /** taskId -> "Anything to remember about this?" text (step 4). */
  recapAnswers: Record<string, string>;
  startTime: string;
  location: string;
  planned: PlannedEntry[];
  // Set once the owner reaches the review/recap steps; a planning-only run
  // (skip from step 0) never sets them, so saving cannot overwrite a review
  // the owner did not touch this run.
  reviewVisited: boolean;
  recapsVisited: boolean;
}

export interface WindDownTaskTime {
  taskId: string;
  label: string;
  minutes: number;
}

export interface WindDownPickerSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface WindDownPickerTask {
  id: string;
  title: string;
  done: boolean;
  subtasks: WindDownPickerSubtask[];
}

export interface WindDownPickerProject {
  id: string;
  name: string;
  tasks: WindDownPickerTask[];
}

export interface WindDownTaskLink {
  ownerId: string;
  name: string;
  url: string;
}

export interface WindDownGetPayload {
  anchorDateKey: string;
  planDateKey: string;
  review: WindDownReviewAnswers | null;
  plan: {
    startTime: string;
    location: string;
    prepped: boolean;
    tasks: Array<{ taskId: string; title: string; position: number }>;
  } | null;
  /** Existing wind-down snippet texts for the anchor day, so re-opening shows saved answers. */
  recaps: Array<{ taskId: string; text: string }>;
  taskTimes: WindDownTaskTime[];
  projects: WindDownPickerProject[];
  taskLinks: WindDownTaskLink[];
  settings: { displayName: string; windDownTime: string };
}

export type WindDownGetResponse = { ok: true; payload: WindDownGetPayload } | { ok: false; error: string };

export type WindDownSaveTaskInput =
  | { kind: "existing"; taskId: string }
  | { kind: "new"; projectId: string | null; projectName: string; taskTitle: string };

export interface WindDownSavePayload {
  review: WindDownReviewAnswers | null;
  recaps: Array<{ taskId: string; text: string }> | null;
  planning: { startTime: string; location: string; tasks: WindDownSaveTaskInput[] } | null;
  prepped: boolean;
}

export type WindDownSaveResponse =
  | { ok: true; anchorDateKey: string; planDateKey: string }
  | { ok: false; error: string };

export type WindDownModalStatus = "closed" | "loading" | "error" | "ready" | "saving";

export interface WindDownModalState {
  status: WindDownModalStatus;
  loadError: string | null;
  saveError: string | null;
  toast: string | null;
  payload: WindDownGetPayload | null;
  draft: WindDownDraft;
}

export type WindDownModalEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "load-success"; payload: WindDownGetPayload; localDraft: WindDownDraft | null }
  | { type: "load-failure"; error: string }
  | { type: "choose-full" }
  | { type: "choose-planning" }
  | { type: "back" }
  | { type: "next" }
  | { type: "set-done-today"; value: string }
  | { type: "set-finished-goal"; value: boolean | null }
  | { type: "set-best-use"; value: boolean | null }
  | { type: "set-best-use-note"; value: string }
  | { type: "set-recap"; taskId: string; value: string }
  | { type: "set-start-time"; value: string }
  | { type: "set-location"; value: string }
  | { type: "add-planned"; entry: PlannedEntry }
  | { type: "remove-planned"; index: number }
  | { type: "move-planned"; index: number; direction: -1 | 1 }
  | { type: "save-start" }
  | { type: "save-success"; name: string }
  | { type: "save-failure"; error: string }
  | { type: "toast-hidden" };

export function freshDraft(): WindDownDraft {
  return {
    step: 0,
    review: { doneToday: "", finishedGoal: null, bestUse: null, bestUseNote: "" },
    recapAnswers: {},
    startTime: "",
    location: "",
    planned: [],
    reviewVisited: false,
    recapsVisited: false,
  };
}

/** True when the draft holds any owner input, so server data must not clobber it. */
export function draftHasProgress(draft: WindDownDraft): boolean {
  return (
    draft.step !== 0 ||
    draft.review.doneToday.trim() !== "" ||
    draft.review.finishedGoal !== null ||
    draft.review.bestUse !== null ||
    draft.review.bestUseNote.trim() !== "" ||
    Object.values(draft.recapAnswers).some((text) => text.trim() !== "") ||
    draft.startTime.trim() !== "" ||
    draft.location.trim() !== "" ||
    draft.planned.length > 0
  );
}

/** Server-prefilled draft, used when there is no local progress for the day. */
export function prefillDraft(payload: WindDownGetPayload): WindDownDraft {
  const draft = freshDraft();
  if (payload.review) {
    draft.review = { ...payload.review };
  }
  for (const recap of payload.recaps) {
    draft.recapAnswers[recap.taskId] = recap.text;
  }
  if (payload.plan) {
    draft.startTime = payload.plan.startTime;
    draft.location = payload.plan.location;
    draft.planned = payload.plan.tasks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((task) => ({ kind: "existing" as const, taskId: task.taskId, label: task.title }));
  }
  return draft;
}

/** POST body for the end-of-flow save. Sections the owner never visited stay null. */
export function buildSavePayload(draft: WindDownDraft): WindDownSavePayload {
  const recaps = Object.entries(draft.recapAnswers)
    .map(([taskId, text]) => ({ taskId, text: text.trim() }))
    .filter((recap) => recap.text !== "");
  return {
    review: draft.reviewVisited
      ? {
          doneToday: draft.review.doneToday.trim(),
          finishedGoal: draft.review.finishedGoal,
          bestUse: draft.review.bestUse,
          bestUseNote: draft.review.bestUseNote.trim(),
        }
      : null,
    recaps: draft.recapsVisited ? recaps : null,
    planning: {
      startTime: draft.startTime.trim(),
      location: draft.location.trim(),
      tasks: draft.planned.map((entry) =>
        entry.kind === "existing"
          ? { kind: "existing" as const, taskId: entry.taskId }
          : {
              kind: "new" as const,
              projectId: entry.projectId,
              projectName: entry.projectName,
              taskTitle: entry.label,
            },
      ),
    },
    prepped: true,
  };
}

const DRAFT_VERSION = 1;

export function draftStorageKey(anchorDateKey: string): string {
  return `lockedin-wind-down-${anchorDateKey}`;
}

export function serializeDraft(draft: WindDownDraft): string {
  return JSON.stringify({ version: DRAFT_VERSION, draft });
}

/** Parse a stored draft; null when missing, corrupt, or from another shape. */
export function parseDraft(raw: string | null): WindDownDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as { version?: unknown; draft?: unknown };
  if (record.version !== DRAFT_VERSION || typeof record.draft !== "object" || record.draft === null) return null;
  const draft = record.draft as Partial<WindDownDraft>;
  const step = draft.step;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > WIND_DOWN_LAST_STEP) return null;
  if (!draft.review || typeof draft.startTime !== "string" || typeof draft.location !== "string") return null;
  if (typeof draft.reviewVisited !== "boolean" || typeof draft.recapsVisited !== "boolean") return null;
  if (!isPlainStringRecord(draft.recapAnswers) || !Array.isArray(draft.planned)) return null;
  for (const entry of draft.planned) {
    if (typeof entry !== "object" || entry === null) return null;
    const candidate = entry as PlannedEntry;
    if (candidate.kind === "existing") {
      if (typeof candidate.taskId !== "string" || typeof candidate.label !== "string") return null;
    } else if (candidate.kind === "new") {
      if (typeof candidate.label !== "string" || typeof candidate.projectName !== "string") return null;
      if (candidate.projectId !== null && typeof candidate.projectId !== "string") return null;
    } else {
      return null;
    }
  }
  return {
    step,
    review: {
      doneToday: draft.review.doneToday,
      finishedGoal: typeof draft.review.finishedGoal === "boolean" ? draft.review.finishedGoal : null,
      bestUse: typeof draft.review.bestUse === "boolean" ? draft.review.bestUse : null,
      bestUseNote: typeof draft.review.bestUseNote === "string" ? draft.review.bestUseNote : "",
    },
    recapAnswers: draft.recapAnswers,
    startTime: draft.startTime,
    location: draft.location,
    planned: draft.planned,
    reviewVisited: draft.reviewVisited,
    recapsVisited: draft.recapsVisited,
  };
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function withStep(draft: WindDownDraft, step: WindDownStep): WindDownDraft {
  return {
    ...draft,
    step,
    // Marking visits on navigation is what makes a planning-only save safe.
    reviewVisited: draft.reviewVisited || (step >= 1 && step <= 3),
    recapsVisited: draft.recapsVisited || step === 4,
  };
}

export function windDownModalInitialState(): WindDownModalState {
  return { status: "closed", loadError: null, saveError: null, toast: null, payload: null, draft: freshDraft() };
}

export function windDownModalReducer(state: WindDownModalState, event: WindDownModalEvent): WindDownModalState {
  switch (event.type) {
    case "open":
      return { ...windDownModalInitialState(), status: "loading" };
    case "close":
      return { ...state, status: "closed" };
    case "load-success":
      return {
        ...state,
        status: "ready",
        loadError: null,
        payload: event.payload,
        // Local progress wins over server data for the same wind-down day.
        draft: event.localDraft && draftHasProgress(event.localDraft) ? event.localDraft : prefillDraft(event.payload),
      };
    case "load-failure":
      return { ...state, status: "error", loadError: event.error };
    case "choose-full":
      return { ...state, draft: withStep(state.draft, 1) };
    case "choose-planning":
      return { ...state, draft: withStep(state.draft, WIND_DOWN_PLANNING_STEP) };
    case "back": {
      if (state.draft.step <= 0) return state;
      return { ...state, draft: withStep(state.draft, (state.draft.step - 1) as WindDownStep) };
    }
    case "next": {
      if (state.draft.step >= WIND_DOWN_LAST_STEP) return state;
      return { ...state, draft: withStep(state.draft, (state.draft.step + 1) as WindDownStep) };
    }
    case "set-done-today":
      return { ...state, draft: { ...state.draft, review: { ...state.draft.review, doneToday: event.value } } };
    case "set-finished-goal":
      return { ...state, draft: { ...state.draft, review: { ...state.draft.review, finishedGoal: event.value } } };
    case "set-best-use":
      return { ...state, draft: { ...state.draft, review: { ...state.draft.review, bestUse: event.value } } };
    case "set-best-use-note":
      return { ...state, draft: { ...state.draft, review: { ...state.draft.review, bestUseNote: event.value } } };
    case "set-recap":
      return {
        ...state,
        draft: { ...state.draft, recapAnswers: { ...state.draft.recapAnswers, [event.taskId]: event.value } },
      };
    case "set-start-time":
      return { ...state, draft: { ...state.draft, startTime: event.value } };
    case "set-location":
      return { ...state, draft: { ...state.draft, location: event.value } };
    case "add-planned": {
      if (state.draft.planned.length >= MAX_PLANNED) return state;
      return { ...state, draft: { ...state.draft, planned: [...state.draft.planned, event.entry] } };
    }
    case "remove-planned":
      return {
        ...state,
        draft: { ...state.draft, planned: state.draft.planned.filter((_, index) => index !== event.index) },
      };
    case "move-planned": {
      const from = event.index;
      const to = from + event.direction;
      if (from < 0 || to < 0 || to >= state.draft.planned.length) return state;
      const planned = state.draft.planned.slice();
      const [moved] = planned.splice(from, 1);
      planned.splice(to, 0, moved);
      return { ...state, draft: { ...state.draft, planned } };
    }
    case "save-start":
      return { ...state, status: "saving", saveError: null };
    case "save-success":
      // SPEC 8.12: "Ready for tomorrow" closes with "See you tomorrow, {name}."
      return { ...state, status: "closed", saveError: null, toast: `See you tomorrow, ${event.name}.` };
    case "save-failure":
      // Design rule: stay open on error so nothing the owner typed is lost.
      return { ...state, status: "ready", saveError: event.error };
    case "toast-hidden":
      return { ...state, toast: null };
  }
}

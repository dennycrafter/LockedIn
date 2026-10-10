"use client";

// Wind-down modal (SPEC 8.12): opener button plus the eight-step floating
// window. Data comes from GET /api/wind-down, the final button POSTs the
// draft. Step flow, drafts and the save payload live in lib/wind-down-state;
// the Chicago day keys and the after-midnight rule live in lib/wind-down-time.

import { useEffect, useReducer, useState } from "react";
import {
  buildSavePayload,
  draftStorageKey,
  parseDraft,
  serializeDraft,
  windDownModalInitialState,
  windDownModalReducer,
  type PlannedEntry,
  type WindDownGetResponse,
  type WindDownSaveResponse,
} from "@/lib/wind-down-state";

const NEW_PROJECT = "__new__";

function ChoiceButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active === true}
      onClick={onClick}
      className="rounded-md border px-4 py-2 text-sm"
      style={{
        borderColor: active ? "var(--muted)" : "var(--line)",
        color: active === false ? "var(--muted)" : "var(--fg)",
        background: active ? "var(--surface-2)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

/** List label for a planned entry: existing ones carry a full path, new ones get the project prefixed. */
function displayLabel(entry: PlannedEntry): string {
  if (entry.kind === "existing") return entry.label;
  return entry.projectName !== "" ? `${entry.projectName} > ${entry.label}` : entry.label;
}

const selectClass =
  "mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]";
const inputClass =
  "mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]";

export default function WindDownSection() {
  const [state, dispatch] = useReducer(windDownModalReducer, undefined, windDownModalInitialState);
  const open = state.status !== "closed";
  const { draft, payload } = state;

  // Step 7 picker state is transient UI, so it stays here rather than in the
  // persisted draft.
  const [existingMode, setExistingMode] = useState(true);
  const [pickerProjectId, setPickerProjectId] = useState("");
  const [pickerTaskId, setPickerTaskId] = useState("");
  const [pickerSubtaskId, setPickerSubtaskId] = useState("");
  const [newProjectChoice, setNewProjectChoice] = useState(NEW_PROJECT);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Load context + any saved local draft whenever the modal opens. The local
  // draft wins so closing mid-flow never loses the owner's answers.
  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/wind-down", { cache: "no-store" });
        const body = (await response.json()) as WindDownGetResponse;
        if (cancelled) return;
        if (response.ok && body.ok) {
          const stored = parseDraft(window.localStorage.getItem(draftStorageKey(body.payload.anchorDateKey)));
          dispatch({ type: "load-success", payload: body.payload, localDraft: stored });
        } else {
          dispatch({ type: "load-failure", error: body.ok ? `Loading failed with HTTP ${response.status}` : body.error });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: "load-failure", error: error instanceof Error ? error.message : "Could not load wind down" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  // Persist the draft under the anchor date so progress survives an X close
  // until the modal is reopened the same day (SPEC 8.12).
  useEffect(() => {
    if (state.status !== "ready" || !payload) return;
    try {
      window.localStorage.setItem(draftStorageKey(payload.anchorDateKey), serializeDraft(draft));
    } catch {
      // Blocked storage: the flow still works, it just will not resume.
    }
  }, [state.status, payload, draft]);

  // SPEC section 10: Escape closes every modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "close" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: "toast-hidden" }), 4000);
    return () => clearTimeout(timer);
  }, [state.toast]);

  async function save() {
    dispatch({ type: "save-start" });
    try {
      const response = await fetch("/api/wind-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload(draft)),
      });
      const body = (await response.json()) as WindDownSaveResponse;
      if (response.ok && body.ok) {
        if (payload) {
          try {
            window.localStorage.removeItem(draftStorageKey(payload.anchorDateKey));
          } catch {
            // Storage unavailable: the server copy is saved either way.
          }
        }
        dispatch({ type: "save-success", name: payload?.settings.displayName ?? "Boss" });
      } else {
        dispatch({ type: "save-failure", error: body.ok ? `Saving failed with HTTP ${response.status}` : body.error });
      }
    } catch (error) {
      dispatch({
        type: "save-failure",
        error: error instanceof Error ? error.message : "Could not reach the server",
      });
    }
  }

  function addExisting() {
    const project = payload?.projects.find((candidate) => candidate.id === pickerProjectId);
    const task = project?.tasks.find((candidate) => candidate.id === pickerTaskId);
    if (!project || !task) return;
    const subtask = task.subtasks.find((candidate) => candidate.id === pickerSubtaskId);
    const target = subtask ?? task;
    const label = [project.name, task.title, subtask?.title].filter(Boolean).join(" > ");
    dispatch({ type: "add-planned", entry: { kind: "existing", taskId: target.id, label } });
    setPickerTaskId("");
    setPickerSubtaskId("");
  }

  function addNew() {
    const title = newTaskTitle.trim();
    if (title === "") return;
    if (newProjectChoice === NEW_PROJECT) {
      const name = newProjectName.trim();
      if (name === "") return;
      dispatch({ type: "add-planned", entry: { kind: "new", projectId: null, projectName: name, label: title } });
    } else {
      const name = payload?.projects.find((candidate) => candidate.id === newProjectChoice)?.name ?? "";
      dispatch({ type: "add-planned", entry: { kind: "new", projectId: newProjectChoice, projectName: name, label: title } });
    }
    setNewTaskTitle("");
  }

  function openLinks(taskId: string) {
    const links = (payload?.taskLinks ?? []).filter((link) => link.ownerId === taskId);
    for (const link of links) window.open(link.url, "_blank", "noopener");
  }

  const pickerProject = payload?.projects.find((candidate) => candidate.id === pickerProjectId);
  const pickerTask = pickerProject?.tasks.find((candidate) => candidate.id === pickerTaskId);
  const isReady = state.status === "ready";
  const isSaving = state.status === "saving";

  let body: React.ReactNode = null;
  if (state.status === "loading") {
    body = <p className="mt-6 text-sm text-[var(--muted)]">Loading wind down...</p>;
  } else if (state.status === "error") {
    body = (
      <div className="mt-6">
        <p className="text-sm text-[var(--bad)]">{state.loadError}</p>
        <button
          type="button"
          onClick={() => dispatch({ type: "open" })}
          className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)]"
        >
          Try again
        </button>
      </div>
    );
  } else if (isReady || isSaving) {
    switch (draft.step) {
      case 0:
        body = (
          <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">
              A few minutes to close out today and set up tomorrow.
              {payload?.settings.windDownTime !== "" ? ` Your wind down time is ${payload?.settings.windDownTime}.` : ""}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => dispatch({ type: "choose-full" })}
                className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)]"
              >
                Full wind down
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "choose-planning" })}
                className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)]"
              >
                Skip to planning tomorrow
              </button>
            </div>
          </div>
        );
        break;
      case 1:
        body = (
          <label className="mt-4 block">
            <span className="text-sm text-[var(--muted)]">What did you actually get done today?</span>
            <textarea
              rows={4}
              value={draft.review.doneToday}
              onChange={(event) => dispatch({ type: "set-done-today", value: event.target.value })}
              className={inputClass}
            />
          </label>
        );
        break;
      case 2:
        body = (
          <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">Did you finish what you planned?</p>
            <div className="mt-2 flex gap-2">
              <ChoiceButton label="Yes" active={draft.review.finishedGoal === true} onClick={() => dispatch({ type: "set-finished-goal", value: true })} />
              <ChoiceButton label="No" active={draft.review.finishedGoal === false} onClick={() => dispatch({ type: "set-finished-goal", value: false })} />
            </div>
          </div>
        );
        break;
      case 3:
        body = (
          <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">Was today a good use of your time?</p>
            <div className="mt-2 flex gap-2">
              <ChoiceButton label="Yes" active={draft.review.bestUse === true} onClick={() => dispatch({ type: "set-best-use", value: true })} />
              <ChoiceButton label="No" active={draft.review.bestUse === false} onClick={() => dispatch({ type: "set-best-use", value: false })} />
            </div>
            <label className="mt-3 block">
              <span className="text-sm text-[var(--muted)]">Anything to add? (optional)</span>
              <input
                type="text"
                value={draft.review.bestUseNote}
                onChange={(event) => dispatch({ type: "set-best-use-note", value: event.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        );
        break;
      case 4: {
        const times = payload?.taskTimes ?? [];
        body = (
          <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">Anything to remember about this? (optional)</p>
            {times.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No task time logged today.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {times.map((entry) => (
                  <label key={entry.taskId} className="block">
                    <span className="text-sm text-[var(--fg)]">
                      {entry.label} ({entry.minutes} min)
                    </span>
                    <input
                      type="text"
                      value={draft.recapAnswers[entry.taskId] ?? ""}
                      onChange={(event) => dispatch({ type: "set-recap", taskId: entry.taskId, value: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
        break;
      }
      case 5:
        body = (
          <label className="mt-4 block">
            <span className="text-sm text-[var(--muted)]">What time will you start tomorrow?</span>
            <input
              type="text"
              value={draft.startTime}
              onChange={(event) => dispatch({ type: "set-start-time", value: event.target.value })}
              placeholder="8am"
              className={inputClass}
            />
          </label>
        );
        break;
      case 6:
        body = (
          <label className="mt-4 block">
            <span className="text-sm text-[var(--muted)]">Where will you work?</span>
            <input
              type="text"
              value={draft.location}
              onChange={(event) => dispatch({ type: "set-location", value: event.target.value })}
              className={inputClass}
            />
          </label>
        );
        break;
      case 7:
        body = (
          <div className="mt-4">
            {draft.planned.length > 0 ? (
              <ul className="rounded-lg border border-[var(--line)]">
                {draft.planned.map((entry, index) => (
                  <li key={`${entry.kind}-${entry.kind === "existing" ? entry.taskId : entry.label}-${index}`} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0">
                    <span className="flex-1 text-sm text-[var(--fg)]">
                      {index + 1}. {displayLabel(entry)}
                      {index === 0 ? <span className="ml-2 text-xs text-[var(--muted)]">Most important task</span> : null}
                    </span>
                    <button type="button" aria-label={`Move ${displayLabel(entry)} up`} disabled={index === 0} onClick={() => dispatch({ type: "move-planned", index, direction: -1 })} className="px-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${displayLabel(entry)} down`} disabled={index === draft.planned.length - 1} onClick={() => dispatch({ type: "move-planned", index, direction: 1 })} className="px-1 text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" aria-label={`Remove ${displayLabel(entry)}`} onClick={() => dispatch({ type: "remove-planned", index })} className="px-1 text-[var(--muted)] hover:text-[var(--bad)]">
                      X
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">No tasks planned yet.</p>
            )}

            <div className="mt-4 flex gap-2">
              <ChoiceButton label="I already have it" active={existingMode} onClick={() => setExistingMode(true)} />
              <ChoiceButton label="Add a new one" active={!existingMode} onClick={() => setExistingMode(false)} />
            </div>

            {existingMode ? (
              <div className="mt-3">
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Project</span>
                  <select
                    value={pickerProjectId}
                    onChange={(event) => {
                      setPickerProjectId(event.target.value);
                      setPickerTaskId("");
                      setPickerSubtaskId("");
                    }}
                    className={selectClass}
                  >
                    <option value="">Pick a project</option>
                    {(payload?.projects ?? []).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className="text-xs text-[var(--muted)]">Task</span>
                  <select
                    value={pickerTaskId}
                    onChange={(event) => {
                      setPickerTaskId(event.target.value);
                      setPickerSubtaskId("");
                    }}
                    disabled={!pickerProject}
                    className={selectClass}
                  >
                    <option value="">Pick a task</option>
                    {(pickerProject?.tasks ?? []).map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block">
                  <span className="text-xs text-[var(--muted)]">Subtask (optional)</span>
                  <select value={pickerSubtaskId} onChange={(event) => setPickerSubtaskId(event.target.value)} disabled={!pickerTask} className={selectClass}>
                    <option value="">Whole task</option>
                    {(pickerTask?.subtasks ?? []).map((subtask) => (
                      <option key={subtask.id} value={subtask.id}>
                        {subtask.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addExisting}
                  disabled={!pickerTask}
                  className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)] disabled:opacity-40"
                >
                  Add task
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <label className="block">
                  <span className="text-xs text-[var(--muted)]">Project</span>
                  <select
                    value={newProjectChoice}
                    onChange={(event) => setNewProjectChoice(event.target.value)}
                    className={selectClass}
                  >
                    <option value={NEW_PROJECT}>New project</option>
                    {(payload?.projects ?? []).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                {newProjectChoice === NEW_PROJECT ? (
                  <label className="mt-2 block">
                    <span className="text-xs text-[var(--muted)]">Project name</span>
                    <input type="text" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} className={inputClass} />
                  </label>
                ) : null}
                <label className="mt-2 block">
                  <span className="text-xs text-[var(--muted)]">Task</span>
                  <input type="text" value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} className={inputClass} />
                </label>
                <button
                  type="button"
                  onClick={addNew}
                  disabled={newTaskTitle.trim() === "" || (newProjectChoice === NEW_PROJECT && newProjectName.trim() === "")}
                  className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)] disabled:opacity-40"
                >
                  Add task
                </button>
              </div>
            )}
          </div>
        );
        break;
      case 8:
        body = (
          <div className="mt-4">
            {draft.planned.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nothing planned for tomorrow yet. You can go back and add tasks, or just close for the day.</p>
            ) : (
              <ul className="rounded-lg border border-[var(--line)]">
                {draft.planned.map((entry, index) => {
                  const links = entry.kind === "existing" ? (payload?.taskLinks ?? []).filter((link) => link.ownerId === entry.taskId) : [];
                  return (
                    <li key={`${entry.kind}-${entry.kind === "existing" ? entry.taskId : entry.label}-${index}`} className="border-b border-[var(--line)] px-3 py-2 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-[var(--fg)]">
                          {index + 1}. {displayLabel(entry)}
                        </span>
                        {links.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openLinks(entry.kind === "existing" ? entry.taskId : "")}
                            className="shrink-0 rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--fg)] transition-colors hover:border-[var(--muted)]"
                          >
                            Open all links
                          </button>
                        ) : null}
                      </div>
                      {links.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">{links.map((link) => link.name).join(", ")}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-sm text-[var(--muted)]">Open what you need and leave it ready.</p>
          </div>
        );
        break;
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => dispatch({ type: "open" })}
        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--fg)]"
      >
        Wind down
      </button>

      {state.toast ? (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-50 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--fg)] shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
        >
          {state.toast}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => dispatch({ type: "close" })}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Wind down"
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-4 top-1/2 mx-auto max-h-[85vh] max-w-xl -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-[var(--fg)]">
                Wind down
                {isReady || isSaving ? <span className="ml-2 text-xs font-normal text-[var(--muted)]">{draft.step > 0 ? `Step ${draft.step} of 8` : "Choose how to run it"}</span> : null}
              </h2>
              <button
                type="button"
                aria-label="Close wind down"
                onClick={() => dispatch({ type: "close" })}
                className="text-[var(--muted)] hover:text-[var(--fg)]"
              >
                X
              </button>
            </div>

            {body}

            {state.saveError ? <p className="mt-3 text-sm text-[var(--bad)]">{state.saveError}</p> : null}

            {(isReady || isSaving) && draft.step > 0 ? (
              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "back" })}
                  disabled={isSaving}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
                >
                  Back
                </button>
                {draft.step < 8 ? (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "next" })}
                    disabled={isSaving}
                    className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--accent-strong)" }}
                  >
                    {draft.step === 7 ? "Task list finished" : "Next"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={isSaving}
                    className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--accent-strong)" }}
                  >
                    {isSaving ? "Saving..." : "Ready for tomorrow"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

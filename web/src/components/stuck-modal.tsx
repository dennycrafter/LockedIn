"use client";

// "I'm stuck, help me start" (SPEC 8.14, T7b): scripted two step helper.
// Step 1 is the check-in: pick the stuck task, then three optional prompts
// (what have you worked on, where exactly are you stuck, what have you
// already tried). Step 2 shows the deterministic suggestion from lib/stuck
// and acts through existing routes only: the start dialog handoff (the same
// pattern organize-modal uses for "Start it now"), the subtask quick-add via
// POST /api/tasks, or the open loop via POST /api/open-loops.
// AI mode (SPEC 8.15, T8-UI) is an explicit opt-in from the check-in step:
// the same task picker stays above an AI chat panel, the scripted answers
// are kept while the chat runs, and a START_5_MIN reply offers the 5 minute
// session through the same start dialog handoff. X, Escape and outside click
// cancel at any step; a fresh open starts over in scripted mode.

import { useMemo, useState } from "react";
import type { AiContext } from "@/lib/ai/types";
import { formatUndoneTaskContext } from "@/lib/ai-client";
import type { ProjectData } from "@/lib/dashboard-data";
import { openLoopText, stuckTaskOptions, suggestStuckHelp, TRIED_LABELS, type StuckTaskOption, type TriedLevel } from "@/lib/stuck";
import { AiChatPanel, type ActionableAiEntry } from "./ai-chat-panel";
import { Modal } from "./modal";

const JSON_HEADERS = { "Content-Type": "application/json" };

const TRIED_LEVELS: TriedLevel[] = ["little", "some", "everything"];

const CHIP = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-40";

const INPUT =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]";

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { borderColor: "var(--muted)", color: "var(--fg)" }
    : { borderColor: "var(--line)", color: "var(--fg)" };
}

function SecondaryStartButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
    >
      Start 5 minutes
    </button>
  );
}

/** Task picker shared by the scripted check-in and AI mode (same handoff). */
function PickerBlock({
  options,
  value,
  onChange,
}: {
  options: StuckTaskOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Which task are you stuck on?"
        className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)]"
      >
        <option value="">No specific task</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {options.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted)]">No undone tasks yet. You can run this without one.</p>
      )}
    </div>
  );
}

export function StuckModal({
  projects,
  onToast,
  onChanged,
  onStartTask,
  initialMode,
}: {
  projects: ProjectData[];
  /** Success and failure messages surface through the dashboard toast. */
  onToast: (message: string) => void;
  /** Refetch dashboard data after a subtask or open loop was saved. */
  onChanged: () => void;
  /** Hands the picked task to the existing start dialog (T7a handoff pattern). */
  onStartTask: (taskId: string | null) => void;
  /** SPEC 8.15: the configured helper mode decides how the modal opens; the
   * in-modal switch still works within an open session. */
  initialMode?: "scripted" | "ai";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"scripted" | "ai">("scripted");
  const [step, setStep] = useState<"checkin" | "suggestion">("checkin");
  const [selectedId, setSelectedId] = useState("");
  const [workedOn, setWorkedOn] = useState("");
  const [stuckWhere, setStuckWhere] = useState("");
  const [tried, setTried] = useState<TriedLevel | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [loopText, setLoopText] = useState("");
  const [loopBusy, setLoopBusy] = useState(false);
  const [loopError, setLoopError] = useState<string | null>(null);

  const options = useMemo(() => stuckTaskOptions(projects), [projects]);
  const selected = options.find((option) => option.id === selectedId) ?? null;

  // Undone tasks with their ids, so the AI can reference them and the
  // START_5_MIN handoff can pre-target the start dialog.
  const aiContext = useMemo<AiContext>(
    () => ({
      undoneTasks: formatUndoneTaskContext(
        options.map((option) => ({ label: option.label, id: option.id, kind: option.kind })),
      ),
    }),
    [options],
  );

  const suggestion = useMemo(
    () => suggestStuckHelp({ workedOn, stuckWhere, tried }),
    [workedOn, stuckWhere, tried],
  );

  const openFresh = () => {
    setMode(initialMode ?? "scripted");
    setStep("checkin");
    setSelectedId("");
    setWorkedOn("");
    setStuckWhere("");
    setTried(null);
    setSubtaskTitle("");
    setSubtaskError(null);
    setLoopText("");
    setLoopError(null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const goSuggest = () => {
    // The park input is prefilled from the answers each time the step is
    // entered, so editing them on the way back stays honest.
    setLoopText(openLoopText({ workedOn, stuckWhere, tried }, selected?.title ?? null));
    setStep("suggestion");
  };

  const startFiveMinutes = () => {
    onStartTask(selected ? selected.topTaskId : null);
    close();
  };

  // The START_5_MIN marker becomes the same 5 minute handoff the scripted
  // suggestion uses; with no picker pick, the dialog opens clean.
  const renderAiActions = (entry: ActionableAiEntry) =>
    entry.start5min ? (
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={startFiveMinutes}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--accent-strong)" }}
        >
          Start 5 minutes
        </button>
        <p className="text-xs text-[var(--muted)]">
          {selected
            ? `Opens the session dialog with "${selected.title}" picked.`
            : "Opens the session dialog so you can pick a task there."}
        </p>
      </div>
    ) : null;

  const addSubtask = async () => {
    const title = subtaskTitle.trim();
    if (!selected || title === "" || subtaskBusy) return;
    setSubtaskBusy(true);
    setSubtaskError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ projectId: selected.projectId, parentId: selected.topTaskId, title }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setSubtaskError(payload.error ?? `Request failed (${response.status})`);
        return;
      }
      onToast("Subtask added");
      onChanged();
      close();
    } catch {
      setSubtaskError("Network request failed.");
    } finally {
      setSubtaskBusy(false);
    }
  };

  const parkLoop = async () => {
    const text = loopText.trim();
    if (text === "" || loopBusy) return;
    setLoopBusy(true);
    setLoopError(null);
    try {
      const response = await fetch("/api/open-loops", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ kind: "loop", text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setLoopError(payload.error ?? `Request failed (${response.status})`);
        return;
      }
      onToast("Open loop saved");
      onChanged();
      close();
    } catch {
      setLoopError("Network request failed.");
    } finally {
      setLoopBusy(false);
    }
  };

  if (!open) {
    return (
      <section aria-label="I'm stuck" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="text-base font-semibold text-[var(--fg)]">I&apos;m stuck</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Three quick questions, one next step that takes 5 minutes.</p>
        <button
          type="button"
          onClick={openFresh}
          className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Help me start
        </button>
      </section>
    );
  }

  return (
    <Modal title="I'm stuck, help me start" onClose={close}>
      {mode === "ai" && (
        <div>
          <p className="text-sm text-[var(--fg)]">AI coach mode</p>
          <PickerBlock options={options} value={selectedId} onChange={setSelectedId} />
          <AiChatPanel
            flow="stuck"
            context={aiContext}
            introText="Tell the coach what is going on. It will help you name one tiny first step, then offer a 5 minute session."
            sendLabel="Message the AI coach"
            renderActions={renderAiActions}
            onSwitchToScripted={() => setMode("scripted")}
          />
        </div>
      )}

      {mode === "scripted" && step === "checkin" && (
        <div>
          <p className="text-sm text-[var(--fg)]">First, a quick check-in.</p>

          <PickerBlock options={options} value={selectedId} onChange={setSelectedId} />

          <div className="mt-3 space-y-3">
            <input
              type="text"
              value={workedOn}
              onChange={(event) => setWorkedOn(event.target.value)}
              aria-label="What have you worked on so far?"
              placeholder="What have you worked on so far? Leave empty if you have not started"
              className={INPUT}
            />
            <input
              type="text"
              value={stuckWhere}
              onChange={(event) => setStuckWhere(event.target.value)}
              aria-label="Where exactly are you stuck?"
              placeholder="Where exactly are you stuck? For example: the opening paragraph"
              className={INPUT}
            />
            <fieldset>
              <legend className="text-sm text-[var(--muted)]">What have you already tried?</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {TRIED_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={tried === level}
                    onClick={() => setTried(tried === level ? null : level)}
                    className={CHIP}
                    style={chipStyle(tried === level)}
                  >
                    {TRIED_LABELS[level]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">Every answer is optional. Empty answers are fine.</p>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={goSuggest}
              className="rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--accent-strong)" }}
            >
              Next
            </button>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
            >
              Ask AI to coach me instead
            </button>
          </div>
        </div>
      )}

      {mode === "scripted" && step === "suggestion" && (
        <div>
          {selected && <p className="text-xs text-[var(--muted)]">Stuck on: {selected.label}</p>}
          <p className="mt-1 text-sm font-medium text-[var(--fg)]">{suggestion.headline}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{suggestion.detail}</p>
          {stuckWhere.trim() !== "" && (
            <p className="mt-2 border-l-2 border-[var(--line)] pl-3 text-xs text-[var(--muted)]">
              Where you are stuck: {stuckWhere.trim()}
            </p>
          )}

          {suggestion.kind === "start" && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={startFiveMinutes}
                className="rounded-md px-4 py-2 text-sm font-medium text-white"
                style={{ background: "var(--accent-strong)" }}
              >
                Start 5 minutes
              </button>
              <p className="text-xs text-[var(--muted)]">
                {selected
                  ? `Opens the session dialog with "${selected.title}" picked.`
                  : "Opens the session dialog so you can pick a task there."}
              </p>
            </div>
          )}

          {suggestion.kind === "break_down" && (
            <div className="mt-4">
              {selected ? (
                <div>
                  <input
                    type="text"
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    aria-label="Smallest next step (saved as a subtask)"
                    placeholder="What is the smallest next step?"
                    className={INPUT}
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Think small: open the doc, write one ugly sentence, list 3 bullet points.
                  </p>
                  {subtaskError && <p className="mt-2 text-sm text-[var(--bad)]">{subtaskError}</p>}
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void addSubtask()}
                      disabled={subtaskTitle.trim() === "" || subtaskBusy}
                      className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)] disabled:opacity-50"
                    >
                      Add subtask
                    </button>
                    <SecondaryStartButton onClick={startFiveMinutes} />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-[var(--muted)]">Pick a task in step 1 to add the smaller step under it.</p>
                  <div className="mt-3">
                    <SecondaryStartButton onClick={startFiveMinutes} />
                  </div>
                </div>
              )}
            </div>
          )}

          {suggestion.kind === "park" && (
            <div className="mt-4">
              <input
                type="text"
                value={loopText}
                onChange={(event) => setLoopText(event.target.value)}
                aria-label="Open loop text"
                placeholder="What keeps circling?"
                className={INPUT}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">Saved to your open loops so it stops circling.</p>
              {loopError && <p className="mt-2 text-sm text-[var(--bad)]">{loopError}</p>}
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void parkLoop()}
                  disabled={loopText.trim() === "" || loopBusy}
                  className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--accent-strong)" }}
                >
                  Park it as an open loop
                </button>
                <SecondaryStartButton onClick={startFiveMinutes} />
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setStep("checkin")}
              className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

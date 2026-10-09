"use client";

// Organize my task list (SPEC 8.14, T7a): scripted step-by-step helper flow.
// Step 1 dumps every undone task, subtask and misc task with checkboxes plus
// an add-new box (new items become misc tasks through the existing route).
// Step 2 rates each checked item: deadline, impact, effort. Step 3 shows the
// ranked list and acts on the top item: "Make #1 my most important task"
// writes today's day plan through /api/day-plans/most-important, and
// "Start it now" hands the item to the dashboard's existing start dialog.
// X (Escape, or clicking outside) cancels at any step and the next open
// starts fresh. Ranking math lives in lib/organize; this file is presentation.

import { useMemo, useState } from "react";
import type { MiscTaskData, ProjectData } from "@/lib/dashboard-data";
import {
  DEFAULT_RATING,
  organizeDumpItems,
  rankOrganizeItems,
  type DeadlineBucket,
  type OrganizeItem,
  type OrganizeRating,
} from "@/lib/organize";
import { Modal } from "./modal";

const JSON_HEADERS = { "Content-Type": "application/json" };

const DEADLINES: Array<{ value: DeadlineBucket; label: string }> = [
  { value: "none", label: "None" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "later", label: "Later" },
];

const RATING_BUTTON = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-40";

function ratingButtonStyle(active: boolean): React.CSSProperties {
  return active
    ? { borderColor: "var(--accent-ink)", color: "var(--accent-ink)" }
    : { borderColor: "var(--line)", color: "var(--fg)" };
}

function ChoiceRow({
  legend,
  choices,
  value,
  onChange,
}: {
  legend: string;
  choices: string[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-[var(--muted)]">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {choices.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={value === index + 1}
            onClick={() => onChange(index + 1)}
            className={`${RATING_BUTTON} w-9`}
            style={ratingButtonStyle(value === index + 1)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function OrganizeModal({
  projects,
  miscTasks,
  onToast,
  onChanged,
  onStartItem,
}: {
  projects: ProjectData[];
  miscTasks: MiscTaskData[];
  /** Success and failure messages surface through the dashboard toast. */
  onToast: (message: string) => void;
  /** Refetch dashboard data after a misc task was added or the plan changed. */
  onChanged: () => void;
  /** Opens the existing start dialog on this item (SPEC 8.14 step 4). */
  onStartItem: (item: OrganizeItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"dump" | "rate" | "ranked">("dump");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, OrganizeRating>>({});
  const [rateIndex, setRateIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const dump = useMemo(() => organizeDumpItems(projects, miscTasks), [projects, miscTasks]);
  const treeItems = dump.filter((item) => item.kind !== "misc");
  const miscItems = dump.filter((item) => item.kind === "misc");
  const checkedItems = useMemo(() => dump.filter((item) => checkedIds.has(item.id)), [dump, checkedIds]);

  const ranked = useMemo(
    () => rankOrganizeItems(checkedItems.map((item) => ({ item, rating: ratings[item.id] ?? DEFAULT_RATING }))),
    [checkedItems, ratings],
  );
  const top = ranked[0] ?? null;

  const openFresh = () => {
    setStep("dump");
    setCheckedIds(new Set());
    setRatings({});
    setRateIndex(0);
    setDraft("");
    setAddError(null);
    setPlanError(null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const toggle = (id: string, on: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const addMiscItem = async () => {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch("/api/misc-tasks", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ title }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setAddError(payload.error ?? `Request failed (${response.status})`);
        return;
      }
      setDraft("");
      onChanged();
    } catch {
      setAddError("Network request failed.");
    } finally {
      setAdding(false);
    }
  };

  const makeMostImportant = async () => {
    if (!top || top.item.kind === "misc" || planBusy) return;
    setPlanBusy(true);
    setPlanError(null);
    try {
      const response = await fetch("/api/day-plans/most-important", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ taskId: top.item.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setPlanError(payload.error ?? `Request failed (${response.status})`);
        return;
      }
      onToast("Most important task set");
      onChanged();
      close();
    } catch {
      setPlanError("Network request failed.");
    } finally {
      setPlanBusy(false);
    }
  };

  if (!open) {
    return (
      <section
        aria-label="Organize my task list"
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <h2 className="text-base font-semibold text-[var(--fg)]">Organize my task list</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">Dump everything, rank it, start with number one.</p>
        <button
          type="button"
          onClick={openFresh}
          className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Organize
        </button>
      </section>
    );
  }

  // Rating screens need at least one checked item; falling back keeps the
  // modal valid if everything gets unchecked from the dump step.
  const safeStep = checkedItems.length === 0 ? "dump" : step;
  const ratingItem = checkedItems[Math.min(rateIndex, checkedItems.length - 1)];
  const rating = (ratingItem && ratings[ratingItem.id]) || DEFAULT_RATING;
  const isLastRating = rateIndex >= checkedItems.length - 1;

  const setRating = (patch: Partial<OrganizeRating>) => {
    if (!ratingItem) return;
    setRatings((prev) => ({ ...prev, [ratingItem.id]: { ...(prev[ratingItem.id] ?? DEFAULT_RATING), ...patch } }));
  };

  return (
    <Modal title="Organize my task list" onClose={close}>
      {safeStep === "dump" && (
        <div>
          <p className="text-sm text-[var(--fg)]">Dump everything you could work on.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Tick what you could work on. Anything missing? Add it below.</p>

          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-[var(--line)]">
            {treeItems.length > 0 && (
              <div>
                <h3 className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Tasks</h3>
                <ul>
                  {treeItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.has(item.id)}
                        onChange={(event) => toggle(item.id, event.target.checked)}
                        aria-label={`Include in ranking: ${item.label}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {miscItems.length > 0 && (
              <div>
                <h3 className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Misc tasks
                </h3>
                <ul>
                  {miscItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={checkedIds.has(item.id)}
                        onChange={(event) => toggle(item.id, event.target.checked)}
                        aria-label={`Include in ranking: ${item.label}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">{item.label}</span>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        misc
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dump.length === 0 && (
              <p className="px-3 py-3 text-sm text-[var(--muted)]">Nothing undone. Add an item below.</p>
            )}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addMiscItem();
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a new item, e.g. email the accountant"
              aria-label="Add a new item (saved as a misc task)"
              className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
            <button
              type="submit"
              disabled={draft.trim() === "" || adding}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {addError && <p className="mt-2 text-sm text-[var(--bad)]">{addError}</p>}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={checkedItems.length === 0}
              onClick={() => {
                setRateIndex(0);
                setStep("rate");
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {safeStep === "rate" && ratingItem && (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--muted)]">
              Item {Math.min(rateIndex + 1, checkedItems.length)} of {checkedItems.length}
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--fg)]">{ratingItem.label}</p>
          </div>

          <fieldset>
            <legend className="text-sm text-[var(--muted)]">Is there a deadline?</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DEADLINES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={rating.deadline === choice.value}
                  onClick={() => setRating({ deadline: choice.value })}
                  className={RATING_BUTTON}
                  style={ratingButtonStyle(rating.deadline === choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </fieldset>

          <ChoiceRow
            legend="Impact if done (1 to 5)"
            choices={["1", "2", "3", "4", "5"]}
            value={rating.impact}
            onChange={(impact) => setRating({ impact })}
          />
          <ChoiceRow
            legend="Effort (1 to 5)"
            choices={["1", "2", "3", "4", "5"]}
            value={rating.effort}
            onChange={(effort) => setRating({ effort })}
          />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (rateIndex === 0) setStep("dump");
                else setRateIndex(rateIndex - 1);
              }}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLastRating) setStep("ranked");
                else setRateIndex(rateIndex + 1);
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
            >
              {isLastRating ? "Rank them" : "Next"}
            </button>
          </div>
        </div>
      )}

      {safeStep === "ranked" && (
        <div>
          <p className="text-sm text-[var(--fg)]">Ranked. Start at the top.</p>
          <ol className="mt-2 max-h-64 overflow-y-auto rounded-md border border-[var(--line)]">
            {ranked.map((entry, index) => (
              <li
                key={entry.item.id}
                className="flex items-center gap-3 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
              >
                <span className="w-6 shrink-0 text-sm text-[var(--muted)]">#{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--fg)]">{entry.item.label}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {entry.rating.deadline === "none" ? "no deadline" : `deadline: ${entry.rating.deadline}`} · impact{" "}
                    {entry.rating.impact} · effort {entry.rating.effort}
                  </span>
                </span>
                <span className="shrink-0 text-base font-medium" style={{ color: "var(--accent-ink)" }}>
                  {entry.score}
                </span>
              </li>
            ))}
          </ol>

          {top?.item.kind === "misc" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Misc tasks cannot go in the plan. Start a timer on them instead.
            </p>
          )}
          {planError && <p className="mt-2 text-sm text-[var(--bad)]">{planError}</p>}

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void makeMostImportant()}
              disabled={planBusy || top?.item.kind === "misc"}
              title={top?.item.kind === "misc" ? "Misc tasks cannot go in the plan." : undefined}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              Make #1 my most important task
            </button>
            <button
              type="button"
              onClick={() => {
                if (!top) return;
                onStartItem(top.item);
                close();
              }}
              className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
            >
              Start it now
            </button>
            <button
              type="button"
              onClick={() => {
                setRateIndex(Math.max(0, checkedItems.length - 1));
                setStep("rate");
              }}
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

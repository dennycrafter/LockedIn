"use client";

// Plan card (SPEC 8.9 + 8.12): the wind-down-built plan in plan order with a
// tick box and a timer button per row, start time and place, and the "Most
// important task" label on the first row; misc tasks sit underneath with the
// card's + button. Polls its route so a plan the wind-down modal just saved
// appears without a reload.
//
// UI polish (Oct 2026): this used to be two cards ("Tomorrow's plan" and
// "Tomorrow's task list") and the second one always said "No plan yet" even
// when the first showed a plan. Now it is one card, titled by the plan's day.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MiscTaskData } from "@/lib/dashboard-data";
import { shouldCelebratePlanFinish, visiblePlanRows, type TomorrowPlan, type TomorrowPlanRow } from "@/lib/tomorrow-plan";
import { planCardTitle, planDetailsLine } from "@/lib/ui-format";
import { PlayIcon, PlusIcon } from "./icons";
import { MiscTaskList } from "./misc-tasks-panel";
import { BTN_ICON, BTN_QUIET, CARD, CARD_TITLE, INPUT, SECTION_LABEL } from "./ui";

const POLL_MS = 15_000;

export function PlanPanel({
  startDisabled,
  onToggleTask,
  onStartTask,
  onPlanCompleted,
  miscTasks,
  onCreateMisc,
  onToggleMisc,
  onDeleteMisc,
  onReorderMisc,
  onStartMisc,
}: {
  /** True while a session runs: only one session at a time (SPEC 8.4). */
  startDisabled: boolean;
  /** Must not reject; failures surface through the app's toast. */
  onToggleTask: (taskId: string, done: boolean) => void | Promise<void>;
  onStartTask: (taskId: string) => void;
  /** Fired when a tick empties the plan (SPEC 8.10). */
  onPlanCompleted: () => void;
  miscTasks: MiscTaskData[];
  onCreateMisc: (title: string) => void;
  onToggleMisc: (id: string, done: boolean) => void;
  onDeleteMisc: (id: string) => void;
  onReorderMisc: (orderedIds: string[]) => void;
  onStartMisc: (id: string) => void;
}) {
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const fetchPlan = useCallback(async (): Promise<TomorrowPlan | null> => {
    try {
      const response = await fetch("/api/day-plans/upcoming", { cache: "no-store" });
      if (!response.ok) {
        setLoadError(true);
        return null;
      }
      const body = (await response.json()) as { ok: boolean; plan: TomorrowPlan | null };
      setPlan(body.plan ?? null);
      setLoadError(false);
      setLoaded(true);
      return body.plan ?? null;
    } catch {
      // Network hiccup: keep the current plan; the next poll retries.
      setLoadError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void fetchPlan();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchPlan();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchPlan();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchPlan]);

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  // Tick a planned task, then refetch so the row moves. The celebration fires
  // only when the refetch confirms the list emptied.
  const tick = useCallback(
    async (before: TomorrowPlanRow[], taskId: string, done: boolean) => {
      await onToggleTask(taskId, done);
      const after = await fetchPlan();
      if (done && shouldCelebratePlanFinish(before, after?.rows ?? [])) onPlanCompleted();
    },
    [fetchPlan, onPlanCompleted, onToggleTask],
  );

  const rows = plan ? visiblePlanRows(plan.rows) : [];
  const doneRows = plan
    ? plan.rows.filter((row) => row.done && row.taskId !== "" && row.title !== "").sort((a, b) => a.position - b.position)
    : [];
  const details = plan ? planDetailsLine(plan) : "";
  const title = plan ? planCardTitle(plan.planDateKey, new Date()) : "Plan";

  const closeAdd = () => {
    setDraft("");
    setAdding(false);
  };

  return (
    <section aria-label={title} className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className={CARD_TITLE}>{title}</h2>
          {details !== "" && <p className="mt-0.5 text-[13px] text-[var(--muted)]">{details}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add a misc task"
          title="Add a misc task"
          className={`${BTN_ICON} -mr-1.5 -mt-1`}
        >
          <PlusIcon />
        </button>
      </div>

      {!loaded && !loadError ? (
        <p className="mt-3 text-[13px] text-[var(--muted)]">Loading...</p>
      ) : !plan && loadError ? (
        <p className="mt-3 text-[13px] text-[var(--warn)]">Could not load the plan. Retrying...</p>
      ) : !plan ? (
        <p className="mt-3 text-[13px] text-[var(--muted)]">No plan yet. Wind down builds one in a few minutes.</p>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--muted)]">
              {plan.rows.length > 0 ? "Everything on this plan is done." : "No tasks on this plan yet."}
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-md border border-[var(--line)]">
              {rows.map((row, index) => (
                <li
                  key={row.taskId}
                  className="lockedin-row flex items-start gap-3 border-b border-[var(--line)] py-2 pl-3 pr-1 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => void tick(plan.rows, row.taskId, true)}
                    aria-label={`Tick plan task: ${row.title}`}
                    className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--silver)]"
                  />
                  <span className="min-w-0 flex-1">
                    {index === 0 && <span className={`${SECTION_LABEL} block text-[11px]`}>Most important</span>}
                    <span className="block break-words text-sm text-[var(--fg)]">{row.title}</span>
                    {row.contextLabel !== "" && (
                      <span className="block truncate text-[13px] text-[var(--muted)]">{row.contextLabel}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onStartTask(row.taskId)}
                    disabled={startDisabled}
                    aria-label={`Start a timer on plan task: ${row.title}`}
                    className={`${BTN_ICON} lockedin-on-hover`}
                  >
                    <PlayIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {doneRows.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDone((prev) => !prev)}
                aria-expanded={showDone}
                className={`${BTN_QUIET} -ml-2 mt-1 text-[13px]`}
              >
                {showDone ? "Hide done" : `Show ${doneRows.length} done`}
              </button>
              {showDone && (
                <ul className="mt-1">
                  {doneRows.map((row) => (
                    <li key={row.taskId} className="flex items-center gap-3 py-1.5 pl-3">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => void tick(plan.rows, row.taskId, false)}
                        aria-label={`Untick plan task: ${row.title}`}
                        className="h-4 w-4 shrink-0 accent-[var(--silver)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted)] line-through">{row.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {(miscTasks.length > 0 || adding) && (
        <div className="mt-4">
          <h3 className={SECTION_LABEL}>Misc</h3>
          <div className="mt-1.5 overflow-hidden rounded-md border border-[var(--line)]">
            <MiscTaskList
              miscTasks={miscTasks}
              startDisabled={startDisabled}
              onToggle={onToggleMisc}
              onDelete={onDeleteMisc}
              onReorder={onReorderMisc}
              onStart={onStartMisc}
            />
          </div>
        </div>
      )}

      {adding && (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (value) {
              onCreateMisc(value);
              setDraft("");
            }
          }}
        >
          <input
            ref={addRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft.trim() === "") closeAdd();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeAdd();
            }}
            placeholder="Misc task, e.g. post the letter. Enter to add"
            aria-label="New misc task"
            className={INPUT}
          />
        </form>
      )}
    </section>
  );
}

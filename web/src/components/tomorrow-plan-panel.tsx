"use client";

// Tomorrow's task list plan rows (SPEC 8.12): the wind-down-built plan shown
// in plan order with a tick box and a timer button per row, start time and
// location, and the "Most important task" label on the first row. Polls its
// route so a plan the wind-down modal just saved appears without a reload.
// Mounted above the misc task list in the right column; renders nothing until
// a plan exists, which keeps the shell's "No plan yet" line as the empty state.
import { useCallback, useEffect, useState } from "react";
import {
  planMetaLine,
  shouldCelebratePlanFinish,
  visiblePlanRows,
  type TomorrowPlan,
  type TomorrowPlanRow,
} from "@/lib/tomorrow-plan";

const POLL_MS = 15_000;
const ICON_BUTTON = "shrink-0 px-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]";

export function TomorrowPlanPanel({
  startDisabled,
  onToggleTask,
  onStartTask,
  onPlanCompleted,
}: {
  /** True while a session runs: only one session at a time (SPEC 8.4). */
  startDisabled: boolean;
  /** Must not reject; failures surface through the app's toast. */
  onToggleTask: (taskId: string, done: boolean) => void | Promise<void>;
  onStartTask: (taskId: string) => void;
  /** Fired when a tick empties the plan (SPEC 8.10). */
  onPlanCompleted: () => void;
}) {
  const [plan, setPlan] = useState<TomorrowPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

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

  // Tick a planned task done, then refetch so the row leaves the list. The
  // celebration fires only when the refetch confirms the list emptied.
  const tick = useCallback(
    async (before: TomorrowPlanRow[], taskId: string) => {
      await onToggleTask(taskId, true);
      const after = await fetchPlan();
      if (shouldCelebratePlanFinish(before, after?.rows ?? [])) onPlanCompleted();
    },
    [fetchPlan, onPlanCompleted, onToggleTask],
  );

  if (!loaded) return null;
  if (!plan && loadError) {
    return (
      <section aria-label="Tomorrow's plan" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-xs text-[var(--warn)]">Could not load the plan. Retrying...</p>
      </section>
    );
  }
  if (!plan) return null;

  const rows = visiblePlanRows(plan.rows);
  const hiddenDone = plan.rows.length - rows.length;
  const meta = planMetaLine(plan, new Date());

  return (
    <section aria-label="Tomorrow's plan" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold text-[var(--fg)]">Tomorrow&apos;s plan</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">{meta}</p>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {plan.rows.length > 0 ? "All done on this plan." : "No tasks on this plan yet."}
        </p>
      ) : (
        <ul className="mt-2 rounded-md border border-[var(--line)]">
          {rows.map((row, index) => (
            <li key={row.taskId} className="flex items-start gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0">
              <input
                type="checkbox"
                onChange={() => void tick(plan.rows, row.taskId)}
                aria-label={`Tick plan task: ${row.title}`}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">
                {index === 0 && (
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    Most important task
                  </span>
                )}
                <span className="block truncate text-sm text-[var(--fg)]">{row.title}</span>
                {row.contextLabel !== "" && (
                  <span className="block truncate text-xs text-[var(--muted)]">{row.contextLabel}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onStartTask(row.taskId)}
                disabled={startDisabled}
                aria-label={`Start a timer on plan task: ${row.title}`}
                className={`${ICON_BUTTON} disabled:opacity-40`}
              >
                ▶
              </button>
            </li>
          ))}
        </ul>
      )}
      {hiddenDone > 0 && <p className="mt-2 text-xs text-[var(--muted)]">{hiddenDone} hidden done</p>}
    </section>
  );
}

"use client";

// EOD preview modal (SPEC 8.13): the Send EOD opener, the floating preview
// window with the two editable fields, and the send flow. Section data comes
// from GET /api/eod; sending POSTs the edits and the server rebuilds and
// emails the report. State transitions live in lib/eod-modal-state.

import { useEffect, useReducer } from "react";
import {
  formatChicagoTime,
  formatFocusedDuration,
  groupTimeByTask,
  infractionLabel,
  totalFocusedSeconds,
  yesNoAnswer,
} from "@/lib/eod-report";
import {
  eodModalInitialState,
  eodModalReducer,
  type EodGetResponse,
  type EodSendResponse,
} from "@/lib/eod-modal-state";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      <div className="mt-1.5 text-sm text-[var(--fg)]">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--muted)]">{children}</p>;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]"
      />
    </label>
  );
}

export default function EodSection() {
  const [state, dispatch] = useReducer(eodModalReducer, undefined, eodModalInitialState);
  const open = state.status !== "closed";

  // Fetch the preview data whenever the modal opens.
  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eod");
        const body = (await res.json()) as EodGetResponse;
        if (cancelled) return;
        if (res.ok && body.ok) {
          dispatch({ type: "load-success", context: body.context, data: body.data });
        } else {
          const error = body.ok ? `Loading failed with HTTP ${res.status}` : body.error;
          dispatch({ type: "load-failure", error });
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: "load-failure",
            error: err instanceof Error ? err.message : "Could not load the report",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status]);

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

  async function send() {
    if (state.status !== "ready") return;
    dispatch({ type: "send-start" });
    try {
      const res = await fetch("/api/eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doneToday: state.doneToday, learned: state.learned }),
      });
      const body = (await res.json()) as EodSendResponse;
      if (res.ok && body.ok) {
        dispatch({ type: "send-success" });
      } else {
        const error = body.ok ? `Sending failed with HTTP ${res.status}` : body.error;
        dispatch({ type: "send-failure", error });
      }
    } catch (err) {
      dispatch({
        type: "send-failure",
        error: err instanceof Error ? err.message : "Could not reach the server",
      });
    }
  }

  const data = state.data;
  const perTask = data ? groupTimeByTask(data.sessions) : [];
  const totalSeconds = data ? totalFocusedSeconds(data.sessions) : 0;
  const isSending = state.status === "sending";

  return (
    <div>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => dispatch({ type: "open" })}
        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--fg)]"
      >
        Send EOD
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => dispatch({ type: "close" })}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="End of day report preview"
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-4 top-1/2 mx-auto max-h-[85vh] max-w-2xl -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-6 shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--fg)]">LockedIn end of day report</h2>
                {state.context ? (
                  <p className="text-sm text-[var(--muted)]">{state.context.dateLabel}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close the end of day preview"
                onClick={() => dispatch({ type: "close" })}
                className="rounded-md border border-[var(--line)] px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
              >
                X
              </button>
            </div>

            {state.status === "loading" ? <p className="mt-6 text-sm text-[var(--muted)]">Loading the report...</p> : null}

            {state.status === "error" ? (
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
            ) : null}

            {data && state.context ? (
              <div>
                <Section title="Total focused time">
                  <p>{formatFocusedDuration(totalSeconds)}</p>
                  <p className="text-[var(--muted)]">Sessions today: {data.sessions.length}</p>
                </Section>

                <Field
                  label="What you got done today"
                  value={state.doneToday}
                  onChange={(value) => dispatch({ type: "edit-done", value })}
                />
                <Field
                  label="What you learned today"
                  value={state.learned}
                  onChange={(value) => dispatch({ type: "edit-learned", value })}
                />

                <Section title="Finished planned work">
                  <p>{yesNoAnswer(data.review?.finishedGoal ?? null)}</p>
                </Section>

                <Section title="Good use of time">
                  <p>{yesNoAnswer(data.review?.bestUse ?? null)}</p>
                  {data.review?.bestUseNote ? (
                    <p className="text-[var(--muted)]">{data.review.bestUseNote}</p>
                  ) : null}
                </Section>

                <Section title="Tomorrow plan">
                  {data.plan ? (
                    <ul className="list-disc pl-4">
                      <li>Start: {data.plan.startTime !== "" ? data.plan.startTime : "not set"}</li>
                      <li>Where: {data.plan.location !== "" ? data.plan.location : "not set"}</li>
                      {data.plan.tasks.map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                      {data.plan.tasks.length === 0 ? <li className="text-[var(--muted)]">No tasks planned yet.</li> : null}
                    </ul>
                  ) : (
                    <Empty>No plan yet.</Empty>
                  )}
                </Section>

                <Section title="Time studies today">
                  {data.timeStudies.length === 0 ? (
                    <Empty>No time studies today.</Empty>
                  ) : (
                    <ul className="list-disc pl-4">
                      {data.timeStudies.map((study, index) => (
                        <li key={`${study.occurredAt}-${index}`}>
                          {formatChicagoTime(study.occurredAt)}: {study.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Time per task today">
                  {perTask.length === 0 ? (
                    <Empty>No focused time recorded.</Empty>
                  ) : (
                    <ul className="list-disc pl-4">
                      {perTask.map((row) => (
                        <li key={row.label}>
                          {row.label}: {formatFocusedDuration(row.seconds)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title={`Infractions today: ${data.infractions.length}`}>
                  {data.infractions.length === 0 ? (
                    <Empty>No infractions today.</Empty>
                  ) : (
                    <ul className="list-disc pl-4">
                      {data.infractions.map((infraction, index) => (
                        <li key={`${infraction.occurredAt}-${index}`}>
                          {formatChicagoTime(infraction.occurredAt)}: {infractionLabel(infraction)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {state.sendError ? (
                  <p role="alert" className="mt-5 rounded-md border border-[var(--bad)] px-3 py-2 text-sm text-[var(--bad)]">
                    {state.sendError}
                  </p>
                ) : null}

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={send}
                    disabled={isSending}
                    className="rounded-md bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-strong-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--fg)] shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
        >
          {state.toast}
        </div>
      ) : null}
    </div>
  );
}

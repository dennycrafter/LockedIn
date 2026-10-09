"use client";

// Time study panel (SPEC 8.11): pick the check-in interval (off or 5 to 60
// minutes) and see today's answers. The interval is a settings row change;
// the extension schedules its own chrome.alarms from the pushed value. The
// in-dashboard prompt that appears on each check-in renders in the app shell,
// not here, so it is visible from anywhere on the dashboard.
import type { TimeStudyEntryData } from "@/lib/dashboard-data";
import { TIME_STUDY_CHOICES } from "@/lib/time-study";

function formatClock(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function TimeStudyPanel({
  entries,
  intervalMinutes,
  onChangeInterval,
}: {
  entries: TimeStudyEntryData[];
  intervalMinutes: number | null;
  onChangeInterval: (minutes: number | null) => void;
}) {
  return (
    <section
      aria-label="Time study"
      className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
    >
      <h2 className="text-base font-semibold text-[var(--fg)]">Time study</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        A check-in asks &quot;What are you doing right now?&quot; every few minutes and keeps your answers.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Check-in interval">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Ask me every</span>
        <button
          type="button"
          onClick={() => onChangeInterval(null)}
          aria-pressed={intervalMinutes === null}
          aria-label="Time study off"
          className={`rounded-md border px-2.5 py-1 text-sm ${
            intervalMinutes === null
              ? "border-[var(--muted)] bg-[var(--surface-2)] text-[var(--fg)]"
              : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
          }`}
        >
          Off
        </button>
        {TIME_STUDY_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => onChangeInterval(minutes)}
            aria-pressed={intervalMinutes === minutes}
            aria-label={`Check in every ${minutes} minutes`}
            className={`rounded-md border px-2.5 py-1 text-sm ${
              intervalMinutes === minutes
                ? "border-[var(--muted)] bg-[var(--surface-2)] text-[var(--fg)]"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)]"
            }`}
          >
            {minutes}m
          </button>
        ))}
      </div>

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        Today ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="py-2 text-sm text-[var(--muted)]">No check-ins yet today.</p>
      ) : (
        <ul className="mt-1 rounded-md border border-[var(--line)]">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-baseline justify-between gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 text-sm text-[var(--fg)]">{entry.text}</span>
              <span className="shrink-0 text-xs text-[var(--muted)]">{formatClock(entry.occurred_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

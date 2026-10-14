"use client";

// Time study panel (SPEC 8.11): pick the check-in interval (off or 5 to 60
// minutes) and see today's answers. The interval is a settings row change;
// the extension schedules its own chrome.alarms from the pushed value. The
// in-dashboard prompt that appears on each check-in renders in the app shell,
// not here, so it is visible from anywhere on the dashboard.
import type { TimeStudyEntryData } from "@/lib/dashboard-data";
import { TIME_STUDY_CHOICES } from "@/lib/time-study";
import { FIELD_LABEL, SECTION_LABEL, Segmented } from "./ui";

function formatClock(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function TimeStudyPanel({
  entries,
  intervalMinutes,
  onChangeInterval,
  bare = false,
}: {
  entries: TimeStudyEntryData[];
  intervalMinutes: number | null;
  onChangeInterval: (minutes: number | null) => void;
  /** True inside a window that already has a title and border. */
  bare?: boolean;
}) {
  return (
    <section
      aria-label="Time study"
      className={bare ? "" : "rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"}
    >
      {!bare && <h2 className="text-base font-semibold text-[var(--fg)]">Time study</h2>}
      <p className={`${bare ? "" : "mt-1 "}text-sm text-[var(--muted)]`}>
        A check-in asks &quot;What are you doing right now?&quot; every few minutes and keeps your answers.
      </p>

      <div className="mt-4">
        <p className={FIELD_LABEL}>Ask me every</p>
        <Segmented
          label="Check-in interval"
          className="flex w-full"
          value={intervalMinutes}
          onChange={onChangeInterval}
          options={[
            { value: null, label: "Off", ariaLabel: "Time study off" },
            ...TIME_STUDY_CHOICES.map((minutes) => ({
              value: minutes as number | null,
              label: `${minutes}m`,
              ariaLabel: `Check in every ${minutes} minutes`,
            })),
          ]}
        />
      </div>

      <h3 className={`mt-5 ${SECTION_LABEL}`}>
        Today ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--muted)]">No check-ins yet today.</p>
      ) : (
        <ul className="mt-1 rounded-md border border-[var(--line)]">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-baseline justify-between gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 text-sm text-[var(--fg)]">{entry.text}</span>
              <span className="shrink-0 text-[13px] tabular-nums text-[var(--muted)]">{formatClock(entry.occurred_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

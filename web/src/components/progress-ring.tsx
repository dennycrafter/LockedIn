"use client";

// Progress ring (SPEC 10 layout): a small ring next to "done/total" in plain
// text, so the number stays readable (it used to sit inside the ring at 8px).
// 0 items renders an empty ring, matching the 0% rule.

export function ProgressRing({
  percent,
  done,
  total,
  label,
}: {
  percent: number;
  done: number;
  total: number;
  label: string;
}) {
  const radius = 6.5;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return (
    <span
      role="img"
      aria-label={`${label}: ${clamped}% done, ${done} of ${total}`}
      title={`${clamped}% done`}
      className="inline-flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-[var(--muted)]"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90" aria-hidden>
        <circle cx="8" cy="8" r={radius} fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke={clamped === 100 ? "var(--ok)" : "var(--silver)"}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {done}/{total}
    </span>
  );
}

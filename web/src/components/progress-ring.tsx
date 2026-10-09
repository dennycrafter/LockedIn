"use client";

// Progress ring (SPEC 10 layout): small SVG ring with the percent inside.
// 0 items renders an empty ring, matching the 0% rule.

export function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);

  return (
    <span
      role="img"
      aria-label={`${label}: ${clamped}% done`}
      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 20 20" className="h-6 w-6 -rotate-90" aria-hidden>
        <circle cx="10" cy="10" r={radius} fill="none" stroke="var(--line)" strokeWidth="2" />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[8px] font-medium text-[var(--muted)]">{clamped}</span>
    </span>
  );
}

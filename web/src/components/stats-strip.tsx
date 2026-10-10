"use client";

// Stats strip (SPEC 8.16): one strip split by 1px lines, big Saira numbers.
// Everything is derived from today's rows plus the live session.
import type { InfractionData, ProjectData, SessionData } from "@/lib/dashboard-data";
import type { ExtensionSession } from "@/lib/extension-session";
import { formatFocusedMs } from "@/lib/time";

import { liveActiveSeconds } from "@/lib/live-active-seconds";

export function workTodaySeconds(
  sessions: SessionData[],
  liveSession: ExtensionSession | null,
  nowMs: number,
): number {
  const saved = sessions.reduce((sum, s) => sum + s.active_seconds, 0);
  const live = liveSession ? liveActiveSeconds(liveSession, nowMs) : 0;
  return saved + live;
}

export interface TopInfraction {
  label: string;
  count: number;
}

export function topInfraction(infractions: InfractionData[]): TopInfraction | null {
  const counts = new Map<string, number>();
  for (const infraction of infractions) {
    const prefix = infraction.kind === "site" ? "Blocked site: " : "Manual: ";
    const key = `${prefix}${infraction.detail}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: TopInfraction | null = null;
  for (const [label, count] of counts) {
    if (!best || count > best.count) best = { label, count };
  }
  return best;
}

export interface ProjectMinutes {
  name: string;
  minutes: number;
}

export function timeByProject(sessions: SessionData[], projects: ProjectData[]): ProjectMinutes[] {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const minutesByProject = new Map<string, number>();
  for (const session of sessions) {
    const key = session.project_id ?? "No project";
    minutesByProject.set(key, (minutesByProject.get(key) ?? 0) + session.active_seconds / 60);
  }
  return [...minutesByProject.entries()]
    .map(([id, minutes]) => ({
      name: names.get(id) ?? (id === "No project" ? "No project" : "Unknown project"),
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function Stat({ label, value, index }: { label: string; value: string; index: number }) {
  const secondCol = index % 2 === 1;
  const secondRow = index >= 2;
  return (
    <div
      className="min-w-0 px-4 py-3"
      style={{
        ...(secondCol ? { borderLeft: "1px solid var(--line)" } : {}),
        ...(secondRow ? { borderTop: "1px solid var(--line)" } : {}),
      }}
    >
      <div className="text-xs uppercase leading-snug tracking-wide text-[var(--muted)]">{label}</div>
      <div
        className="break-words text-2xl leading-tight text-[var(--fg)]"
        style={{ fontFamily: "var(--font-saira), ui-sans-serif, system-ui, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}

export function StatsStrip({
  sessions,
  infractions,
  projects,
  liveSession,
  nowMs,
}: {
  sessions: SessionData[];
  infractions: InfractionData[];
  projects: ProjectData[];
  liveSession: ExtensionSession | null;
  nowMs: number;
}) {
  const top = topInfraction(infractions);
  const byProject = timeByProject(sessions, projects);
  const maxMinutes = Math.max(1, ...byProject.map((p) => p.minutes));
  const stats: Array<{ label: string; value: string }> = [
    { label: "Work today", value: formatFocusedMs(workTodaySeconds(sessions, liveSession, nowMs) * 1000) },
    { label: "Sessions today", value: String(sessions.length) },
    { label: "Infractions today", value: String(infractions.length) },
    { label: "Top infraction", value: top ? `${top.label} (${top.count})` : "None yet" },
  ];

  return (
    <section aria-label="Today's stats">
      <div className="grid grid-cols-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]">
        {stats.map((stat, index) => (
          <Stat key={stat.label} label={stat.label} value={stat.value} index={index} />
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
        <h3 className="text-sm text-[var(--muted)]">Time by project (today)</h3>
        {byProject.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No sessions yet today.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {byProject.map((row) => (
              <li key={row.name} className="flex min-w-0 items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-[var(--fg)]">{row.name}</span>
                <span className="h-2 w-16 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                  <span
                    className="block h-full rounded-sm bg-[var(--muted)]"
                    style={{ width: `${Math.round((row.minutes / maxMinutes) * 100)}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right text-[var(--muted)]">
                  {Math.round(row.minutes)}m
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

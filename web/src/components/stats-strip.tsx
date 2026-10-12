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

const LABEL = "text-xs uppercase leading-snug tracking-wide text-[var(--muted)]";

// Big numbers use Saira (SPEC 10: display font only for digits).
function BigNumber({ value }: { value: string }) {
  return (
    <div
      className="mt-1 break-words leading-tight text-[var(--fg)]"
      style={{
        fontFamily: "var(--font-saira), ui-sans-serif, system-ui, sans-serif",
        fontSize: "1.875rem",
      }}
    >
      {value}
    </div>
  );
}

export function StatsStrip({
  sessions,
  infractions,
  projects,
  liveSession,
  nowMs,
  startSlot,
  reportsSlot,
}: {
  sessions: SessionData[];
  infractions: InfractionData[];
  projects: ProjectData[];
  liveSession: ExtensionSession | null;
  nowMs: number;
  /** The "Start working" button, shown under Work today. */
  startSlot?: React.ReactNode;
  /** The report buttons, shown in the Reports cell. */
  reportsSlot?: React.ReactNode;
}) {
  const top = topInfraction(infractions);
  const byProject = timeByProject(sessions, projects);
  const maxMinutes = Math.max(1, ...byProject.map((p) => p.minutes));
  const shown = byProject.slice(0, 3);
  const hidden = byProject.length - shown.length;

  // One strip split by 1px lines: the grid background is the line colour and
  // every cell paints its own surface on top, so the gap shows as a divider.
  const cell = "min-w-0 bg-[var(--surface)] px-5 py-4";

  return (
    <section aria-label="Today's stats">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] lg:grid-cols-[1.1fr_0.7fr_1fr_1.6fr_0.8fr]">
        <div className={`${cell} col-span-2 lg:col-span-1`}>
          <div className={LABEL}>Work today</div>
          <BigNumber value={formatFocusedMs(workTodaySeconds(sessions, liveSession, nowMs) * 1000)} />
          {startSlot ? <div className="mt-3">{startSlot}</div> : null}
        </div>

        <div className={cell}>
          <div className={LABEL}>Sessions</div>
          <BigNumber value={String(sessions.length)} />
        </div>

        <div className={cell}>
          <div className={LABEL}>Infractions today</div>
          <BigNumber value={String(infractions.length)} />
          <div className="mt-2 text-xs text-[var(--muted)]">
            Top infraction: <span className="text-[var(--fg)]">{top ? `${top.label} (${top.count})` : "None yet"}</span>
          </div>
        </div>

        <div className={`${cell} col-span-2 lg:col-span-1`}>
          <div className={LABEL}>Time by project (today)</div>
          {byProject.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No sessions yet today.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {shown.map((row) => (
                <li key={row.name} className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-[var(--fg)]">{row.name}</span>
                  <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                    <span
                      className="block h-full rounded-sm bg-[var(--muted)]"
                      style={{ width: `${Math.round((row.minutes / maxMinutes) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[var(--muted)]">{Math.round(row.minutes)}m</span>
                </li>
              ))}
              {hidden > 0 && <li className="text-xs text-[var(--muted)]">+{hidden} more</li>}
            </ul>
          )}
        </div>

        <div className={`${cell} col-span-2 lg:col-span-1`}>
          <div className={LABEL}>Reports</div>
          {reportsSlot ? <div className="mt-2">{reportsSlot}</div> : null}
        </div>
      </div>
    </section>
  );
}

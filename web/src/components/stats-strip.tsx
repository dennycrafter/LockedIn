"use client";

// Stats strip (SPEC 8.16): one strip split by 1px lines, big Saira numbers.
// Everything is derived from today's rows plus the live session.
import type { InfractionData, ProjectData, SessionData } from "@/lib/dashboard-data";
import type { ExtensionSession } from "@/lib/extension-session";
import { formatWorkToday } from "@/lib/ui-format";

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
    // The cell is already labelled Infractions, so the label is just the site or the note.
    const key = infraction.detail;
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

const LABEL = "text-xs font-medium uppercase tracking-wide text-[var(--muted)]";
const SUB = "mt-1.5 truncate text-[13px] text-[var(--muted)]";

// Big numbers use Saira (SPEC 10: display font only for digits).
function BigNumber({ value }: { value: string }) {
  return (
    <div
      className="mt-1 leading-tight text-[var(--fg)] tabular-nums"
      style={{
        fontFamily: "var(--font-saira), ui-sans-serif, system-ui, sans-serif",
        fontSize: "2rem",
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
}: {
  sessions: SessionData[];
  infractions: InfractionData[];
  projects: ProjectData[];
  liveSession: ExtensionSession | null;
  nowMs: number;
  /** The "Start working" button, shown under Work today. */
  startSlot?: React.ReactNode;
}) {
  const top = topInfraction(infractions);
  const byProject = timeByProject(sessions, projects);
  const maxMinutes = Math.max(1, ...byProject.map((p) => p.minutes));
  const shown = byProject.slice(0, 3);
  const hidden = byProject.length - shown.length;
  const savedSeconds = sessions.reduce((sum, s) => sum + s.active_seconds, 0);
  const average = sessions.length > 0 ? savedSeconds / sessions.length : 0;

  // One strip split by 1px lines: the grid background is the line colour and
  // every cell paints its own surface on top, so the gap shows as a divider.
  const cell = "min-w-0 bg-[var(--surface)] px-5 py-4";

  return (
    <section aria-label="Today's stats">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] lg:grid-cols-[1.25fr_0.8fr_0.9fr_1.8fr]">
        <div className={`${cell} col-span-2 flex flex-col lg:col-span-1`}>
          <div className={LABEL}>Work today</div>
          <BigNumber value={formatWorkToday(workTodaySeconds(sessions, liveSession, nowMs))} />
          {startSlot ? <div className="mt-3">{startSlot}</div> : liveSession ? <div className={SUB}>Includes the session running now</div> : null}
        </div>

        <div className={cell}>
          <div className={LABEL}>Sessions</div>
          <BigNumber value={String(sessions.length)} />
          {sessions.length > 0 && <div className={SUB}>Avg {formatWorkToday(average)}</div>}
        </div>

        <div className={cell}>
          <div className={LABEL}>Infractions</div>
          <BigNumber value={String(infractions.length)} />
          {top && (
            <div className={SUB} title={`${top.label} (${top.count})`}>
              Top: <span className="text-[var(--fg)]">{top.label}</span> ({top.count})
            </div>
          )}
        </div>

        <div className={`${cell} col-span-2 lg:col-span-1`}>
          <div className={LABEL}>Time by project</div>
          {byProject.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">No sessions yet today.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {shown.map((row) => (
                <li key={row.name} className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="w-[42%] min-w-0 shrink-0 truncate text-[var(--fg)]">{row.name}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                    <span
                      className="block h-full rounded-sm bg-[var(--silver)]"
                      style={{ width: `${Math.round((row.minutes / maxMinutes) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-[var(--muted)]">
                    {formatWorkToday(row.minutes * 60)}
                  </span>
                </li>
              ))}
              {hidden > 0 && <li className="text-[13px] text-[var(--muted)]">+{hidden} more</li>}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

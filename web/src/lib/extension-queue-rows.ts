// Client-side mirror of the extension's drained queue rows (SPEC 8.17
// drainQueue): field names match the extension protocol, not the database
// columns. The dashboard is the bridge between the two, so it maps rows to
// the persistence shape before POSTing /api/sync.
import type { ParsedInfractionRow, ParsedSessionRow } from "./sync-parse";

export interface DrainedSessionRow {
  id: string;
  projectId: string | null;
  taskId: string | null;
  miscTaskId: string | null;
  label: string;
  lockMode: "none" | "soft" | "hard";
  plannedSeconds: number;
  addedSeconds: number;
  activeSeconds: number;
  startedAt: string; // ISO
  endedAt: string; // ISO
}

export interface DrainedInfractionRow {
  id: string;
  sessionId: string | null;
  kind: "site" | "manual";
  detail: string;
  occurredAt: string; // ISO
}

export function toSessionRow(session: DrainedSessionRow): ParsedSessionRow {
  return {
    id: session.id,
    project_id: session.projectId,
    task_id: session.taskId,
    misc_task_id: session.miscTaskId,
    label: session.label,
    lock_mode: session.lockMode,
    planned_seconds: session.plannedSeconds,
    added_seconds: session.addedSeconds,
    active_seconds: session.activeSeconds,
    started_at: session.startedAt,
    ended_at: session.endedAt,
  };
}

export function toInfractionRow(infraction: DrainedInfractionRow): ParsedInfractionRow {
  return {
    id: infraction.id,
    session_id: infraction.sessionId,
    kind: infraction.kind,
    detail: infraction.detail,
    occurred_at: infraction.occurredAt,
  };
}

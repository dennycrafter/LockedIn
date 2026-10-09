// Strict parsers for the /api/sync body (SPEC 8.17 drainQueue shape): the
// dashboard saves what the extension drained. Nothing unvalidated reaches
// Supabase; session and infraction ids must be uuids because the database
// primary keys on them, and upserts ignore duplicates so replays are safe.

export interface ParsedSessionRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  misc_task_id: string | null;
  label: string;
  lock_mode: "none" | "soft" | "hard";
  planned_seconds: number;
  added_seconds: number;
  active_seconds: number;
  started_at: string;
  ended_at: string;
}

export interface ParsedInfractionRow {
  id: string;
  session_id: string | null;
  kind: "site" | "manual";
  detail: string;
  occurred_at: string;
}

// Right-click captures (SPEC 8.7): queued by the extension with source
// "page", flushed by the dashboard through this route.
export interface ParsedSnippetRow {
  id: string;
  owner_type: "project" | "task";
  owner_id: string;
  content: string;
  context: string;
  source: "manual" | "note" | "page" | "wind_down";
  created_at: string;
}

export interface ParsedSyncPayload {
  sessions: ParsedSessionRow[];
  infractions: ParsedInfractionRow[];
  snippets: ParsedSnippetRow[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_MODES = ["none", "soft", "hard"] as const;
const INFRACTION_KINDS = ["site", "manual"] as const;
const SNIPPET_OWNER_TYPES = ["project", "task"] as const;
const SNIPPET_SOURCES = ["manual", "note", "page", "wind_down"] as const;
const MAX_SNIPPET_CONTENT = 10_000;
const MAX_SNIPPET_CONTEXT = 2_000;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isUuidOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

/** Returns null instead of throwing: a bad batch is rejected, not crashed. */
export function parseSyncPayload(body: unknown): ParsedSyncPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  if (raw.sessions === undefined || raw.infractions === undefined) return null;
  if (!Array.isArray(raw.sessions) || !Array.isArray(raw.infractions)) return null;
  // Snippets arrived with the right-click capture (T4); older callers omit
  // them, but a present-but-not-array value is still malformed.
  if (raw.snippets !== undefined && !Array.isArray(raw.snippets)) return null;

  const sessions: ParsedSessionRow[] = [];
  for (const item of raw.sessions) {
    if (typeof item !== "object" || item === null) return null;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || !UUID_PATTERN.test(s.id)) return null;
    const lockMode = s.lock_mode;
    if (typeof lockMode !== "string" || !LOCK_MODES.includes(lockMode as never)) return null;
    const planned = s.planned_seconds;
    const active = s.active_seconds;
    const added = s.added_seconds;
    if (typeof planned !== "number" || !Number.isInteger(planned) || planned < 0) return null;
    if (typeof active !== "number" || !Number.isInteger(active) || active < 0) return null;
    if (typeof added !== "number" || !Number.isInteger(added) || added < 0) return null;
    if (!isIsoTimestamp(s.started_at) || !isIsoTimestamp(s.ended_at)) return null;
    if (!isUuidOrNull(s.project_id) || !isUuidOrNull(s.task_id) || !isUuidOrNull(s.misc_task_id)) {
      return null;
    }
    sessions.push({
      id: s.id,
      project_id: typeof s.project_id === "string" ? s.project_id : null,
      task_id: typeof s.task_id === "string" ? s.task_id : null,
      misc_task_id: typeof s.misc_task_id === "string" ? s.misc_task_id : null,
      label: typeof s.label === "string" ? s.label.slice(0, 200) : "",
      lock_mode: lockMode as ParsedSessionRow["lock_mode"],
      planned_seconds: planned,
      added_seconds: added,
      active_seconds: active,
      started_at: s.started_at,
      ended_at: s.ended_at,
    });
  }

  const infractions: ParsedInfractionRow[] = [];
  for (const item of raw.infractions) {
    if (typeof item !== "object" || item === null) return null;
    const f = item as Record<string, unknown>;
    if (typeof f.id !== "string" || !UUID_PATTERN.test(f.id)) return null;
    const kind = f.kind;
    if (typeof kind !== "string" || !INFRACTION_KINDS.includes(kind as never)) return null;
    if (typeof f.detail !== "string" || f.detail.length === 0 || f.detail.length > 300) return null;
    if (!isIsoTimestamp(f.occurred_at)) return null;
    if (!isUuidOrNull(f.session_id)) return null;
    infractions.push({
      id: f.id,
      session_id: typeof f.session_id === "string" ? f.session_id : null,
      kind: kind as ParsedInfractionRow["kind"],
      detail: f.detail,
      occurred_at: f.occurred_at,
    });
  }

  const snippets: ParsedSnippetRow[] = [];
  for (const item of raw.snippets ?? []) {
    if (typeof item !== "object" || item === null) return null;
    const n = item as Record<string, unknown>;
    if (typeof n.id !== "string" || !UUID_PATTERN.test(n.id)) return null;
    const ownerType = n.owner_type;
    if (typeof ownerType !== "string" || !SNIPPET_OWNER_TYPES.includes(ownerType as never)) return null;
    if (typeof n.owner_id !== "string" || !UUID_PATTERN.test(n.owner_id)) return null;
    if (typeof n.content !== "string" || n.content.length === 0 || n.content.length > MAX_SNIPPET_CONTENT) {
      return null;
    }
    if (typeof n.context !== "string" || n.context.length > MAX_SNIPPET_CONTEXT) return null;
    const source = n.source;
    if (typeof source !== "string" || !SNIPPET_SOURCES.includes(source as never)) return null;
    if (!isIsoTimestamp(n.created_at)) return null;
    snippets.push({
      id: n.id,
      owner_type: ownerType as ParsedSnippetRow["owner_type"],
      owner_id: n.owner_id,
      content: n.content,
      context: n.context,
      source: source as ParsedSnippetRow["source"],
      created_at: n.created_at,
    });
  }

  return { sessions, infractions, snippets };
}

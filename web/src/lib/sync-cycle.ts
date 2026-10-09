// One sync pass (SPEC 8.17): drain the extension queue, map the rows from the
// extension protocol shape to the persistence shape, save through /api/sync,
// and only ack ids the server confirmed. A failure anywhere keeps the queue
// intact for the next cycle, so nothing is ever lost or duplicated.
import { callExtension } from "@/lib/bridge-client";
import {
  type DrainedInfractionRow,
  type DrainedSessionRow,
  type DrainedSnippetRow,
  type DrainedTimeStudyRow,
  toInfractionRow,
  toSessionRow,
  toSnippetRow,
  toTimeStudyRow,
} from "@/lib/extension-queue-rows";

export interface SyncCycleResult {
  ok: boolean;
  savedSessions: number;
  savedInfractions: number;
  savedSnippets: number;
  savedTimeStudies: number;
  error?: string;
}

interface DrainedItem {
  id?: unknown;
}

function collectIds(items: unknown[]): string[] {
  return items
    .filter((item): item is { id: string } => {
      return typeof item === "object" && item !== null && typeof (item as DrainedItem).id === "string";
    })
    .map((item) => item.id);
}

export async function runSyncCycle(): Promise<SyncCycleResult> {
  const drained = await callExtension("drainQueue");
  if (!drained.ok) {
    return {
      ok: false,
      savedSessions: 0,
      savedInfractions: 0,
      savedSnippets: 0,
      savedTimeStudies: 0,
      error: drained.error,
    };
  }
  const data = (drained.data ?? {}) as {
    sessions?: unknown;
    infractions?: unknown;
    snippets?: unknown;
    timeStudies?: unknown;
  };
  // The extension speaks its own protocol shape (mirror types below); the
  // server re-validates every field strictly, so a malformed row is rejected
  // with a 400 and the queue is preserved.
  const sessions = Array.isArray(data.sessions) ? (data.sessions as DrainedSessionRow[]) : [];
  const infractions = Array.isArray(data.infractions) ? (data.infractions as DrainedInfractionRow[]) : [];
  const snippets = Array.isArray(data.snippets) ? (data.snippets as DrainedSnippetRow[]) : [];
  const timeStudies = Array.isArray(data.timeStudies) ? (data.timeStudies as DrainedTimeStudyRow[]) : [];
  if (sessions.length === 0 && infractions.length === 0 && snippets.length === 0 && timeStudies.length === 0) {
    return { ok: true, savedSessions: 0, savedInfractions: 0, savedSnippets: 0, savedTimeStudies: 0 };
  }

  // Callers run this cycle with `void runSyncCycle()`, so a fetch rejection
  // here (offline blip, aborted request) would escape as an unhandled promise
  // rejection. Catch it and report through the normal { ok: false } shape;
  // the queue stays intact and the next cycle retries.
  let response: Response;
  try {
    response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: sessions.map(toSessionRow),
        infractions: infractions.map(toInfractionRow),
        snippets: snippets.map(toSnippetRow),
        time_studies: timeStudies.map(toTimeStudyRow),
      }),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      savedSessions: 0,
      savedInfractions: 0,
      savedSnippets: 0,
      savedTimeStudies: 0,
      error: `Saving the queue failed. ${message}`.slice(0, 300),
    };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      savedSessions: 0,
      savedInfractions: 0,
      savedSnippets: 0,
      savedTimeStudies: 0,
      error: `Saving the queue failed (${response.status}). ${text}`.slice(0, 300),
    };
  }

  const ack = await callExtension("ackQueue", {
    ids: [...collectIds(sessions), ...collectIds(infractions), ...collectIds(snippets), ...collectIds(timeStudies)],
  });
  if (!ack.ok) {
    return {
      ok: false,
      savedSessions: 0,
      savedInfractions: 0,
      savedSnippets: 0,
      savedTimeStudies: 0,
      error: ack.error,
    };
  }
  return {
    ok: true,
    savedSessions: sessions.length,
    savedInfractions: infractions.length,
    savedSnippets: snippets.length,
    savedTimeStudies: timeStudies.length,
  };
}

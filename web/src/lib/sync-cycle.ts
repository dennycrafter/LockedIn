// One sync pass (SPEC 8.17): drain the extension queue, map the rows from the
// extension protocol shape to the persistence shape, save through /api/sync,
// and only ack ids the server confirmed. A failure anywhere keeps the queue
// intact for the next cycle, so nothing is ever lost or duplicated.
import { callExtension } from "@/lib/bridge-client";
import {
  type DrainedInfractionRow,
  type DrainedSessionRow,
  toInfractionRow,
  toSessionRow,
} from "@/lib/extension-queue-rows";

export interface SyncCycleResult {
  ok: boolean;
  savedSessions: number;
  savedInfractions: number;
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
    return { ok: false, savedSessions: 0, savedInfractions: 0, error: drained.error };
  }
  const data = (drained.data ?? {}) as { sessions?: unknown; infractions?: unknown };
  // The extension speaks its own protocol shape (mirror types below); the
  // server re-validates every field strictly, so a malformed row is rejected
  // with a 400 and the queue is preserved.
  const sessions = Array.isArray(data.sessions) ? (data.sessions as DrainedSessionRow[]) : [];
  const infractions = Array.isArray(data.infractions) ? (data.infractions as DrainedInfractionRow[]) : [];
  if (sessions.length === 0 && infractions.length === 0) {
    return { ok: true, savedSessions: 0, savedInfractions: 0 };
  }

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessions: sessions.map(toSessionRow),
      infractions: infractions.map(toInfractionRow),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      savedSessions: 0,
      savedInfractions: 0,
      error: `Saving the queue failed (${response.status}). ${text}`.slice(0, 300),
    };
  }

  const ack = await callExtension("ackQueue", {
    ids: [...collectIds(sessions), ...collectIds(infractions)],
  });
  if (!ack.ok) {
    return { ok: false, savedSessions: 0, savedInfractions: 0, error: ack.error };
  }
  return { ok: true, savedSessions: sessions.length, savedInfractions: infractions.length };
}

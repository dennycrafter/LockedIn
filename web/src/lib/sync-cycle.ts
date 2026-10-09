// One sync pass (SPEC 8.17): drain the extension queue, save through
// /api/sync, and only ack ids the server confirmed. A failure anywhere keeps
// the queue intact for the next cycle, so nothing is ever lost or duplicated.
import { callExtension } from "@/lib/bridge-client";

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
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const infractions = Array.isArray(data.infractions) ? data.infractions : [];
  if (sessions.length === 0 && infractions.length === 0) {
    return { ok: true, savedSessions: 0, savedInfractions: 0 };
  }

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessions, infractions }),
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

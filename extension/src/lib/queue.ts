import type { CompletedSession } from "./session";

// Queue-then-ack contract (SPEC 8.17, gotcha in SPEC 12): drain hands out a
// copy of everything queued and changes nothing; ack removes exactly the ids
// the dashboard confirmed were saved. Nothing is deleted before that.

export interface QueuedInfraction {
  id: string;
  sessionId: string | null;
  kind: "site" | "manual";
  detail: string;
  occurredAt: string; // ISO
}

export interface QueueState {
  sessions: CompletedSession[];
  infractions: QueuedInfraction[];
}

export function emptyQueue(): QueueState {
  return { sessions: [], infractions: [] };
}

export function enqueueSession(queue: QueueState, session: CompletedSession): QueueState {
  // Idempotent by id: a race that ends one session twice must not queue twice.
  if (queue.sessions.some((s) => s.id === session.id)) return queue;
  return { sessions: [...queue.sessions, session], infractions: queue.infractions };
}

export function enqueueInfraction(queue: QueueState, infraction: QueuedInfraction): QueueState {
  if (queue.infractions.some((i) => i.id === infraction.id)) return queue;
  return { sessions: queue.sessions, infractions: [...queue.infractions, infraction] };
}

/** Idempotent read: draining twice without an ack hands out the same items. */
export function drainQueue(queue: QueueState): QueueState {
  return { sessions: [...queue.sessions], infractions: [...queue.infractions] };
}

/** Remove exactly the acknowledged ids across both collections. */
export function ackQueue(queue: QueueState, ids: string[]): QueueState {
  const acked = new Set(ids);
  return {
    sessions: queue.sessions.filter((s) => !acked.has(s.id)),
    infractions: queue.infractions.filter((i) => !acked.has(i.id)),
  };
}

export function queueIds(queue: QueueState): string[] {
  return [...queue.sessions.map((s) => s.id), ...queue.infractions.map((i) => i.id)];
}

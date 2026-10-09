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

// A right-click capture (SPEC 8.7): selected page text queued with source
// "page" and the page URL appended to the context, flushed by the dashboard.
export interface QueuedSnippet {
  id: string;
  ownerType: "project" | "task";
  ownerId: string;
  content: string;
  context: string;
  source: "page";
  createdAt: string; // ISO
}

export interface QueuedTimeStudy {
  id: string;
  text: string;
  occurredAt: string; // ISO
}

export interface QueueState {
  sessions: CompletedSession[];
  infractions: QueuedInfraction[];
  snippets: QueuedSnippet[];
  timeStudies: QueuedTimeStudy[];
}

export function emptyQueue(): QueueState {
  return { sessions: [], infractions: [], snippets: [], timeStudies: [] };
}

export function enqueueSession(queue: QueueState, session: CompletedSession): QueueState {
  // Idempotent by id: a race that ends one session twice must not queue twice.
  if (queue.sessions.some((s) => s.id === session.id)) return queue;
  return {
    sessions: [...queue.sessions, session],
    infractions: queue.infractions,
    snippets: queue.snippets,
    timeStudies: queue.timeStudies,
  };
}

export function enqueueInfraction(queue: QueueState, infraction: QueuedInfraction): QueueState {
  if (queue.infractions.some((i) => i.id === infraction.id)) return queue;
  return {
    sessions: queue.sessions,
    infractions: [...queue.infractions, infraction],
    snippets: queue.snippets,
    timeStudies: queue.timeStudies,
  };
}

export function enqueueSnippet(queue: QueueState, snippet: QueuedSnippet): QueueState {
  if (queue.snippets.some((s) => s.id === snippet.id)) return queue;
  return {
    sessions: queue.sessions,
    infractions: queue.infractions,
    snippets: [...queue.snippets, snippet],
    timeStudies: queue.timeStudies,
  };
}

export function enqueueTimeStudy(queue: QueueState, entry: QueuedTimeStudy): QueueState {
  if (queue.timeStudies.some((t) => t.id === entry.id)) return queue;
  return {
    sessions: queue.sessions,
    infractions: queue.infractions,
    snippets: queue.snippets,
    timeStudies: [...queue.timeStudies, entry],
  };
}

/** Idempotent read: draining twice without an ack hands out the same items. */
export function drainQueue(queue: QueueState): QueueState {
  return {
    sessions: [...queue.sessions],
    infractions: [...queue.infractions],
    snippets: [...queue.snippets],
    timeStudies: [...queue.timeStudies],
  };
}

/** Remove exactly the acknowledged ids across all collections. */
export function ackQueue(queue: QueueState, ids: string[]): QueueState {
  const acked = new Set(ids);
  return {
    sessions: queue.sessions.filter((s) => !acked.has(s.id)),
    infractions: queue.infractions.filter((i) => !acked.has(i.id)),
    snippets: queue.snippets.filter((s) => !acked.has(s.id)),
    timeStudies: queue.timeStudies.filter((t) => !acked.has(t.id)),
  };
}

export function queueIds(queue: QueueState): string[] {
  return [
    ...queue.sessions.map((s) => s.id),
    ...queue.infractions.map((i) => i.id),
    ...queue.snippets.map((s) => s.id),
    ...queue.timeStudies.map((t) => t.id),
  ];
}

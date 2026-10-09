import { describe, expect, it } from "vitest";
import {
  ackQueue,
  drainQueue,
  enqueueInfraction,
  enqueueSession,
  emptyQueue,
  queueIds,
  type QueueState,
} from "./queue";
import type { CompletedSession } from "./session";

function session(id: string): CompletedSession {
  return {
    id,
    projectId: null,
    taskId: null,
    miscTaskId: null,
    label: "",
    lockMode: "hard",
    plannedSeconds: 60,
    addedSeconds: 0,
    activeSeconds: 60,
    startedAt: "2026-10-09T15:00:00.000Z",
    endedAt: "2026-10-09T15:01:00.000Z",
  };
}

function infraction(id: string, sessionId: string | null = null) {
  return { id, sessionId, kind: "site" as const, detail: "youtube.com", occurredAt: "2026-10-09T15:00:30.000Z" };
}

function stateWith(): QueueState {
  return enqueueInfraction(
    enqueueSession(enqueueSession(emptyQueue(), session("s-1")), session("s-2")),
    infraction("i-1"),
  );
}

describe("drain and ack idempotency", () => {
  it("drain returns everything queued without removing it", () => {
    const queue = stateWith();
    const first = drainQueue(queue);
    const second = drainQueue(queue);
    expect(queueIds(first)).toEqual(["s-1", "s-2", "i-1"]);
    expect(queueIds(second)).toEqual(["s-1", "s-2", "i-1"]);
    // The queue still holds every item: nothing is deleted before the ack.
    expect(queueIds(queue)).toEqual(["s-1", "s-2", "i-1"]);
  });

  it("double drain after the ack returns nothing new", () => {
    let queue = stateWith();
    const drained = drainQueue(queue);
    queue = ackQueue(queue, queueIds(drained));
    expect(queueIds(drainQueue(queue))).toEqual([]);
    expect(queueIds(drainQueue(queue))).toEqual([]);
  });

  it("a partial ack keeps the rest queued for the next drain", () => {
    let queue = stateWith();
    queue = ackQueue(queue, ["s-1"]);
    expect(queueIds(drainQueue(queue))).toEqual(["s-2", "i-1"]);
  });

  it("a failed sync leaves the queue intact when nothing is acked", () => {
    let queue = stateWith();
    drainQueue(queue); // dashboard took a copy, sync failed, no ack
    expect(queueIds(queue)).toEqual(["s-1", "s-2", "i-1"]);
  });

  it("acks unknown or repeated ids safely", () => {
    const queue = stateWith();
    expect(queueIds(ackQueue(queue, ["missing"]))).toEqual(["s-1", "s-2", "i-1"]);
    expect(queueIds(ackQueue(ackQueue(queue, ["s-1"]), ["s-1"]))).toEqual(["s-2", "i-1"]);
    expect(queueIds(ackQueue(queue, []))).toEqual(["s-1", "s-2", "i-1"]);
  });
});

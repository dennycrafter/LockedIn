import { describe, expect, it } from "vitest";
import {
  ackQueue,
  drainQueue,
  enqueueInfraction,
  enqueueSession,
  enqueueTimeStudy,
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

describe("time study queue (SPEC 8.11)", () => {
  const answer = { id: "ts-1", text: "Writing the T5 PR", occurredAt: "2026-10-09T15:05:00.000Z" };

  it("enqueues answers idempotently and drains them with the rest", () => {
    const queue = enqueueTimeStudy(enqueueTimeStudy(emptyQueue(), answer), answer);
    expect(queue.timeStudies).toHaveLength(1);
    const drained = drainQueue(queue);
    expect(drained.timeStudies).toEqual([answer]);
    // Draining changes nothing.
    expect(queueIds(queue)).toEqual(["ts-1"]);
  });

  it("answers survive a failed save and leave only after the ack", () => {
    let queue = enqueueTimeStudy(emptyQueue(), answer);
    const drained = drainQueue(queue);
    // A failed save acks nothing: the answer is still queued.
    expect(queueIds(queue)).toEqual(["ts-1"]);
    queue = ackQueue(queue, drained.timeStudies.map((t) => t.id));
    expect(queue.timeStudies).toEqual([]);
  });

  it("an ack of one kind leaves the others queued", () => {
    const queue = enqueueTimeStudy(stateWith(), answer);
    const acked = ackQueue(queue, ["ts-1"]);
    expect(acked.timeStudies).toEqual([]);
    expect(acked.sessions).toHaveLength(2);
    expect(acked.infractions).toHaveLength(1);
    expect(queueIds(acked)).toEqual(["s-1", "s-2", "i-1"]);
  });
});

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

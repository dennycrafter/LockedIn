// Unit tests for the drained-row mappers: the extension protocol shape must
// land exactly in the persistence shape the strict /api/sync parser accepts.
import { describe, expect, it } from "vitest";
import { toInfractionRow, toSessionRow } from "./extension-queue-rows";
import { parseSyncPayload } from "./sync-parse";

// Field names copied from the extension's CompletedSession (lib/session.ts).
const drainedSession = {
  id: "0185c3fa-411d-4f10-97c4-2f63262c81d1",
  projectId: "df94cd5f-b604-45d9-ab98-9b6f76a5c98f",
  taskId: "7e5c2aae-aacc-4ffb-be4e-1d0b251f0cd0",
  miscTaskId: null,
  label: "Write intro",
  lockMode: "hard" as const,
  plannedSeconds: 300,
  addedSeconds: 0,
  activeSeconds: 295,
  startedAt: "2026-10-09T21:41:16.449Z",
  endedAt: "2026-10-09T21:42:16.449Z",
};

const drainedInfraction = {
  id: "3948b1ed-096b-45ec-b966-68cc08b846fd",
  sessionId: "0185c3fa-411d-4f10-97c4-2f63262c81d1",
  kind: "site" as const,
  detail: "youtube.com",
  occurredAt: "2026-10-09T21:41:20.000Z",
};

describe("toSessionRow", () => {
  it("maps the extension protocol fields to the database columns", () => {
    const row = toSessionRow(drainedSession);
    expect(row).toEqual({
      id: drainedSession.id,
      project_id: drainedSession.projectId,
      task_id: drainedSession.taskId,
      misc_task_id: null,
      label: "Write intro",
      lock_mode: "hard",
      planned_seconds: 300,
      added_seconds: 0,
      active_seconds: 295,
      started_at: drainedSession.startedAt,
      ended_at: drainedSession.endedAt,
    });
  });

  it("round-trips through the strict sync parser", () => {
    const parsed = parseSyncPayload({ sessions: [toSessionRow(drainedSession)], infractions: [] });
    expect(parsed).not.toBeNull();
    expect(parsed?.sessions).toHaveLength(1);
  });
});

describe("toInfractionRow", () => {
  it("maps the extension protocol fields to the database columns", () => {
    const row = toInfractionRow(drainedInfraction);
    expect(row).toEqual({
      id: drainedInfraction.id,
      session_id: drainedInfraction.sessionId,
      kind: "site",
      detail: "youtube.com",
      occurred_at: drainedInfraction.occurredAt,
    });
  });

  it("round-trips a sessionless infraction through the strict sync parser", () => {
    const sessionless = { ...drainedInfraction, sessionId: null };
    const parsed = parseSyncPayload({ sessions: [], infractions: [toInfractionRow(sessionless)] });
    expect(parsed).not.toBeNull();
    expect(parsed?.infractions[0]?.session_id).toBeNull();
  });
});

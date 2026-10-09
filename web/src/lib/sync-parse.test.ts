// Parser tests: valid batches pass, every malformed field is rejected (the
// route answers 400 and the queue stays queued for a later retry).
import { describe, expect, it } from "vitest";
import { parseSyncPayload } from "./sync-parse";

const SESSION_ID = "0b9e6c1e-0000-4000-8000-000000000001";
const TASK_ID = "0b9e6c1e-0000-4000-8000-0000000000bb";
const SNIPPET_ID = "0b9e6c1e-0000-4000-8000-0000000000cc";

// Field mutators for the malformed-field cases; the casts live here so each
// case reads as one line.
function firstSession(body: Record<string, unknown>): Record<string, unknown> {
  return (body.sessions as Record<string, unknown>[])[0];
}

function firstInfraction(body: Record<string, unknown>): Record<string, unknown> {
  return (body.infractions as Record<string, unknown>[])[0];
}

function firstSnippet(body: Record<string, unknown>): Record<string, unknown> {
  return (body.snippets as Record<string, unknown>[])[0];
}

function validBody(): Record<string, unknown> {
  return {
    sessions: [
      {
        id: SESSION_ID,
        project_id: null,
        task_id: TASK_ID,
        misc_task_id: null,
        label: "Write intro",
        lock_mode: "hard",
        planned_seconds: 60,
        added_seconds: 0,
        active_seconds: 60,
        started_at: "2026-10-09T14:00:00.000Z",
        ended_at: "2026-10-09T14:01:00.000Z",
      },
    ],
    infractions: [
      {
        id: "0b9e6c1e-0000-4000-8000-000000000002",
        session_id: SESSION_ID,
        kind: "site",
        detail: "youtube.com",
        occurred_at: "2026-10-09T14:00:30.000Z",
      },
    ],
    snippets: [
      {
        id: SNIPPET_ID,
        owner_type: "task",
        owner_id: TASK_ID,
        content: "Pricing ships in v2.",
        context: "Customer ask\nhttps://example.com/pricing-faq",
        source: "page",
        created_at: "2026-10-09T15:00:00.000Z",
      },
    ],
  };
}

describe("parseSyncPayload", () => {
  it("accepts a valid batch and maps to snake_case rows", () => {
    const parsed = parseSyncPayload(validBody());
    expect(parsed).not.toBeNull();
    expect(parsed?.sessions).toHaveLength(1);
    expect(parsed?.sessions[0]).toMatchObject({
      id: SESSION_ID,
      task_id: TASK_ID,
      lock_mode: "hard",
      active_seconds: 60,
    });
    expect(parsed?.infractions[0]).toMatchObject({
      session_id: SESSION_ID,
      kind: "site",
      detail: "youtube.com",
    });
    expect(parsed?.snippets[0]).toMatchObject({
      id: SNIPPET_ID,
      owner_type: "task",
      owner_id: TASK_ID,
      source: "page",
    });
  });

  it("accepts an empty batch", () => {
    expect(parseSyncPayload({ sessions: [], infractions: [] })).toEqual({
      sessions: [],
      infractions: [],
      snippets: [],
    });
  });

  it("accepts a payload without snippets and defaults them to empty", () => {
    const body = validBody();
    delete body.snippets;
    const parsed = parseSyncPayload(body);
    expect(parsed).not.toBeNull();
    expect(parsed?.snippets).toEqual([]);
  });

  it("rejects malformed snippet fields", () => {
    const cases: Array<(body: Record<string, unknown>) => void> = [
      (body) => {
        firstSnippet(body).id = "not-a-uuid";
      },
      (body) => {
        firstSnippet(body).owner_type = "note";
      },
      (body) => {
        firstSnippet(body).owner_id = "also-not-a-uuid";
      },
      (body) => {
        firstSnippet(body).content = "";
      },
      (body) => {
        firstSnippet(body).content = "x".repeat(10_001);
      },
      (body) => {
        firstSnippet(body).context = 7;
      },
      (body) => {
        firstSnippet(body).source = "page2";
      },
      (body) => {
        firstSnippet(body).created_at = "soon";
      },
    ];
    for (const mutate of cases) {
      const body = validBody();
      mutate(body);
      expect(parseSyncPayload(body)).toBeNull();
    }
  });

  it("rejects non-uuid ids and malformed fields", () => {
    const cases: Array<(body: Record<string, unknown>) => void> = [
      (body) => {
        firstSession(body).id = "not-a-uuid";
      },
      (body) => {
        firstSession(body).lock_mode = "extreme";
      },
      (body) => {
        firstSession(body).active_seconds = -5;
      },
      (body) => {
        firstSession(body).active_seconds = 1.5;
      },
      (body) => {
        firstSession(body).started_at = "yesterday";
      },
      (body) => {
        firstSession(body).task_id = "also-not-a-uuid";
      },
      (body) => {
        firstInfraction(body).kind = "phone";
      },
      (body) => {
        firstInfraction(body).detail = "";
      },
      (body) => {
        firstInfraction(body).occurred_at = 42;
      },
    ];
    for (const mutate of cases) {
      const body = validBody();
      mutate(body);
      expect(parseSyncPayload(body)).toBeNull();
    }
  });

  it("rejects structurally wrong payloads", () => {
    expect(parseSyncPayload(null)).toBeNull();
    expect(parseSyncPayload("sessions")).toBeNull();
    expect(parseSyncPayload({})).toBeNull();
    expect(parseSyncPayload({ sessions: "all", infractions: [] })).toBeNull();
    expect(parseSyncPayload({ sessions: [null], infractions: [] })).toBeNull();
  });
});

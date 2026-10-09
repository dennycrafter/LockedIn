import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RESEND_EMAIL_URL, parseEodEdits, sendEodReport, type EodSendDeps } from "./eod-send";

const EMAIL = {
  subject: "LockedIn EOD: Fri 9 Oct, 3h 20m focused",
  html: "<p>report</p>",
  text: "report",
};

type FetchCall = { url: string; init: RequestInit };

function makeDeps(overrides: Partial<EodSendDeps> = {}) {
  const upserts: { table: string; payload: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>) => {
        upserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;

  const deps: EodSendDeps = {
    client,
    env: {
      resendApiKey: "re_test_123",
      reportToEmail: "boss@example.com",
      reportFromEmail: "LockedIn <onboarding@resend.dev>",
    },
    email: EMAIL,
    todayIso: "2026-10-09",
    ...overrides,
  };
  return { deps, upserts };
}

function fetchStub(status: number, body: unknown, calls: FetchCall[]): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("sendEodReport", () => {
  it("posts the email to Resend per SPEC 7.2 and saves eod_sent_at", async () => {
    const calls: FetchCall[] = [];
    const { deps, upserts } = makeDeps({ fetchImpl: fetchStub(200, { id: "abc" }, calls) });
    const result = await sendEodReport(deps);
    expect(result).toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RESEND_EMAIL_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_123");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(calls[0].init.body)) as {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    };
    expect(body.from).toBe("LockedIn <onboarding@resend.dev>");
    expect(body.to).toEqual(["boss@example.com"]);
    expect(body.subject).toBe(EMAIL.subject);
    expect(body.html).toBe(EMAIL.html);
    expect(body.text).toBe(EMAIL.text);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("day_reviews");
    expect(upserts[0].payload).toMatchObject({ review_date: "2026-10-09" });
    const savedAt = upserts[0].payload.eod_sent_at as string;
    expect(typeof savedAt).toBe("string");
    expect(Number.isNaN(new Date(savedAt).getTime())).toBe(false);
  });

  it("fails without calling Resend when the key is missing", async () => {
    const calls: FetchCall[] = [];
    const { deps, upserts } = makeDeps({
      env: { resendApiKey: undefined, reportToEmail: "boss@example.com", reportFromEmail: undefined },
      fetchImpl: fetchStub(200, { id: "abc" }, calls),
    });
    const result = await sendEodReport(deps);
    expect(result).toEqual({ ok: false, error: "RESEND_API_KEY is not set" });
    expect(calls).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it("fails without calling Resend when the recipient is missing", async () => {
    const calls: FetchCall[] = [];
    const { deps, upserts } = makeDeps({
      env: { resendApiKey: "re_test_123", reportToEmail: undefined, reportFromEmail: undefined },
      fetchImpl: fetchStub(200, { id: "abc" }, calls),
    });
    const result = await sendEodReport(deps);
    expect(result).toEqual({ ok: false, error: "REPORT_TO_EMAIL is not set" });
    expect(calls).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it("surfaces the Resend error text and skips eod_sent_at", async () => {
    const calls: FetchCall[] = [];
    const { deps, upserts } = makeDeps({
      fetchImpl: fetchStub(
        403,
        { name: "validation_error", message: "You can only send testing emails to your own email address" },
        calls,
      ),
    });
    const result = await sendEodReport(deps);
    expect(result).toEqual({
      ok: false,
      error: "You can only send testing emails to your own email address",
    });
    expect(upserts).toHaveLength(0);
  });

  it("falls back to an HTTP status when Resend sends no message", async () => {
    const calls: FetchCall[] = [];
    const { deps } = makeDeps({ fetchImpl: fetchStub(500, {}, calls) });
    const result = await sendEodReport(deps);
    expect(result).toEqual({ ok: false, error: "Resend returned HTTP 500" });
  });

  it("catches network failures as an error result", async () => {
    const { deps, upserts } = makeDeps({
      fetchImpl: vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.resend.com");
      }) as unknown as typeof fetch,
    });
    const result = await sendEodReport(deps);
    expect(result).toEqual({ ok: false, error: "getaddrinfo ENOTFOUND api.resend.com" });
    expect(upserts).toHaveLength(0);
  });

  it("reports a failure when eod_sent_at cannot be saved", async () => {
    const calls: FetchCall[] = [];
    const client = {
      from: () => ({
        upsert: () => Promise.resolve({ error: { message: "permission denied for table day_reviews" } }),
      }),
    } as unknown as SupabaseClient;
    const { deps } = makeDeps({ fetchImpl: fetchStub(200, { id: "abc" }, calls), client });
    const result = await sendEodReport(deps);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("saving eod_sent_at failed");
  });
});

describe("parseEodEdits", () => {
  it("accepts string edits", () => {
    expect(parseEodEdits({ doneToday: "a", learned: "b" })).toEqual({
      ok: true,
      edits: { doneToday: "a", learned: "b" },
    });
  });

  it("defaults missing fields to empty strings", () => {
    expect(parseEodEdits({})).toEqual({ ok: true, edits: { doneToday: "", learned: "" } });
  });

  it("rejects non-string and non-object bodies", () => {
    expect(parseEodEdits({ doneToday: 5 }).ok).toBe(false);
    expect(parseEodEdits({ learned: [] }).ok).toBe(false);
    expect(parseEodEdits("nope").ok).toBe(false);
    expect(parseEodEdits(null).ok).toBe(false);
    expect(parseEodEdits([1]).ok).toBe(false);
  });
});

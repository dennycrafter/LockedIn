import { describe, expect, it } from "vitest";
import {
  buildEodEmail,
  eodSubject,
  formatChicagoTime,
  formatFocusedDuration,
  getEodContext,
  groupTimeByTask,
  infractionLabel,
  totalFocusedSeconds,
  yesNoAnswer,
  type EodDayData,
} from "./eod-report";

// Friday 9 Oct 2026, 1:00pm CDT (America/Chicago is UTC-5 in October).
const NOW_OCT = new Date("2026-10-09T18:00:00.000Z");

function richData(): EodDayData {
  return {
    sessions: [
      { activeSeconds: 4800, startedAt: "2026-10-09T14:00:00.000Z", label: "Write intro" },
      { activeSeconds: 6000, startedAt: "2026-10-09T16:00:00.000Z", label: "Side project" },
      { activeSeconds: 1200, startedAt: "2026-10-09T17:00:00.000Z", label: "Misc: Water the plants" },
    ],
    infractions: [
      { kind: "site", detail: "youtube.com", occurredAt: "2026-10-09T16:00:00.000Z" },
      { kind: "manual", detail: "phone", occurredAt: "2026-10-09T16:30:00.000Z" },
    ],
    timeStudies: [
      { text: "Writing the intro", occurredAt: "2026-10-09T15:30:00.000Z" },
      { text: "Coffee chat", occurredAt: "2026-10-09T20:15:00.000Z" },
    ],
    review: {
      doneToday: "Shipped the intro draft",
      learned: "Old learned text is replaced by the edit",
      finishedGoal: true,
      bestUse: false,
      bestUseNote: "Too many meetings",
    },
    plan: {
      startTime: "8am",
      location: "Home desk",
      tasks: ["Write intro", "Book flights"],
    },
  };
}

describe("getEodContext", () => {
  it("builds Chicago day bounds during daylight saving time", () => {
    const ctx = getEodContext(NOW_OCT);
    expect(ctx.dateLabel).toBe("Fri 9 Oct");
    expect(ctx.todayIso).toBe("2026-10-09");
    expect(ctx.tomorrowIso).toBe("2026-10-10");
    // Chicago midnight on 9 Oct 2026 (CDT, UTC-5).
    expect(ctx.startIso).toBe("2026-10-09T05:00:00.000Z");
    expect(ctx.endIso).toBe("2026-10-10T05:00:00.000Z");
  });

  it("builds Chicago day bounds during standard time", () => {
    const ctx = getEodContext(new Date("2026-01-15T12:00:00.000Z"));
    expect(ctx.dateLabel).toBe("Thu 15 Jan");
    // Chicago midnight on 15 Jan 2026 (CST, UTC-6).
    expect(ctx.startIso).toBe("2026-01-15T06:00:00.000Z");
    expect(ctx.endIso).toBe("2026-01-16T06:00:00.000Z");
  });

  it("keeps Chicago midnight on the DST fall-back day", () => {
    // 1 Nov 2026 is the fall-back Sunday; local midnight is still CDT (UTC-5).
    const ctx = getEodContext(new Date("2026-11-01T12:00:00.000Z"));
    expect(ctx.startIso).toBe("2026-11-01T05:00:00.000Z");
  });
});

describe("formatFocusedDuration", () => {
  it("renders the minutes math for the spec example", () => {
    expect(formatFocusedDuration(12_000)).toBe("3h 20m");
  });

  it("handles zero, rounding and hour-only values", () => {
    expect(formatFocusedDuration(0)).toBe("0m");
    expect(formatFocusedDuration(3599)).toBe("1h 0m");
    expect(formatFocusedDuration(3600)).toBe("1h 0m");
    expect(formatFocusedDuration(5400)).toBe("1h 30m");
  });
});

describe("groupTimeByTask", () => {
  it("sums seconds per label and sorts descending", () => {
    const rows = groupTimeByTask(richData().sessions);
    expect(rows).toEqual([
      { label: "Side project", seconds: 6000 },
      { label: "Write intro", seconds: 4800 },
      { label: "Misc: Water the plants", seconds: 1200 },
    ]);
  });

  it("falls back to a label for null and empty labels", () => {
    const rows = groupTimeByTask([{ activeSeconds: 60, startedAt: "x", label: null }]);
    expect(rows[0].label).toBe("Unlabelled session");
  });
});

describe("golden report builder", () => {
  const ctx = getEodContext(NOW_OCT);

  it("builds the subject line with the date and focused time", () => {
    const email = buildEodEmail(richData(), ctx, {
      doneToday: "Shipped the intro and outline",
      learned: "Batch emails in the morning",
    });
    expect(email.subject).toBe("LockedIn EOD: Fri 9 Oct, 3h 20m focused");
    expect(eodSubject("Fri 9 Oct", 12_000)).toBe("LockedIn EOD: Fri 9 Oct, 3h 20m focused");
  });

  it("includes every section in the HTML body", () => {
    const email = buildEodEmail(richData(), ctx, {
      doneToday: "Shipped the intro and outline",
      learned: "Batch emails in the morning",
    });
    const mustContain = [
      "LockedIn end of day report",
      "Fri 9 Oct",
      "Total focused time: 3h 20m",
      "Sessions today: 3",
      "Done today",
      "Shipped the intro and outline",
      "Finished planned work",
      "Yes",
      "Good use of time",
      "No",
      "Too many meetings",
      "What I learned",
      "Batch emails in the morning",
      "Tomorrow plan",
      "Start: 8am",
      "Where: Home desk",
      "Write intro",
      "Book flights",
      "Time studies today",
      "10:30 AM: Writing the intro",
      "3:15 PM: Coffee chat",
      "Time per task today",
      "Side project: 1h 40m",
      "Write intro: 1h 20m",
      "Misc: Water the plants: 20m",
      "Infractions today: 2",
      "11:00 AM: Blocked site: youtube.com",
      "11:30 AM: Manual: phone",
    ];
    for (const fragment of mustContain) {
      expect(email.html).toContain(fragment);
    }
  });

  it("includes every section in the plain text body", () => {
    const email = buildEodEmail(richData(), ctx, {
      doneToday: "Shipped the intro and outline",
      learned: "Batch emails in the morning",
    });
    const mustContain = [
      "LockedIn end of day report: Fri 9 Oct",
      "Total focused time: 3h 20m",
      "Sessions today: 3",
      "- Shipped the intro and outline",
      "Finished planned work: Yes",
      "Good use of time: No",
      "- Too many meetings",
      "- Batch emails in the morning",
      "- Start: 8am",
      "- Where: Home desk",
      "- Write intro",
      "- Book flights",
      "- 10:30 AM: Writing the intro",
      "- Side project: 1h 40m",
      "Infractions today: 2",
      "- 11:00 AM: Blocked site: youtube.com",
      "- 11:30 AM: Manual: phone",
    ];
    for (const fragment of mustContain) {
      expect(email.text).toContain(fragment);
    }
  });

  it("renders friendly empty states when the day has no data", () => {
    const empty: EodDayData = {
      sessions: [],
      infractions: [],
      timeStudies: [],
      review: null,
      plan: null,
    };
    const email = buildEodEmail(empty, ctx, { doneToday: "", learned: "" });
    expect(email.subject).toBe("LockedIn EOD: Fri 9 Oct, 0m focused");
    for (const fragment of [
      "Nothing written down.",
      "Not answered",
      "No plan yet.",
      "No time studies today.",
      "No focused time recorded.",
      "No infractions today.",
    ]) {
      expect(email.html).toContain(fragment);
      expect(email.text).toContain(fragment);
    }
  });

  it("escapes user text in the HTML body", () => {
    const email = buildEodEmail(richData(), ctx, {
      doneToday: 'Fixed <script> & "quotes"',
      learned: "",
    });
    expect(email.html).toContain("Fixed &lt;script&gt; &amp; &quot;quotes&quot;");
    expect(email.html).not.toContain("<script>");
  });
});

describe("small helpers", () => {
  it("formats Chicago wall clock times", () => {
    expect(formatChicagoTime("2026-10-09T15:30:00.000Z")).toBe("10:30 AM");
    expect(formatChicagoTime("not-a-date")).toBe("");
  });

  it("labels infractions per the stats wording", () => {
    expect(infractionLabel({ kind: "site", detail: "youtube.com" })).toBe("Blocked site: youtube.com");
    expect(infractionLabel({ kind: "manual", detail: "phone" })).toBe("Manual: phone");
  });

  it("maps review booleans to answers", () => {
    expect(yesNoAnswer(true)).toBe("Yes");
    expect(yesNoAnswer(false)).toBe("No");
    expect(yesNoAnswer(null)).toBe("Not answered");
  });

  it("sums focused seconds across sessions", () => {
    expect(totalFocusedSeconds(richData().sessions)).toBe(12_000);
  });
});

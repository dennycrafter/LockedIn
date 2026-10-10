// Wind-down date math tests (SPEC 8.12). Pins the three edges the ticket is
// required to prove: a session or review spanning midnight attributes to the
// correct day, a wind down run after midnight but before 5am plans the day
// that just ended, and the 1 Nov 2026 clocks-back transition keeps every
// boundary correct. Instants are written as UTC strings like time.test.ts,
// with the Chicago wall-clock time in the comment.

import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  isWindDownDayInstant,
  windDownAnchorKey,
  windDownDayWindow,
  windDownPlanKey,
} from "./wind-down-time";

describe("windDownAnchorKey (the day being wound down)", () => {
  it("anchors to today during the evening", () => {
    // 9 Oct 2026, 9pm Chicago (CDT, UTC-5).
    expect(windDownAnchorKey(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
  });

  it("anchors to today right up to midnight", () => {
    // 11:59pm Chicago Oct 9 = 04:59Z Oct 10.
    expect(windDownAnchorKey(new Date("2026-10-10T04:59:00Z"))).toBe("2026-10-09");
  });

  it("anchors to the day that just ended between midnight and 5am", () => {
    // 12:30am Chicago Oct 10 = 05:30Z; the wind down is still finishing Oct 9.
    expect(windDownAnchorKey(new Date("2026-10-10T05:30:00Z"))).toBe("2026-10-09");
    // 4:59am Chicago Oct 10 = 09:59Z.
    expect(windDownAnchorKey(new Date("2026-10-10T09:59:00Z"))).toBe("2026-10-09");
  });

  it("flips back to the new day at exactly 5am", () => {
    // 5:00am Chicago Oct 10 = 10:00Z (CDT, UTC-5).
    expect(windDownAnchorKey(new Date("2026-10-10T10:00:00Z"))).toBe("2026-10-10");
  });

  it("carries the after-midnight rule across the year boundary", () => {
    // 12:30am Chicago Jan 1 2027 = 06:30Z; the day just ended is Dec 31 2026.
    expect(windDownAnchorKey(new Date("2027-01-01T06:30:00Z"))).toBe("2026-12-31");
  });
});

describe("windDownPlanKey (plan_date for day_plans)", () => {
  it("is tomorrow for an evening wind down", () => {
    // 9 Oct 2026, 9pm Chicago: the plan is for Oct 10.
    expect(windDownPlanKey(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-10");
  });

  it("is the new calendar day (today) after midnight but before 5am", () => {
    // SPEC 8.12: plan_date = today in that window. At 12:30am Oct 10 the
    // review covers Oct 9 (the day that just ended) and the plan lands on
    // Oct 10, the day the owner wakes into.
    expect(windDownPlanKey(new Date("2026-10-10T05:30:00Z"))).toBe("2026-10-10");
    expect(windDownPlanKey(new Date("2026-10-10T09:59:00Z"))).toBe("2026-10-10");
  });

  it("is the next day again from 5am", () => {
    // 5:00am Chicago Oct 10: an ordinary wind down tonight plans Oct 11.
    expect(windDownPlanKey(new Date("2026-10-10T10:00:00Z"))).toBe("2026-10-11");
  });

  it("crosses the year boundary", () => {
    // Evening of Dec 31 2026 plans Jan 1 2027.
    expect(windDownPlanKey(new Date("2027-01-01T04:00:00Z"))).toBe("2027-01-01");
    // 12:30am Jan 1 2027 plans Jan 1 2027 (today).
    expect(windDownPlanKey(new Date("2027-01-01T06:30:00Z"))).toBe("2027-01-01");
  });
});

describe("windDownDayWindow (session and review attribution)", () => {
  it("attributes a session spanning midnight to the day it started", () => {
    // Started 11:50pm Chicago Oct 9 (= 04:50Z Oct 10), ended 12:40am Oct 10
    // (= 05:40Z). It belongs to the Oct 9 wind-down day, not Oct 10.
    const started = new Date("2026-10-10T04:50:00Z");
    const ended = new Date("2026-10-10T05:40:00Z");
    expect(isWindDownDayInstant("2026-10-09", started)).toBe(true);
    expect(isWindDownDayInstant("2026-10-10", started)).toBe(false);
    // The end falls outside the Oct 9 window by construction: attribution is
    // by started_at, the convention shared with the dashboard and EOD.
    expect(isWindDownDayInstant("2026-10-09", ended)).toBe(false);
  });

  it("keeps a session that starts at 12:05am on the new day, not the previous evening", () => {
    // 12:05am Chicago Oct 10 = 05:05Z, inside the Oct 10 window only.
    const started = new Date("2026-10-10T05:05:00Z");
    expect(isWindDownDayInstant("2026-10-10", started)).toBe(true);
    expect(isWindDownDayInstant("2026-10-09", started)).toBe(false);
  });

  it("opens each window at Chicago midnight, CDT in summer and CST in winter", () => {
    expect(windDownDayWindow("2026-10-09").start.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(windDownDayWindow("2026-01-15").start.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });
});

describe("the 1 Nov 2026 clocks-back transition (DST ends 02:00 CDT)", () => {
  it("keeps plan-date math correct across the fall-back weekend", () => {
    // Saturday Oct 31, 11:30pm CDT (= 04:30Z Nov 1): evening wind down plans Nov 1.
    expect(windDownAnchorKey(new Date("2026-11-01T04:30:00Z"))).toBe("2026-10-31");
    expect(windDownPlanKey(new Date("2026-11-01T04:30:00Z"))).toBe("2026-11-01");
    // Sunday Nov 1, 12:30am CST (= 06:30Z, after the clocks went back): the
    // wind down is still finishing Oct 31 and the plan lands on today, Nov 1.
    expect(windDownAnchorKey(new Date("2026-11-01T06:30:00Z"))).toBe("2026-10-31");
    expect(windDownPlanKey(new Date("2026-11-01T06:30:00Z"))).toBe("2026-11-01");
    // 1:30am CST on the repeated hour (= 07:30Z): still before 5am.
    expect(windDownAnchorKey(new Date("2026-11-01T07:30:00Z"))).toBe("2026-10-31");
    // From 5am CST (11:00Z) the anchor is the new day and the plan moves on.
    expect(windDownAnchorKey(new Date("2026-11-01T11:00:00Z"))).toBe("2026-11-01");
    expect(windDownPlanKey(new Date("2026-11-01T11:00:00Z"))).toBe("2026-11-02");
  });

  it("builds a 25-hour window for Nov 1 and a 24-hour one either side", () => {
    const window = windDownDayWindow("2026-11-01");
    // Midnight Nov 1 is still CDT (UTC-5); midnight Nov 2 is CST (UTC-6).
    expect(window.start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 3_600_000);
    expect(windDownDayWindow("2026-10-31").end.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });

  it("attributes a late session on the transition night to Oct 31", () => {
    // 1:30am CST Nov 1 (= 07:30Z): a session started then sits inside the
    // Oct 31 window? No: it is inside the Nov 1 window (which opened at
    // 05:00Z). Only the anchor rule reaches back a day, sessions do not.
    const started = new Date("2026-11-01T07:30:00Z");
    expect(isWindDownDayInstant("2026-11-01", started)).toBe(true);
    expect(isWindDownDayInstant("2026-10-31", started)).toBe(false);
  });

  it("rolls date-key arithmetic over the month end", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("the spring-forward counterpart (DST starts 2026-03-08 02:00)", () => {
  it("builds a 23-hour window for Mar 8", () => {
    const window = windDownDayWindow("2026-03-08");
    expect(window.start.toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-03-09T05:00:00.000Z");
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 3_600_000);
  });

  it("keeps the after-midnight rule correct around the lost hour", () => {
    // 12:30am CST Mar 9 (= 06:30Z): anchor Mar 8, plan Mar 9 (today).
    expect(windDownAnchorKey(new Date("2026-03-09T06:30:00Z"))).toBe("2026-03-08");
    expect(windDownPlanKey(new Date("2026-03-09T06:30:00Z"))).toBe("2026-03-09");
  });
});

describe("addDaysToKey rejects malformed keys", () => {
  it("throws instead of drifting a day on bad input", () => {
    expect(() => addDaysToKey("2026/10/09", 1)).toThrow();
    expect(() => addDaysToKey("not-a-date", 1)).toThrow();
  });
});

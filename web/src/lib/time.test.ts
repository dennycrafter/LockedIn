// Pin the Chicago day boundary exactly (SPEC 8.16, SPEC 12): the stats window
// must open at local midnight, through both DST transitions.
import { describe, expect, it } from "vitest";
import {
  chicagoDateKey,
  chicagoDayStartUtc,
  chicagoTodayStart,
  formatFocusedMs,
  isSameChicagoDay,
} from "./time";

describe("chicagoDayStartUtc", () => {
  it("opens the day at midnight Chicago, CDT in summer (UTC-5)", () => {
    expect(chicagoDayStartUtc("2026-10-09").toISOString()).toBe("2026-10-09T05:00:00.000Z");
  });

  it("opens the day at midnight Chicago, CST in winter (UTC-6)", () => {
    expect(chicagoDayStartUtc("2026-01-15").toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("handles the spring-forward week: last CST midnight then first CDT midnight", () => {
    // DST starts 2026-03-08 02:00 local; midnight of the 8th is still CST.
    expect(chicagoDayStartUtc("2026-03-08").toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(chicagoDayStartUtc("2026-03-09").toISOString()).toBe("2026-03-09T05:00:00.000Z");
  });

  it("handles the fall-back week: last CDT midnight then first CST midnight", () => {
    // DST ends 2026-11-01 02:00 local; midnight of the 1st is still CDT.
    expect(chicagoDayStartUtc("2026-11-01").toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(chicagoDayStartUtc("2026-11-02").toISOString()).toBe("2026-11-02T06:00:00.000Z");
  });

  it("round trips with chicagoDateKey", () => {
    for (const key of ["2026-10-09", "2026-03-08", "2026-11-02"]) {
      expect(chicagoDateKey(chicagoDayStartUtc(key))).toBe(key);
    }
  });
});

describe("isSameChicagoDay", () => {
  it("puts a session spanning Chicago midnight on two days", () => {
    // 11:30pm Chicago Oct 9 = 04:30Z Oct 10; 12:15am Chicago Oct 10 = 05:15Z.
    const started = new Date("2026-10-10T04:30:00Z");
    const ended = new Date("2026-10-10T05:15:00Z");
    expect(chicagoDateKey(started)).toBe("2026-10-09");
    expect(chicagoDateKey(ended)).toBe("2026-10-10");
    expect(isSameChicagoDay(started, ended)).toBe(false);
  });

  it("counts the same UTC instant only for today when inside the Chicago day", () => {
    const dayStart = chicagoDayStartUtc("2026-10-09"); // 05:00Z
    const noon = new Date("2026-10-09T18:00:00Z"); // 1pm Chicago
    expect(isSameChicagoDay(dayStart, noon)).toBe(true);
    // 04:59Z the same UTC morning is still Oct 8 in Chicago.
    expect(isSameChicagoDay(dayStart, new Date("2026-10-09T04:59:00Z"))).toBe(false);
  });
});

describe("chicagoTodayStart", () => {
  it("uses the current Chicago date, not the UTC date", () => {
    // 03:00Z on Oct 10 is 10pm Oct 9 in Chicago, so today starts Oct 9 05:00Z.
    const lateEveningUtc = new Date("2026-10-10T03:00:00Z");
    expect(chicagoTodayStart(lateEveningUtc).toISOString()).toBe("2026-10-09T05:00:00.000Z");
  });
});

describe("formatFocusedMs", () => {
  it("renders h m s style", () => {
    expect(formatFocusedMs(3_600_000)).toBe("1h 0m 0s");
    expect(formatFocusedMs(3_725_000)).toBe("1h 2m 5s");
    expect(formatFocusedMs(125_000)).toBe("2m 5s");
    expect(formatFocusedMs(9_000)).toBe("9s");
    expect(formatFocusedMs(0)).toBe("0s");
    expect(formatFocusedMs(-5)).toBe("0s");
  });
});

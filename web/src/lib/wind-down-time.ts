// Wind-down day and plan-date math (SPEC 8.12). The evening flow belongs to a
// "wind-down day" that does not end at midnight: between 00:00 and 05:00
// America/Chicago the owner is finishing the previous day, so the anchor day
// is yesterday and plan_date (anchor + 1) resolves to the new calendar day.
//
// This module wraps the shared today-boundary helpers in ./time instead of
// modifying them: ./time is used by several tickets, this file owns only
// wind-down date logic, with its own tests in ./wind-down-time.test.ts.

import { chicagoDateKey, chicagoDayStartUtc, TIMEZONE } from "./time";

/** The wind-down day rolls over at 05:00 local, not midnight (SPEC 8.12). */
export const WIND_DOWN_DAY_START_HOUR = 5;

/** Chicago wall-clock hour (0 to 23) of an instant, derived from day starts so DST cannot skew it. */
function chicagoHourOfDay(instant: Date): number {
  const dayStartMs = chicagoDayStartUtc(chicagoDateKey(instant)).getTime();
  return Math.floor((instant.getTime() - dayStartMs) / 3_600_000);
}

/**
 * Add calendar days to a YYYY-MM-DD key. Pure UTC calendar arithmetic: date
 * keys have no zone or offset, so DST transitions cannot distort them.
 */
export function addDaysToKey(key: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  const [, year, month, day] = match;
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Date key of the day being wound down: today in America/Chicago, or the day
 * that just ended when the wind down runs between midnight and 5am.
 */
export function windDownAnchorKey(now: Date): string {
  const today = chicagoDateKey(now);
  return chicagoHourOfDay(now) < WIND_DOWN_DAY_START_HOUR ? addDaysToKey(today, -1) : today;
}

/**
 * plan_date for day_plans (SPEC 8.12): tomorrow in America/Chicago. Run in the
 * evening it is tomorrow; run after midnight before 5am it is the new calendar
 * day (today), because the owner is planning the day they are about to wake
 * into. Both are the anchor day plus one.
 */
export function windDownPlanKey(now: Date): string {
  return addDaysToKey(windDownAnchorKey(now), 1);
}

/**
 * The UTC window [start, end) of a Chicago calendar day, for picking the
 * sessions, recaps and reviews that belong to the wind-down day. A session
 * that crosses midnight belongs to the day it started in, matching the
 * dashboard and EOD convention (rows are filtered on started_at).
 */
export function windDownDayWindow(dateKey: string): { start: Date; end: Date } {
  return {
    start: chicagoDayStartUtc(dateKey),
    end: chicagoDayStartUtc(addDaysToKey(dateKey, 1)),
  };
}

/** True when the instant falls inside the wind-down day window (for tests and call sites). */
export function isWindDownDayInstant(dateKey: string, instant: Date): boolean {
  const window = windDownDayWindow(dateKey);
  return instant.getTime() >= window.start.getTime() && instant.getTime() < window.end.getTime();
}

// TIMEZONE is re-exported for call sites that display wind-down times, so the
// wind-down modules are the only import they need.
export { TIMEZONE };

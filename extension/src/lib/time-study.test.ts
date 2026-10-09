import { describe, expect, it } from "vitest";
import { TIME_STUDY_ALARM, TIME_STUDY_CHOICES, isTimeStudyChoice, timeStudyAlarm } from "./time-study";

describe("timeStudyAlarm (SPEC 8.11 alarm scheduling)", () => {
  it("schedules one repeating alarm per allowed interval", () => {
    for (const choice of TIME_STUDY_CHOICES) {
      expect(timeStudyAlarm(choice)).toEqual({ name: TIME_STUDY_ALARM, periodInMinutes: choice });
    }
  });

  it("off is no alarm", () => {
    expect(timeStudyAlarm(null)).toBeNull();
  });

  it("intervals outside the allowed list schedule nothing", () => {
    for (const bad of [0, 1, 2, 3, 4, 6, 10, 29, 59, 90, 600]) {
      expect(timeStudyAlarm(bad)).toBeNull();
    }
  });

  it("choice membership matches the scheduling decision", () => {
    expect(isTimeStudyChoice(5)).toBe(true);
    expect(isTimeStudyChoice(60)).toBe(true);
    expect(isTimeStudyChoice(7)).toBe(false);
  });
});

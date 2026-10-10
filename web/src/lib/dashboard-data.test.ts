// Unit coverage for the pure settings mapper: the raw database row becomes
// the client settings, a missing row falls back to defaults, and an
// unexpected helper_mode value degrades to scripted instead of breaking the
// dashboard (SPEC 8.15).

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mapSettingsRow, type SettingsRowData } from "./dashboard-data";

function row(overrides: Partial<SettingsRowData> = {}): SettingsRowData {
  return {
    display_name: "Boss",
    completion_style: "dramatic",
    time_study_minutes: null,
    wind_down_time: "",
    helper_mode: "scripted",
    ...overrides,
  };
}

describe("mapSettingsRow", () => {
  it("maps a full row", () => {
    expect(mapSettingsRow(row({ helper_mode: "ai", wind_down_time: "21:30", time_study_minutes: 15 }))).toEqual({
      display_name: "Boss",
      completion_style: "dramatic",
      time_study_minutes: 15,
      wind_down_time: "21:30",
      helper_mode: "ai",
    });
  });

  it("falls back to defaults when the row is missing", () => {
    expect(mapSettingsRow(null)).toEqual(DEFAULT_SETTINGS);
    expect(mapSettingsRow(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("degrades an unexpected helper_mode to scripted", () => {
    expect(mapSettingsRow(row({ helper_mode: "surprise" })).helper_mode).toBe("scripted");
  });

  it("treats null nullable columns as their empty values", () => {
    expect(mapSettingsRow(row({ wind_down_time: null, time_study_minutes: null }))).toEqual({
      display_name: "Boss",
      completion_style: "dramatic",
      time_study_minutes: null,
      wind_down_time: "",
      helper_mode: "scripted",
    });
  });
});

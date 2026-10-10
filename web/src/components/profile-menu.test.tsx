// @vitest-environment jsdom
// Settings-level helper mode toggle (SPEC 8.15): Scripted/AI buttons in the
// profile menu, default scripted, AI disabled with the exact hint while the
// Anthropic key is not configured in Vercel.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SettingsData } from "@/lib/dashboard-data";
import { ProfileMenu } from "./profile-menu";

function settings(overrides: Partial<SettingsData> = {}): SettingsData {
  return {
    display_name: "Boss",
    completion_style: "dramatic",
    time_study_minutes: null,
    wind_down_time: "",
    helper_mode: "scripted",
    ...overrides,
  };
}

function renderMenu(overrides: { settings?: SettingsData; aiAvailable?: boolean } = {}) {
  const onSave = vi.fn();
  render(<ProfileMenu settings={overrides.settings ?? settings()} aiAvailable={overrides.aiAvailable ?? false} error={null} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  return onSave;
}

function modeButton(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name });
}

afterEach(() => {
  cleanup();
});

describe("ProfileMenu helper mode (SPEC 8.15)", () => {
  it("defaults to scripted active and disables AI with the hint while the key is missing", () => {
    renderMenu({ aiAvailable: false });

    expect(modeButton("Scripted").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("AI").getAttribute("aria-pressed")).toBe("false");
    expect(modeButton("AI").disabled).toBe(true);
    expect(modeButton("Scripted").disabled).toBe(false);
    expect(screen.getByText("Add your Anthropic key in Vercel to turn this on")).toBeTruthy();
  });

  it("offers AI when the key is configured and saves the choice", () => {
    const onSave = renderMenu({ aiAvailable: true });

    expect(screen.queryByText("Add your Anthropic key in Vercel to turn this on")).toBeNull();
    expect(modeButton("AI").disabled).toBe(false);

    fireEvent.click(modeButton("AI"));
    expect(onSave).toHaveBeenCalledWith({ helper_mode: "ai" });
  });

  it("saves scripted back over an ai default", () => {
    const onSave = renderMenu({ aiAvailable: true, settings: settings({ helper_mode: "ai" }) });

    expect(modeButton("AI").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("Scripted").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(modeButton("Scripted"));
    expect(onSave).toHaveBeenCalledWith({ helper_mode: "scripted" });
  });

  it("does not save when the active mode is clicked again", () => {
    const onSave = renderMenu({ aiAvailable: true });

    fireEvent.click(modeButton("Scripted"));
    expect(onSave).not.toHaveBeenCalled();
  });
});

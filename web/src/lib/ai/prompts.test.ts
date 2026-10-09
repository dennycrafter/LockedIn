// Unit tests for the system prompts (SPEC 8.15). The prompts carry the
// parsing contract, so these pin the exact marker and JSON shape strings.

import { describe, expect, it } from "vitest";
import { buildSystemPrompt, ORGANIZE_SYSTEM_PROMPT, STUCK_SYSTEM_PROMPT } from "./prompts";

describe("system prompts (SPEC 8.15)", () => {
  it("the stuck prompt demands the exact START_5_MIN marker and coach style", () => {
    expect(STUCK_SYSTEM_PROMPT).toContain("START_5_MIN: <task id or title>");
    expect(STUCK_SYSTEM_PROMPT).toContain("3 sentences maximum");
    expect(STUCK_SYSTEM_PROMPT).toContain("one question at a time");
  });

  it("the organize prompt demands the fenced ranked JSON shape", () => {
    expect(ORGANIZE_SYSTEM_PROMPT).toContain('{"ranked":[{"title":"...","task_id":"... or null","reason":"..."}]}');
    expect(ORGANIZE_SYSTEM_PROMPT).toContain("deadline");
    expect(ORGANIZE_SYSTEM_PROMPT).toContain("impact");
    expect(ORGANIZE_SYSTEM_PROMPT).toContain("effort");
  });

  it("neither prompt uses em dashes (SPEC 0: no em dashes anywhere)", () => {
    expect(STUCK_SYSTEM_PROMPT).not.toMatch(/[—]/);
    expect(ORGANIZE_SYSTEM_PROMPT).not.toMatch(/[—]/);
  });

  it("builds the stuck prompt with no context section when context is missing", () => {
    expect(buildSystemPrompt("stuck")).toBe(STUCK_SYSTEM_PROMPT);
    expect(buildSystemPrompt("organize")).toBe(ORGANIZE_SYSTEM_PROMPT);
  });

  it("appends the context lines for tasks, open loops and the plan", () => {
    const prompt = buildSystemPrompt("organize", {
      undoneTasks: ["Site > Write intro"],
      openLoops: ["Reply to the accountant"],
      todayPlan: "Start 8am at the library",
    });
    expect(prompt).toContain("Context for this conversation:");
    expect(prompt).toContain("- Site > Write intro");
    expect(prompt).toContain("- Reply to the accountant");
    expect(prompt).toContain("Start 8am at the library");
    expect(prompt.startsWith(ORGANIZE_SYSTEM_PROMPT)).toBe(true);
  });

  it("omits the context section when everything is empty", () => {
    const prompt = buildSystemPrompt("stuck", { undoneTasks: [], openLoops: [], todayPlan: "" });
    expect(prompt).toBe(STUCK_SYSTEM_PROMPT);
  });
});

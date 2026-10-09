import { describe, expect, it } from "vitest";
import { celebrationMessage, shouldCelebrate } from "./celebration";

describe("celebrationMessage", () => {
  it("renders the dramatic style (SPEC 8.10 wording)", () => {
    expect(celebrationMessage("dramatic", "Denis")).toBe(
      "Denis. You came, you locked in, you won the day.",
    );
  });

  it("renders the hype style", () => {
    expect(celebrationMessage("hype", "Denis")).toBe("LET'S GO Denis! Everything done!");
  });

  it("renders the calm style", () => {
    expect(celebrationMessage("calm", "Denis")).toBe("Nice work, Denis. All done.");
  });

  it("falls back to Boss when the display name is blank", () => {
    expect(celebrationMessage("calm", "  ")).toBe("Nice work, Boss. All done.");
  });
});

describe("shouldCelebrate", () => {
  it("fires when ticking the last undone item of a project", () => {
    expect(shouldCelebrate({ done: 3, total: 4 }, { done: 4, total: 4 })).toBe(true);
  });

  it("does not fire while items remain undone", () => {
    expect(shouldCelebrate({ done: 0, total: 4 }, { done: 1, total: 4 })).toBe(false);
  });

  it("does not fire on unticking", () => {
    expect(shouldCelebrate({ done: 4, total: 4 }, { done: 3, total: 4 })).toBe(false);
  });

  it("does not fire on a re-render with no change", () => {
    expect(shouldCelebrate({ done: 2, total: 4 }, { done: 2, total: 4 })).toBe(false);
  });

  it("does not fire for an empty project", () => {
    expect(shouldCelebrate({ done: 0, total: 0 }, { done: 0, total: 0 })).toBe(false);
  });
});

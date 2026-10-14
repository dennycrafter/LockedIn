import { describe, expect, it } from "vitest";
import { formatWorkToday, initialOf, planCardTitle, planDetailsLine, plural, splitDone } from "./ui-format";

// 20:00 in Chicago on 14 Oct 2026 (CDT, UTC-5).
const EVENING = new Date("2026-10-15T01:00:00Z");

describe("formatWorkToday", () => {
  it("shows hours and minutes without seconds", () => {
    expect(formatWorkToday(6900)).toBe("1h 55m");
    expect(formatWorkToday(6959)).toBe("1h 55m");
    expect(formatWorkToday(3600)).toBe("1h 0m");
    expect(formatWorkToday(2700)).toBe("45m");
    expect(formatWorkToday(59)).toBe("0m");
    expect(formatWorkToday(-10)).toBe("0m");
  });
});

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "decision")).toBe("1 decision");
    expect(plural(0, "decision")).toBe("0 decisions");
    expect(plural(3, "loop")).toBe("3 loops");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
});

describe("planCardTitle", () => {
  it("names the plan's day", () => {
    expect(planCardTitle("2026-10-14", EVENING)).toBe("Today's plan");
    expect(planCardTitle("2026-10-15", EVENING)).toBe("Tomorrow's plan");
    expect(planCardTitle("2026-10-16", EVENING)).toBe("Friday's plan");
  });
});

describe("planDetailsLine", () => {
  it("joins start and place and drops empty parts", () => {
    expect(planDetailsLine({ startTime: "09:00", location: "Library" })).toBe("Starts 09:00 · Library");
    expect(planDetailsLine({ startTime: "", location: "Library" })).toBe("Library");
    expect(planDetailsLine({ startTime: "", location: "" })).toBe("");
  });
});

describe("splitDone", () => {
  it("keeps order in both halves", () => {
    const items = [
      { id: "a", done: true },
      { id: "b", done: false },
      { id: "c", done: true },
      { id: "d", done: false },
    ];
    const { open, done } = splitDone(items);
    expect(open.map((i) => i.id)).toEqual(["b", "d"]);
    expect(done.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("initialOf", () => {
  it("returns the capital first letter or a placeholder", () => {
    expect(initialOf("alex")).toBe("A");
    expect(initialOf("  Denis ")).toBe("D");
    expect(initialOf("")).toBe("?");
  });
});

import { describe, expect, it } from "vitest";
import {
  mostImportantRowId,
  planDateHeading,
  planMetaLine,
  shouldCelebratePlanFinish,
  upcomingPlanKey,
  visiblePlanRows,
  type TomorrowPlan,
  type TomorrowPlanRow,
} from "./tomorrow-plan";

// Panel logic for the Tomorrow's task list (SPEC 8.12): day-rollover selection
// in America/Chicago, planned order, completed rows hidden, and the SPEC 8.10
// celebration trigger when the last item is ticked.

function row(overrides: Partial<TomorrowPlanRow> & { taskId: string; title: string }): TomorrowPlanRow {
  return { done: false, contextLabel: "Project", position: 0, ...overrides };
}

const EVENING = new Date("2026-10-09T21:30:00-05:00"); // 21:30 America/Chicago, Thu 9 Oct

describe("upcomingPlanKey", () => {
  it("is today's Chicago date key", () => {
    expect(upcomingPlanKey(EVENING)).toBe("2026-10-09");
  });

  it("rolls over at Chicago midnight, not UTC midnight", () => {
    const before = new Date("2026-10-10T04:59:59Z"); // 23:59:59 America/Chicago on the 9th (CDT, UTC-5)
    const after = new Date("2026-10-10T05:00:00Z"); // 00:00:00 America/Chicago on the 10th
    expect(upcomingPlanKey(before)).toBe("2026-10-09");
    expect(upcomingPlanKey(after)).toBe("2026-10-10");
  });

  it("survives the DST spring-forward night", () => {
    const instant = new Date("2026-03-08T08:30:00Z"); // 02:30 CST / 03:30 CDT boundary morning
    expect(upcomingPlanKey(instant)).toBe("2026-03-08");
  });
});

describe("visiblePlanRows", () => {
  it("keeps the planned order even when rows arrive shuffled", () => {
    const rows = [
      row({ taskId: "c", title: "Third", position: 2 }),
      row({ taskId: "a", title: "First", position: 0 }),
      row({ taskId: "b", title: "Second", position: 1 }),
    ];
    expect(visiblePlanRows(rows).map((r) => r.taskId)).toEqual(["a", "b", "c"]);
  });

  it("hides completed rows", () => {
    const rows = [
      row({ taskId: "a", title: "Done already", done: true, position: 0 }),
      row({ taskId: "b", title: "Still open", position: 1 }),
    ];
    expect(visiblePlanRows(rows).map((r) => r.taskId)).toEqual(["b"]);
  });

  it("drops blank rows instead of rendering them", () => {
    const rows = [
      row({ taskId: "", title: "Ghost", position: 0 }),
      row({ taskId: "b", title: "", position: 1 }),
      row({ taskId: "c", title: "Real", position: 2 }),
    ];
    expect(visiblePlanRows(rows).map((r) => r.taskId)).toEqual(["c"]);
  });

  it("is empty for an empty plan", () => {
    expect(visiblePlanRows([])).toEqual([]);
  });
});

describe("mostImportantRowId", () => {
  it("labels the first visible row", () => {
    const rows = [
      row({ taskId: "a", title: "Done already", done: true, position: 0 }),
      row({ taskId: "b", title: "Next up", position: 1 }),
    ];
    expect(mostImportantRowId(rows)).toBe("b");
  });

  it("is null when nothing is visible", () => {
    expect(mostImportantRowId([])).toBeNull();
    expect(mostImportantRowId([row({ taskId: "a", title: "Done", done: true })])).toBeNull();
  });
});

describe("shouldCelebratePlanFinish", () => {
  const last = row({ taskId: "a", title: "Last item", position: 0 });
  const other = row({ taskId: "b", title: "Other item", position: 1 });

  it("celebrates when the single visible row is ticked away", () => {
    expect(shouldCelebratePlanFinish([last], [])).toBe(true);
  });

  it("does not celebrate while rows remain", () => {
    expect(shouldCelebratePlanFinish([last, other], [other])).toBe(false);
  });

  it("does not celebrate when a failed tick leaves the row in place", () => {
    expect(shouldCelebratePlanFinish([last], [last])).toBe(false);
  });
});

describe("planDateHeading", () => {
  it("reads Today and Tomorrow from Chicago days", () => {
    expect(planDateHeading("2026-10-09", EVENING)).toBe("Today");
    expect(planDateHeading("2026-10-10", EVENING)).toBe("Tomorrow");
  });

  it("falls back to the weekday for later plans", () => {
    expect(planDateHeading("2026-10-11", EVENING)).toBe("Sunday");
  });
});

describe("planMetaLine", () => {
  const base: TomorrowPlan = {
    planDateKey: "2026-10-10",
    startTime: "",
    location: "",
    prepped: false,
    rows: [],
  };

  it("joins the present parts with middots", () => {
    expect(planMetaLine({ ...base, startTime: "8am", location: "home" }, EVENING)).toBe(
      "Tomorrow · Starts 8am · Location: home",
    );
  });

  it("drops empty start and location", () => {
    expect(planMetaLine(base, EVENING)).toBe("Tomorrow");
    expect(planMetaLine({ ...base, startTime: "8am" }, EVENING)).toBe("Tomorrow · Starts 8am");
  });
});

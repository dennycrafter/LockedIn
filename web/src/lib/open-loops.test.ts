import { describe, expect, it } from "vitest";
import { decisionCount, loopCount, totalSavedCount, type OpenLoopItem } from "./open-loops";

function items(partial: Partial<Record<"loop" | "decision", number>>): OpenLoopItem[] {
  const list: OpenLoopItem[] = [];
  for (let i = 0; i < (partial.loop ?? 0); i++) list.push({ kind: "loop" });
  for (let i = 0; i < (partial.decision ?? 0); i++) list.push({ kind: "decision" });
  return list;
}

describe("open loop counts (SPEC 8.8)", () => {
  it("counts loops and decisions separately", () => {
    const list = items({ loop: 2, decision: 3 });
    expect(loopCount(list)).toBe(2);
    expect(decisionCount(list)).toBe(3);
  });

  it("an empty list counts zero everywhere", () => {
    const list: OpenLoopItem[] = [];
    expect(loopCount(list)).toBe(0);
    expect(decisionCount(list)).toBe(0);
    expect(totalSavedCount(list)).toBe(0);
  });

  it("the header total is the sum of both lists", () => {
    expect(totalSavedCount(items({ loop: 4, decision: 1 }))).toBe(5);
    expect(totalSavedCount(items({ loop: 0, decision: 1 }))).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { applyReorder, moveItem, positionsForIds } from "./reorder";

describe("applyReorder", () => {
  it("moves an item forward", () => {
    expect(applyReorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item backward", () => {
    expect(applyReorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the same list when from equals to", () => {
    const list = ["a", "b"];
    expect(applyReorder(list, 1, 1)).toBe(list);
  });

  it("is a no-op for out-of-range indexes", () => {
    expect(applyReorder(["a", "b"], 1, 9)).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  it("finds the item by identity", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    expect(moveItem([a, b, c], a, 2)).toEqual([b, c, a]);
  });
});

describe("positionsForIds", () => {
  it("assigns position = index so a reload renders the dragged order", () => {
    expect(positionsForIds(["c", "a", "b"])).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });
});

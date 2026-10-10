import { describe, expect, it } from "vitest";
// The widget's stylesheet carries a load-bearing invariant: the shadow HOST is
// pointer-events:none (set inline in createFloatingTimer, so its zero-size
// mount never swallows page clicks) and the visible .box must re-enable
// hit-testing or the whole widget is inert (no drag, no buttons, no input).
// The interactive behaviour itself is covered by the dogfood drag recording;
// this pins the CSS contract that fixes it.
import { STYLE } from "./floating-timer";

describe("floating timer stylesheet", () => {
  it("re-enables hit-testing on the widget box", () => {
    const box = STYLE.slice(STYLE.indexOf(".box"), STYLE.indexOf("}", STYLE.indexOf(".box")));
    expect(box).toContain("pointer-events: auto");
  });
});

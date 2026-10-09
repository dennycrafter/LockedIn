import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosave";

describe("createAutosave (800ms after typing stops, SPEC 8.7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves once, 800ms after the last keystroke", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);
    autosave.keystroke();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(799);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("pushes the save back when typing continues before the timer fires", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);
    autosave.keystroke();
    vi.advanceTimersByTime(500);
    autosave.keystroke();
    vi.advanceTimersByTime(799);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of typing into exactly one save", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);
    for (let i = 0; i < 10; i += 1) {
      autosave.keystroke();
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(800);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush saves immediately and drops the pending timer", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);
    autosave.keystroke();
    autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending save without calling it", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);
    autosave.keystroke();
    autosave.cancel();
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("honours a custom delay", () => {
    const save = vi.fn();
    const autosave = createAutosave(save, 1500);
    autosave.keystroke();
    vi.advanceTimersByTime(1499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

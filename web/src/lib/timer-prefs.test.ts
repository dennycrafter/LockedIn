import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTimerPrefs, saveTimerPrefs } from "./timer-prefs";

// The web tests run in node, so install a tiny in-memory localStorage for the
// code under test to talk to (the browser provides the real one).
function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const previous = globalThis.localStorage;

beforeEach(() => {
  globalThis.localStorage = makeMemoryStorage();
});

afterEach(() => {
  globalThis.localStorage = previous;
});

describe("loadTimerPrefs", () => {
  it("returns empty prefs when nothing is stored", () => {
    expect(loadTimerPrefs()).toEqual({});
  });

  it("round trips saved prefs", () => {
    saveTimerPrefs({ minutes: 45, lockMode: "none" });
    expect(loadTimerPrefs()).toEqual({ minutes: 45, lockMode: "none" });
  });

  it("rejects out of range durations and unknown lock modes", () => {
    globalThis.localStorage.setItem(
      "lockedin-timer-prefs",
      JSON.stringify({ minutes: 400, lockMode: "all" }),
    );
    expect(loadTimerPrefs()).toEqual({});
  });

  it("survives corrupt JSON", () => {
    globalThis.localStorage.setItem("lockedin-timer-prefs", "{not json");
    expect(loadTimerPrefs()).toEqual({});
  });

  it("survives a missing localStorage", () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(loadTimerPrefs()).toEqual({});
  });
});

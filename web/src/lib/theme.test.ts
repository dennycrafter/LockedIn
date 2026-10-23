import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY, isTheme } from "./theme";

// The head script runs before React. Run it against fake globals to check it
// picks the saved choice first, then the system setting, and never throws.
function runScript(saved: string | null, systemLight: boolean, storageThrows = false) {
  const root = { dataset: {} as Record<string, string> };
  const fakeWindow = {
    matchMedia: (query: string) => ({ matches: query.includes("light") && systemLight }),
  };
  const fakeStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("blocked");
      return key === THEME_KEY ? saved : null;
    },
  };
  new Function("window", "localStorage", "document", THEME_INIT_SCRIPT)(fakeWindow, fakeStorage, {
    documentElement: root,
  });
  return root.dataset.theme;
}

afterEach(() => vi.restoreAllMocks());

describe("THEME_INIT_SCRIPT", () => {
  it("uses the saved choice over the system setting", () => {
    expect(runScript("light", false)).toBe("light");
    expect(runScript("dark", true)).toBe("dark");
  });

  it("follows the system setting with no saved choice", () => {
    expect(runScript(null, true)).toBe("light");
    expect(runScript(null, false)).toBe("dark");
    expect(runScript("purple", true)).toBe("light");
  });

  it("falls back to dark when storage is blocked", () => {
    expect(runScript(null, true, true)).toBe("dark");
  });
});

describe("isTheme", () => {
  it("only accepts light and dark", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

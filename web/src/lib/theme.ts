// Light and dark mode (Oct 2026). With no saved choice the app follows the
// system setting; clicking the sun/moon button saves a choice on this device.
// localStorage is wrapped in try/catch because private windows can throw.

export type Theme = "light" | "dark";

export const THEME_KEY = "lockedin-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function readSavedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved: the choice still applies until the page reloads.
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return isTheme(attr) ? attr : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<Theme>("lockedin-theme", { detail: theme }));
}

// Runs in <head> before first paint so the page never flashes the wrong theme.
// Kept as a plain string: it cannot import anything.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

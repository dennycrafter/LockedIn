"use client";

// Sun/moon button in the top bar (Oct 2026). Shows the theme you would switch
// TO, so in dark mode it is a sun. useTheme is shared with the Board so the
// whiteboard flips with the rest of the app.
import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, currentTheme, readSavedTheme, saveTheme, systemTheme, type Theme } from "@/lib/theme";
import { BTN_ICON } from "./ui";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("lockedin-theme", onChange);
  return () => window.removeEventListener("lockedin-theme", onChange);
}

export function useTheme(): Theme {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);

  // With no saved choice, keep following the system setting live.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }
    const follow = () => {
      if (readSavedTheme() === null) applyTheme(systemTheme());
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  return theme;
}

export function ThemeToggle() {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        saveTheme(next);
        applyTheme(next);
      }}
      className={BTN_ICON}
    >
      {next === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

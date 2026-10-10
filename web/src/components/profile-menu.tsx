"use client";

// Profile menu (SPEC 10 top bar): Display name, Completion message, Helper
// mode (SPEC 8.15) and the wind-down time target (SPEC 8.12) here; Lock is
// the existing logout.

import { useEffect, useRef, useState } from "react";
import type { CelebrationStyle, HelperMode, SettingsData } from "@/lib/dashboard-data";
import { celebrationMessage } from "@/lib/celebration";

const STYLE_OPTIONS: Array<{ value: CelebrationStyle; label: string }> = [
  { value: "dramatic", label: "Dramatic" },
  { value: "hype", label: "Hype" },
  { value: "calm", label: "Calm" },
];

const HELPER_MODE_OPTIONS: Array<{ value: HelperMode; label: string }> = [
  { value: "scripted", label: "Scripted" },
  { value: "ai", label: "AI" },
];

export function ProfileMenu({
  settings,
  aiAvailable,
  error,
  onSave,
}: {
  settings: SettingsData;
  /** Server-computed Anthropic key presence (GET /api/settings); the toggle
   * needs it because the browser cannot read env vars (SPEC 8.15). */
  aiAvailable: boolean;
  error: string | null;
  onSave: (next: {
    display_name?: string;
    completion_style?: CelebrationStyle;
    helper_mode?: HelperMode;
    wind_down_time?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(settings.display_name);
  const [timeDraft, setTimeDraft] = useState(settings.wind_down_time);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameDraft(settings.display_name);
    setTimeDraft(settings.wind_down_time);
  }, [settings.display_name, settings.wind_down_time]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--fg)]"
      >
        Profile
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-[0_6px_16px_rgba(0,0,0,0.3)]">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const next = nameDraft.trim();
              if (next && next !== settings.display_name) onSave({ display_name: next });
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Display name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Your work self nickname"
                aria-label="Display name"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
              />
            </label>
            <button
              type="submit"
              disabled={nameDraft.trim() === "" || nameDraft.trim() === settings.display_name}
              className="w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
            >
              Save name
            </button>
          </form>

          <fieldset className="mt-4">
            <legend className="text-sm text-[var(--muted)]">Completion message</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (option.value !== settings.completion_style) onSave({ completion_style: option.value });
                  }}
                  aria-pressed={settings.completion_style === option.value}
                  className="rounded-md border px-3 py-1.5 text-sm"
                  style={
                    settings.completion_style === option.value
                      ? { borderColor: "var(--muted)", color: "var(--fg)" }
                      : { borderColor: "var(--line)", color: "var(--fg)" }
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {celebrationMessage(settings.completion_style, settings.display_name)}
            </p>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-sm text-[var(--muted)]">Helper mode</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {HELPER_MODE_OPTIONS.map((option) => {
                // SPEC 8.15: AI needs the Anthropic key configured in Vercel;
                // without it the button is disabled with the hint below.
                const disabled = option.value === "ai" && !aiAvailable;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (option.value !== settings.helper_mode) onSave({ helper_mode: option.value });
                    }}
                    disabled={disabled}
                    aria-pressed={settings.helper_mode === option.value}
                    className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                    style={
                      settings.helper_mode === option.value
                        ? { borderColor: "var(--accent-ink)", color: "var(--accent-ink)" }
                        : { borderColor: "var(--line)", color: "var(--fg)" }
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {!aiAvailable && (
              <p className="mt-2 text-xs text-[var(--muted)]">Add your Anthropic key in Vercel to turn this on</p>
            )}
          </fieldset>

          <form
            className="mt-4 border-t border-[var(--line)] pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const next = timeDraft.trim();
              if (next !== settings.wind_down_time) onSave({ wind_down_time: next });
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Wind down time</span>
              <input
                type="text"
                value={timeDraft}
                onChange={(event) => setTimeDraft(event.target.value)}
                placeholder="21:30"
                aria-label="Wind down time"
                className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
              />
            </label>
            <button
              type="submit"
              disabled={timeDraft.trim() === settings.wind_down_time}
              className="mt-2 w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)] disabled:opacity-50"
            >
              Save wind down time
            </button>
          </form>

          {error && <p className="mt-3 text-sm text-[var(--bad)]">{error}</p>}

          <form action="/api/logout" method="post" className="mt-4 border-t border-[var(--line)] pt-3">
            <button
              type="submit"
              className="w-full rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--fg)]"
            >
              Lock
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

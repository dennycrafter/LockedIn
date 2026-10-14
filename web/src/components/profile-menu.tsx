"use client";

// Profile menu (SPEC 10 top bar): Display name, Completion message, Helper
// mode (SPEC 8.15) and the wind-down time target (SPEC 8.12) here; Lock is
// the existing logout.
// UI polish (Oct 2026): a round initial button on the right of the top bar,
// text fields save when you leave them (no separate Save buttons), and the
// choices use the shared segmented control.

import { useEffect, useRef, useState } from "react";
import type { CelebrationStyle, HelperMode, SettingsData } from "@/lib/dashboard-data";
import { celebrationMessage } from "@/lib/celebration";
import { initialOf } from "@/lib/ui-format";
import { FIELD_LABEL, INPUT, Segmented } from "./ui";

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
  align = "right",
  statusColor,
  statusText,
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
  /** Which edge of the button the pop-up lines up with. */
  align?: "left" | "right";
  /** Small dot on the circle: green when the extension answers, yellow when it does not. */
  statusColor?: string;
  statusText?: string;
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

  const saveName = () => {
    const next = nameDraft.trim();
    if (next === "") {
      setNameDraft(settings.display_name);
      return;
    }
    if (next !== settings.display_name) onSave({ display_name: next });
  };

  const saveTime = () => {
    const next = timeDraft.trim();
    if (next !== settings.wind_down_time) onSave({ wind_down_time: next });
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Profile"
        title={statusText ? `Profile. ${statusText}` : "Profile"}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--fg)] transition-colors hover:border-[var(--muted)]"
      >
        {initialOf(settings.display_name)}
        {statusColor && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)]"
            style={{ background: statusColor }}
          />
        )}
      </button>

      {open && (
        <div
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full z-30 mt-2 w-[min(19rem,calc(100vw-32px))] rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 shadow-[0_6px_16px_rgba(0,0,0,0.3)]`}
        >
          {statusText && (
            <p className="mb-3 flex items-center gap-2 border-b border-[var(--line)] pb-3 text-[13px] text-[var(--muted)]">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
              {statusText}
            </p>
          )}

          <label className={FIELD_LABEL} htmlFor="profile-display-name">
            Display name
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder="Your work self nickname"
            aria-label="Display name"
            className={INPUT}
          />

          <fieldset className="mt-4">
            <legend className={FIELD_LABEL}>Completion message</legend>
            <Segmented
              label="Completion message"
              className="flex w-full"
              value={settings.completion_style}
              onChange={(value) => onSave({ completion_style: value })}
              options={STYLE_OPTIONS}
            />
            <p className="mt-2 text-[13px] text-[var(--muted)]">
              {celebrationMessage(settings.completion_style, settings.display_name)}
            </p>
          </fieldset>

          <fieldset className="mt-4">
            <legend className={FIELD_LABEL}>Helper mode</legend>
            {/* SPEC 8.15: AI needs the Anthropic key configured in Vercel;
                without it the button is disabled with the hint below. */}
            <Segmented
              label="Helper mode"
              className="flex w-full"
              value={settings.helper_mode}
              onChange={(value) => onSave({ helper_mode: value })}
              options={HELPER_MODE_OPTIONS.map((option) => ({
                ...option,
                disabled: option.value === "ai" && !aiAvailable,
              }))}
            />
            {!aiAvailable && (
              <p className="mt-2 text-[13px] text-[var(--muted)]">Add your Anthropic key in Vercel to turn this on</p>
            )}
          </fieldset>

          <label className={`${FIELD_LABEL} mt-4`} htmlFor="profile-wind-down-time">
            Wind down time
          </label>
          <input
            id="profile-wind-down-time"
            type="text"
            value={timeDraft}
            onChange={(event) => setTimeDraft(event.target.value)}
            onBlur={saveTime}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            placeholder="21:30"
            aria-label="Wind down time"
            className={INPUT}
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">Fields save when you leave them.</p>

          {error && <p className="mt-3 text-[13px] text-[var(--bad)]">{error}</p>}

          <form action="/api/logout" method="post" className="mt-4 border-t border-[var(--line)] pt-3">
            <button
              type="submit"
              className="w-full rounded-md px-3 py-1.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--fg)]"
            >
              Lock dashboard (log out)
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

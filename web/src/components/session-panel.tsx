"use client";

// Active session panel (SPEC 8.4 left column): big timer, lock pill, pause,
// +-5, End, manual infraction input. The extension owns the state; this panel
// mirrors it through getState and sends control messages over the bridge.
// A soft lock's early end shows the 2 minute unlock countdown with "Keep
// working" to cancel it; a hard lock disables End. UI polish (Oct 2026): the
// countdown shows once, with the project under the task and a progress bar.
import type { ExtensionSession } from "@/lib/extension-session";
import { formatCountdown, sessionRemainingMs } from "@/lib/extension-session";
import { sessionPhase } from "@/lib/session-phase";

import { useState } from "react";
import { BTN_QUIET, BTN_SECONDARY, INPUT } from "./ui";

const LOCK_TEXT: Record<ExtensionSession["lockMode"], string> = {
  none: "No lock",
  soft: "Soft lock",
  hard: "Hard lock",
};

export function SessionPanel({
  session,
  projectName,
  nowMs,
  softUnlockAtMs,
  floatEnabled,
  onToggleFloat,
  onControl,
  onManualInfraction,
}: {
  session: ExtensionSession;
  /** The project the session belongs to, shown under the task name. */
  projectName: string | null;
  nowMs: number;
  softUnlockAtMs: number | null;
  floatEnabled: boolean;
  onToggleFloat: (enabled: boolean) => void;
  onControl: (method: "pause" | "resume" | "addTime" | "requestEnd" | "cancelEnd", payload?: unknown) => void;
  onManualInfraction: (text: string) => void;
}) {
  const [distractionOpen, setDistractionOpen] = useState(false);
  const phase = sessionPhase(session, softUnlockAtMs);
  const remainingMs = sessionRemainingMs(session, nowMs);
  const remaining = formatCountdown(remainingMs);
  const paused = phase === "paused";
  const ending = phase === "ending";
  const hardLocked = session.lockMode === "hard";
  // While ending, the number that matters is when the sites unlock again.
  const unlockRemaining =
    ending && softUnlockAtMs !== null ? formatCountdown(Math.max(0, softUnlockAtMs - nowMs)) : null;
  const totalMs = Math.max(1, (session.plannedSeconds + session.addedSeconds) * 1000);
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
  const label = session.label || "Focus session";
  const context = projectName && projectName !== label ? projectName : null;

  return (
    <section aria-label="Active session" className="rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="min-w-0 break-words text-[15px] font-semibold text-[var(--fg)]">{label}</h2>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">
              {LOCK_TEXT[session.lockMode]}
            </span>
          </div>
          {context && <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{context}</p>}
          <div
            className="mt-1 text-[3.5rem] leading-none tracking-tight text-[var(--fg)] tabular-nums"
            style={{ fontFamily: "var(--font-saira), ui-sans-serif, system-ui, sans-serif" }}
            role="timer"
            aria-label={ending ? `Sites unlock in ${unlockRemaining}` : `Time remaining ${remaining}`}
          >
            {ending ? unlockRemaining : remaining}
          </div>
          {paused && !ending && <p className="mt-1.5 text-[13px] text-[var(--warn)]">Paused. Blocking stays on.</p>}
          {ending && <p className="mt-1.5 text-[13px] text-[var(--warn)]">Ending early. Sites stay blocked until this finishes.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onControl(paused ? "resume" : "pause")}
            className={BTN_SECONDARY}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => onControl("addTime", { seconds: -300 })}
            aria-label="Remove five minutes of added time"
            className={BTN_SECONDARY}
          >
            -5 min
          </button>
          <button
            type="button"
            onClick={() => onControl("addTime", { seconds: 300 })}
            aria-label="Add five minutes"
            className={BTN_SECONDARY}
          >
            +5 min
          </button>
          {ending ? (
            <button
              type="button"
              onClick={() => onControl("cancelEnd")}
              aria-label="Keep working, cancel the end countdown"
              title="Cancel the countdown and keep the session running"
              className={BTN_SECONDARY}
            >
              Keep working
            </button>
          ) : hardLocked ? (
            <button
              type="button"
              disabled
              title="Hard lock: this session runs until the timer ends"
              aria-label="End session, disabled because the hard lock is running"
              className={BTN_SECONDARY}
            >
              End
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onControl("requestEnd")}
              aria-label="End session"
              className={BTN_SECONDARY}
            >
              End
            </button>
          )}
        </div>
      </div>

      <div className="h-1 bg-[var(--surface-2)]" aria-hidden>
        <div className="h-full bg-[var(--silver)] transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-5">
        <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <input
            type="checkbox"
            checked={floatEnabled}
            onChange={(event) => onToggleFloat(event.target.checked)}
            aria-label="Show the floating timer on other sites"
            className="h-4 w-4 accent-[var(--silver)]"
          />
          Float timer on other sites
        </label>
        {distractionOpen ? (
          <form
            className="flex min-w-[16rem] flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.elements.namedItem("distraction");
              if (input instanceof HTMLInputElement && input.value.trim() !== "") {
                onManualInfraction(input.value.trim());
                input.value = "";
                setDistractionOpen(false);
              }
            }}
          >
            <input
              name="distraction"
              type="text"
              autoFocus
              placeholder="What pulled you away? Enter to log it"
              aria-label="Record what distracted you"
              onKeyDown={(event) => {
                if (event.key === "Escape") setDistractionOpen(false);
              }}
              className={`${INPUT} py-1.5`}
            />
          </form>
        ) : (
          <button type="button" onClick={() => setDistractionOpen(true)} className={`${BTN_QUIET} -ml-2 text-[13px]`}>
            Got distracted? Log it
          </button>
        )}
      </div>
    </section>
  );
}

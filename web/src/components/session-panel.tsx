"use client";

// Active session panel (SPEC 8.4 left column): big timer, lock pill, pause,
// +-5, End, manual infraction input. The extension owns the state; this panel
// mirrors it through getState and sends control messages over the bridge.
// A soft lock's early end shows the 2 minute unlock countdown with "Keep
// working" to cancel it; a hard lock disables End with the end time in it.
import type { ExtensionSession } from "@/lib/extension-session";
import { formatCountdown, sessionRemainingMs } from "@/lib/extension-session";
import { sessionPhase } from "@/lib/session-phase";

function lockPillStyle(lockMode: ExtensionSession["lockMode"]): { background: string; color: string } {
  if (lockMode === "hard") return { background: "color-mix(in srgb, var(--bad) 18%, transparent)", color: "var(--bad)" };
  if (lockMode === "soft") return { background: "color-mix(in srgb, var(--warn) 18%, transparent)", color: "var(--warn)" };
  return { background: "color-mix(in srgb, var(--info) 18%, transparent)", color: "var(--info)" };
}

export function SessionPanel({
  session,
  nowMs,
  softUnlockAtMs,
  onControl,
  onManualInfraction,
}: {
  session: ExtensionSession;
  nowMs: number;
  softUnlockAtMs: number | null;
  onControl: (method: "pause" | "resume" | "addTime" | "requestEnd" | "cancelEnd", payload?: unknown) => void;
  onManualInfraction: (text: string) => void;
}) {
  const phase = sessionPhase(session, softUnlockAtMs);
  const remaining = formatCountdown(sessionRemainingMs(session, nowMs));
  const paused = phase === "paused";
  const ending = phase === "ending";
  const hardLocked = session.lockMode === "hard";
  // While ending, the number that matters is when the sites unlock again.
  const unlockRemaining =
    ending && softUnlockAtMs !== null ? formatCountdown(Math.max(0, softUnlockAtMs - nowMs)) : null;
  const pill = lockPillStyle(session.lockMode);

  return (
    <section aria-label="Active session" className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm text-[var(--muted)]">{session.label || "Focus session"}</h3>
        <span className="rounded-full px-2.5 py-0.5 text-xs capitalize" style={pill}>
          {session.lockMode} lock
        </span>
      </div>

      <div
        className="mt-2 text-6xl tracking-tight text-[var(--fg)]"
        style={{ fontFamily: "var(--font-saira), inherit" }}
        role="timer"
        aria-label={ending ? `Sites unlock in ${unlockRemaining}` : `Time remaining ${remaining}`}
      >
        {ending ? unlockRemaining : remaining}
      </div>
      {paused && !ending && <p className="mt-1 text-sm text-[var(--warn)]">Paused. Blocking stays on.</p>}
      {ending && <p className="mt-1 text-sm text-[var(--warn)]">Ending early. Sites stay blocked until this finishes.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onControl(paused ? "resume" : "pause")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => onControl("addTime", { seconds: 300 })}
          aria-label="Add five minutes"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          +5
        </button>
        <button
          type="button"
          onClick={() => onControl("addTime", { seconds: -300 })}
          aria-label="Remove five minutes of added time"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          -5
        </button>
        {ending ? (
          <button
            type="button"
            onClick={() => onControl("cancelEnd")}
            aria-label="Keep working, cancel the end countdown"
            title="Cancel the countdown and keep the session running"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
          >
            Keep working
          </button>
        ) : hardLocked ? (
          <button
            type="button"
            disabled
            title={`Hard lock: ends in ${remaining}`}
            aria-label="End session, disabled because the hard lock is running"
            className="cursor-not-allowed rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            Hard lock: ends in {remaining}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onControl("requestEnd")}
            aria-label="End session"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
          >
            End session
          </button>
        )}
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("distraction");
          if (input instanceof HTMLInputElement && input.value.trim() !== "") {
            onManualInfraction(input.value.trim());
            input.value = "";
          }
        }}
      >
        <input
          name="distraction"
          type="text"
          placeholder="Got distracted by..."
          aria-label="Record what distracted you"
          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--fg)] placeholder:text-[var(--muted)]"
        />
        <button
          type="submit"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Add
        </button>
      </form>
    </section>
  );
}

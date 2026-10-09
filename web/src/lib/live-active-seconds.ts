import type { ExtensionSession } from "./extension-session";

// Live active seconds of the running session, shown by the stats strip
// (SPEC 8.16). Mirrors the extension's computeActiveSeconds (extension session
// ownership, SPEC 8.4): active time excludes every pause. While paused the
// value freezes at the pause instant: the reference stops at pausedAtMs, so
// only completed pauses (pausedTotalMs) are subtracted. Subtracting the open
// pause again on top would make the display shrink while paused.
export function liveActiveSeconds(session: ExtensionSession, nowMs: number): number {
  const reference = session.pausedAtMs ?? nowMs;
  const elapsedMs = reference - session.startedAtMs;
  return Math.max(0, Math.floor((elapsedMs - session.pausedTotalMs) / 1000));
}

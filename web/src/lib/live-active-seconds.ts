import type { ExtensionSession } from "./extension-session";

// Live active seconds of the running session, shown by the stats strip
// (SPEC 8.16). Extracted verbatim from components/stats-strip.tsx to make the
// math unit-testable (vitest cannot parse the component's JSX); the shipped
// behavior is unchanged, bug included, so the new suite runs red first.
export function liveActiveSeconds(session: ExtensionSession, nowMs: number): number {
  const reference = session.pausedAtMs ?? nowMs;
  const elapsedMs = reference - session.startedAtMs;
  const pausedMs = session.pausedAtMs
    ? session.pausedTotalMs + (nowMs - session.pausedAtMs)
    : session.pausedTotalMs;
  return Math.max(0, Math.floor((elapsedMs - pausedMs) / 1000));
}

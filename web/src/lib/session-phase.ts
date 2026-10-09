// Which state the active session is in for the panel UI (SPEC 8.4):
// running (normal countdown), paused (countdown stopped, blocking kept on),
// or ending (the soft lock's 2 minute unlock countdown is running).
import type { ExtensionSession } from "./extension-session";

export type SessionPhase = "running" | "paused" | "ending";

export function sessionPhase(session: ExtensionSession, softUnlockAtMs: number | null): SessionPhase {
  if (softUnlockAtMs !== null) return "ending";
  if (session.pausedAtMs !== null) return "paused";
  return "running";
}

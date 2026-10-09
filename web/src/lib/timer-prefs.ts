// Per-device timer choices (SPEC 10 standing rule): the start dialog
// remembers the last duration and lock mode in localStorage, wrapped in
// try/catch so private mode or a full quota just loses the memory.
import type { LockMode } from "./extension-session";

export interface TimerPrefs {
  minutes: number;
  lockMode: LockMode;
}

const KEY = "lockedin-timer-prefs";
const LOCK_MODES: LockMode[] = ["none", "soft", "hard"];

export function loadTimerPrefs(): Partial<TimerPrefs> {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const prefs: Partial<TimerPrefs> = {};
    if (
      typeof record.minutes === "number" &&
      Number.isInteger(record.minutes) &&
      record.minutes >= 5 &&
      record.minutes <= 180
    ) {
      prefs.minutes = record.minutes;
    }
    if (typeof record.lockMode === "string" && LOCK_MODES.includes(record.lockMode as LockMode)) {
      prefs.lockMode = record.lockMode as LockMode;
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveTimerPrefs(prefs: TimerPrefs): void {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the default (25, hard) is used next time.
  }
}

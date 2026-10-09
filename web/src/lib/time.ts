// "Today" helpers (SPEC 12): every daily boundary uses America/Chicago, not
// UTC. Pure functions so vitest can pin the exact instants, DST edges included.

export const TIMEZONE = "America/Chicago";

function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const hour = parts.hour === "24" ? "0" : (parts.hour ?? "0");
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Calendar date key (YYYY-MM-DD) of an instant in America/Chicago. */
export function chicagoDateKey(instant: Date): string {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return key;
}

/** Today's calendar date key in America/Chicago. */
export function todayKey(now: Date = new Date()): string {
  return chicagoDateKey(now);
}

/**
 * The UTC instant of local midnight in America/Chicago for a date key. Works
 * across DST: midnight always exists in Chicago (transitions are at 2am).
 */
export function chicagoDayStartUtc(dateKey: string): Date {
  // Guess midnight UTC, correct by the local offset, then verify the corrected
  // instant really lands on the requested Chicago date.
  let guess = new Date(`${dateKey}T00:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const corrected = new Date(guess.getTime() - tzOffsetMs(guess, TIMEZONE));
    if (chicagoDateKey(corrected) === dateKey) return corrected;
    guess = corrected;
  }
  // Unreachable for real date keys; fail loudly rather than drift a day.
  throw new Error(`Could not resolve midnight for ${dateKey}`);
}

/** The UTC instant that starts "today" in America/Chicago. */
export function chicagoTodayStart(now: Date = new Date()): Date {
  return chicagoDayStartUtc(todayKey(now));
}

/** True when two instants fall on the same America/Chicago calendar day. */
export function isSameChicagoDay(a: Date, b: Date): boolean {
  return chicagoDateKey(a) === chicagoDateKey(b);
}

/** Focused-time display, `h m s` style per SPEC 8.16. */
export function formatFocusedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

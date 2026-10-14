// Small display helpers for the dashboard (UI polish, Oct 2026). Pure so
// vitest can pin them without a DOM.

import { planDateHeading, type TomorrowPlan } from "./tomorrow-plan";

/** "1h 55m", "45m", "0m": the stats strip shows minutes, never ticking seconds. */
export function formatWorkToday(totalSeconds: number): string {
  const minutesTotal = Math.max(0, Math.floor(totalSeconds / 60));
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** "1 decision", "2 decisions". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Card title that says which day the plan is for: "Today's plan", "Tomorrow's plan", "Friday's plan". */
export function planCardTitle(planDateKey: string, now: Date): string {
  return `${planDateHeading(planDateKey, now)}'s plan`;
}

/** "Starts 09:00 · Library"; the day lives in the title, so it is not repeated here. */
export function planDetailsLine(plan: Pick<TomorrowPlan, "startTime" | "location">): string {
  const parts: string[] = [];
  if (plan.startTime !== "") parts.push(`Starts ${plan.startTime}`);
  if (plan.location !== "") parts.push(plan.location);
  return parts.join(" · ");
}

/** Split items into open and done, keeping their order, so done ones can hide behind a toggle. */
export function splitDone<T extends { done: boolean }>(items: T[]): { open: T[]; done: T[] } {
  return { open: items.filter((item) => !item.done), done: items.filter((item) => item.done) };
}

/** First letter of the display name for the profile circle; "?" when empty. */
export function initialOf(name: string): string {
  const first = name.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

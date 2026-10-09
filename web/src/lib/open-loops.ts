// Open loops and decisions (SPEC 8.8): count math and the fixed prompt
// wording. Pure functions so the panel renders counts from any list and the
// tests pin the exact text the owner sees.

export type OpenLoopKind = "loop" | "decision";

export interface OpenLoopItem {
  kind: OpenLoopKind;
}

export function loopCount(items: OpenLoopItem[]): number {
  return items.filter((item) => item.kind === "loop").length;
}

export function decisionCount(items: OpenLoopItem[]): number {
  return items.filter((item) => item.kind === "decision").length;
}

/** Header total: everything saved, loops and decisions together. */
export function totalSavedCount(items: OpenLoopItem[]): number {
  return items.length;
}

// "Prompt questions to unload your brain" list, verbatim from SPEC 8.8.
export const UNLOAD_PROMPTS: readonly string[] = [
  "Is anything bugging me that I haven't written down?",
  "Is there a message I'm waiting to send or reply to?",
  "Is there a decision I keep circling?",
  "Is there something I promised someone?",
  "Is there an appointment or deadline I'm holding in my head?",
];

// "What's an open loop?" one-line explainer, verbatim from SPEC 8.8.
export const OPEN_LOOP_EXPLAINER =
  "Anything sitting in your head that isn't written down. Park it here so your brain is free for the task.";

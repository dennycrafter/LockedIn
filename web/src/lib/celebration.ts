// Completion celebration logic (SPEC 8.10). Pure functions: the message
// wording per style, and the trigger decision for ticking the last undone
// item of a project.

export type CelebrationStyle = "dramatic" | "hype" | "calm";

export function celebrationMessage(style: CelebrationStyle, name: string): string {
  const who = name.trim() === "" ? "Boss" : name.trim();
  switch (style) {
    case "dramatic":
      return `${who}. You came, you locked in, you won the day.`;
    case "hype":
      return `LET'S GO ${who}! Everything done!`;
    case "calm":
      return `Nice work, ${who}. All done.`;
  }
}

export interface ProgressLike {
  done: number;
  total: number;
}

/**
 * True when this tick completed the project: at least one item exists, every
 * item is done after the tick, and the tick actually increased the done count
 * (so re-renders and unticks never fire it).
 */
export function shouldCelebrate(before: ProgressLike, after: ProgressLike): boolean {
  return after.total > 0 && after.done === after.total && after.done > before.done;
}

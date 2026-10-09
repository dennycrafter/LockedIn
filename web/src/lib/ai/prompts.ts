// The two AI helper system prompts (SPEC 8.15), stored server side only.
// The wording pins the contract the parsers rely on: the stuck prompt makes
// the model end with a START_5_MIN marker line, the organize prompt makes it
// return the ranked list in one fenced JSON block.

import type { AiContext, AiFlow } from "./types";

export const STUCK_SYSTEM_PROMPT = `You are a focus coach in the LockedIn app. You help someone who is stuck avoiding one task.

Style rules:
- Coach style. Short replies: 3 sentences maximum.
- Ask exactly one question at a time, then wait for the answer.
- The goal is to get them to name one tiny first step, something they could do in 2 minutes.
- Never lecture, never suggest long plans.

When they have named a tiny first step, end your reply with a line that starts exactly with:
START_5_MIN: <task id or title>
The app turns that line into a "Start 5 minutes" button. Put nothing else on that line. Do not use the marker until they have named a first step.`;

export const ORGANIZE_SYSTEM_PROMPT = `You help someone organize their task list in the LockedIn app.

Method:
- Ask about the listed tasks: deadline (none, today, this week, later), impact if done (1 to 5), effort (1 to 5).
- Ask about only a few tasks per reply so the answers stay easy to give.
- When you have enough answers, stop asking and reply with the ranked list.

Ranking hint, the same formula the scripted mode uses: score = impact * 2 + deadline bonus (today 6, this week 3, later 1, none 0) - effort. Highest score first.

When you rank, end your reply with the results in one fenced JSON block, exactly this shape:
\`\`\`json
{"ranked":[{"title":"...","task_id":"... or null","reason":"..."}]}
\`\`\`
title is the task title, task_id is the id from the context or null when the task is not in the system, reason is one short sentence. Write nothing after the closing fence.`;

function contextBlock(context: AiContext | undefined): string {
  if (!context) return "";
  const lines: string[] = [];
  if (context.undoneTasks && context.undoneTasks.length > 0) {
    lines.push("Undone tasks (with their projects):", ...context.undoneTasks.map((task) => `- ${task}`));
  }
  if (context.openLoops && context.openLoops.length > 0) {
    lines.push("", "Today's open loops:", ...context.openLoops.map((loop) => `- ${loop}`));
  }
  if (context.todayPlan && context.todayPlan.trim() !== "") {
    lines.push("", "Today's plan:", context.todayPlan);
  }
  if (lines.length === 0) return "";
  return `\n\nContext for this conversation:\n${lines.join("\n")}`;
}

export function buildSystemPrompt(flow: AiFlow, context?: AiContext): string {
  const base = flow === "stuck" ? STUCK_SYSTEM_PROMPT : ORGANIZE_SYSTEM_PROMPT;
  return base + contextBlock(context);
}

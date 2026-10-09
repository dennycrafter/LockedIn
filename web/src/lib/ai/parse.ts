// Parsing of structured AI replies (SPEC 8.15): the START_5_MIN marker for
// the stuck flow and the fenced ranked JSON for the organize flow. Invalid or
// missing structure returns a typed error, never a raw throw, so the UI can
// show it and offer "Switch to scripted".

import type { RankedItem, StuckReply } from "./types";

// SPEC 8.15: the model ends a stuck reply with a line containing exactly
// "START_5_MIN: <task id or title>". Detection tolerates the marker anywhere
// in the line (models like to bold it); extraction takes what follows it.
export const START_MARKER = "START_5_MIN:";

export function parseStuckReply(text: string): StuckReply {
  const lines = text.split("\n");
  const markerIndex = lines.findIndex((line) => line.includes(START_MARKER));
  if (markerIndex === -1) {
    return { reply: text.trim(), start5min: false, startRef: null };
  }
  const markerLine = lines[markerIndex];
  // Strip wrapping markdown and stray spaces the model sometimes adds around
  // the ref, from both ends.
  const rawRef = markerLine
    .slice(markerLine.indexOf(START_MARKER) + START_MARKER.length)
    .replace(/^[\s`*_]+/, "")
    .replace(/[\s`*_]+$/, "")
    .trim();
  // Keep any words that shared the line with the marker, e.g. "Let's begin.
  // START_5_MIN: intro" keeps "Let's begin." as chat text.
  const before = markerLine.slice(0, markerLine.indexOf(START_MARKER)).trim();
  const rest = [...lines.slice(0, markerIndex), ...(before ? [before] : []), ...lines.slice(markerIndex + 1)]
    .join("\n")
    .trim();
  return {
    reply: rest,
    start5min: true,
    startRef: rawRef === "" ? null : rawRef,
  };
}

const FENCE_RE = /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/g;

function validateRanked(parsed: unknown): { ok: true; ranked: RankedItem[] } | { ok: false; error: string } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "The ranked JSON must be an object with a ranked array" };
  }
  const ranked = (parsed as { ranked?: unknown }).ranked;
  if (!Array.isArray(ranked) || ranked.length === 0) {
    return { ok: false, error: "ranked must be a non-empty array" };
  }
  const items: RankedItem[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const raw = ranked[i] as { title?: unknown; task_id?: unknown; reason?: unknown } | null;
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `ranked[${i}] must be an object` };
    }
    if (typeof raw.title !== "string" || raw.title.trim() === "") {
      return { ok: false, error: `ranked[${i}].title must be a non-empty string` };
    }
    if (raw.task_id !== undefined && raw.task_id !== null && typeof raw.task_id !== "string") {
      return { ok: false, error: `ranked[${i}].task_id must be a string or null` };
    }
    items.push({
      title: raw.title.trim(),
      taskId: typeof raw.task_id === "string" && raw.task_id.trim() !== "" ? raw.task_id : null,
      reason: typeof raw.reason === "string" ? raw.reason : "",
    });
  }
  return { ok: true, ranked: items };
}

export type ParsedRanked = { ok: true; ranked: RankedItem[] } | { ok: false; error: string };

// Tries every fenced block first (in order), then the whole reply as bare
// JSON. A missing or unusable block is a typed error carrying the most
// specific validation problem seen.
export function parseRankedReply(text: string): ParsedRanked {
  const candidates: string[] = [];
  for (const match of text.matchAll(FENCE_RE)) {
    if (match[1] && match[1].trim() !== "") candidates.push(match[1]);
  }
  const trimmed = text.trim();
  if (candidates.length === 0 && trimmed !== "") candidates.push(trimmed);

  let lastError = "The AI reply did not contain a usable ranked JSON block";
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      continue; // Not JSON; try the next candidate.
    }
    const checked = validateRanked(parsed);
    if (checked.ok) return checked;
    lastError = checked.error;
  }
  return { ok: false, error: lastError };
}

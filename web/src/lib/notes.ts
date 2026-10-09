// Notes math (SPEC 8.7): a note's title is its first line. Pure functions so
// the dashboard panel and the pop out window render a note identically.

export interface NoteData {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export const NOTE_TITLE_FALLBACK = "Untitled";

/** The first line of the body, trimmed. An empty body has no title. */
export function noteTitle(body: string): string {
  const firstLine = body.split("\n", 1)[0] ?? "";
  return firstLine.trim();
}

/** Title for display: the parsed first line, or a quiet fallback label. */
export function noteDisplayTitle(body: string): string {
  const title = noteTitle(body);
  return title === "" ? NOTE_TITLE_FALLBACK : title;
}

/** One-line preview of what follows the title, clipped to maxLen. */
export function notePreview(body: string, maxLen = 90): string {
  const rest = body
    .split("\n")
    .slice(1)
    .join(" ")
    .trim();
  if (rest.length <= maxLen) return rest;
  return `${rest.slice(0, Math.max(1, maxLen - 1))}\u2026`;
}

/** A body with the typed title line removed, for labels that repeat it. */
export function noteBodyWithoutTitle(body: string): string {
  const lines = body.split("\n");
  return lines.slice(1).join("\n");
}

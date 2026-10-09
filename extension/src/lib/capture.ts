import type { QueuedSnippet } from "./queue";

// Right-click capture payload (SPEC 8.7): pure builder so the shape is
// unit-tested apart from the picker UI. The page URL is appended to the
// context on its own line; empty parts are skipped.

export interface PageSnippetParams {
  id: string;
  ownerType: "project" | "task";
  ownerId: string;
  text: string;
  url: string;
  context: string;
  capturedAt: string; // ISO
}

export function buildPageSnippet(params: PageSnippetParams): QueuedSnippet {
  const contextParts = [params.context.trim(), params.url.trim()].filter((part) => part !== "");
  return {
    id: params.id,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    content: params.text.trim(),
    context: contextParts.join("\n"),
    source: "page",
    createdAt: params.capturedAt,
  };
}

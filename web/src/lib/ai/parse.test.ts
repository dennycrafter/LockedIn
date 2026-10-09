// Unit tests for the AI reply parsers (SPEC 8.15). Stubbed strings only, no
// network: malformed and missing structures must return typed errors, never
// throw.

import { describe, expect, it } from "vitest";
import { parseRankedReply, parseStuckReply, START_MARKER } from "./parse";

describe("parseStuckReply (SPEC 8.15 START_5_MIN marker)", () => {
  it("returns the reply untouched when there is no marker", () => {
    const parsed = parseStuckReply("What feels hardest about it right now?");
    expect(parsed).toEqual({
      reply: "What feels hardest about it right now?",
      start5min: false,
      startRef: null,
    });
  });

  it("extracts the task title from a marker line and removes the line from the reply", () => {
    const text = "Good, that is small enough to start.\nSTART_5_MIN: Write intro";
    const parsed = parseStuckReply(text);
    expect(parsed.start5min).toBe(true);
    expect(parsed.startRef).toBe("Write intro");
    expect(parsed.reply).toBe("Good, that is small enough to start.");
  });

  it("accepts a task id as the ref", () => {
    const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const parsed = parseStuckReply(`${START_MARKER} ${id}`);
    expect(parsed.start5min).toBe(true);
    expect(parsed.startRef).toBe(id);
    expect(parsed.reply).toBe("");
  });

  it("treats a bare marker as startable with no ref", () => {
    const parsed = parseStuckReply("Let's go.\nSTART_5_MIN:");
    expect(parsed.start5min).toBe(true);
    expect(parsed.startRef).toBe(null);
    expect(parsed.reply).toBe("Let's go.");
  });

  it("keeps words that shared the line before the marker", () => {
    const parsed = parseStuckReply("Okay then. START_5_MIN: open the doc");
    expect(parsed.start5min).toBe(true);
    expect(parsed.startRef).toBe("open the doc");
    expect(parsed.reply).toBe("Okay then.");
  });

  it("strips markdown wrappers around the ref", () => {
    const parsed = parseStuckReply("**START_5_MIN:** `Write intro`");
    expect(parsed.start5min).toBe(true);
    expect(parsed.startRef).toBe("Write intro");
  });

  it("uses only the first marker line when the model repeats itself", () => {
    const parsed = parseStuckReply("START_5_MIN: first\nSTART_5_MIN: second");
    expect(parsed.startRef).toBe("first");
    expect(parsed.reply).toBe("START_5_MIN: second");
  });
});

describe("parseRankedReply (SPEC 8.15 ranked JSON)", () => {
  const item = { title: "Write intro", task_id: "task-1", reason: "Highest impact" };

  it("parses a happy path fenced json block", () => {
    const text = `Here is the ranking.\n\`\`\`json\n${JSON.stringify({ ranked: [item] })}\n\`\`\``;
    const parsed = parseRankedReply(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.ranked).toEqual([{ title: "Write intro", taskId: "task-1", reason: "Highest impact" }]);
    }
  });

  it("parses an untagged fence", () => {
    const text = `\`\`\`\n${JSON.stringify({ ranked: [{ title: "A", task_id: null, reason: "" }] })}\n\`\`\``;
    const parsed = parseRankedReply(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ranked[0].taskId).toBe(null);
  });

  it("parses bare JSON when the whole reply is the object", () => {
    const parsed = parseRankedReply(JSON.stringify({ ranked: [item] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ranked).toHaveLength(1);
  });

  it("defaults a missing task_id to null and a missing reason to an empty string", () => {
    const parsed = parseRankedReply(JSON.stringify({ ranked: [{ title: "Only title" }] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ranked[0]).toEqual({ title: "Only title", taskId: null, reason: "" });
  });

  it("keeps order as given so the UI can rank by position", () => {
    const ranked = [
      { title: "B", task_id: null, reason: "second" },
      { title: "A", task_id: null, reason: "first" },
    ];
    const parsed = parseRankedReply(JSON.stringify({ ranked }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.ranked.map((r) => r.title)).toEqual(["B", "A"]);
  });

  it("returns a typed error for malformed JSON inside the fence", () => {
    const parsed = parseRankedReply("```json\n{\"ranked\":[{\"title\": }\n```");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("ranked JSON");
  });

  it("returns a typed error when there is no JSON at all", () => {
    const parsed = parseRankedReply("I asked about deadlines instead.");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("ranked JSON block");
  });

  it("returns a typed error when the ranked key is missing", () => {
    const parsed = parseRankedReply("```json\n{\"items\":[]}\n```");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("ranked must be a non-empty array");
  });

  it("returns a typed error when ranked is empty", () => {
    const parsed = parseRankedReply('{"ranked":[]}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("ranked must be a non-empty array");
  });

  it("returns a typed error naming the index when an item title is missing", () => {
    const parsed = parseRankedReply('{"ranked":[{"reason":"no title"},{"title":"ok","task_id":null,"reason":""}]}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("ranked[0].title must be a non-empty string");
  });

  it("returns a typed error when task_id has the wrong type", () => {
    const parsed = parseRankedReply('{"ranked":[{"title":"A","task_id":42,"reason":""}]}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("ranked[0].task_id must be a string or null");
  });

  it("returns a typed error for a top level array or string", () => {
    expect(parseRankedReply("[1,2]").ok).toBe(false);
    expect(parseRankedReply('"just a string"').ok).toBe(false);
    expect(parseRankedReply("").ok).toBe(false);
  });
});

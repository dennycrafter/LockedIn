import { describe, expect, it } from "vitest";
import { buildPageSnippet } from "./capture";

describe("buildPageSnippet", () => {
  it("builds the queue payload with the page URL appended to the context", () => {
    const snippet = buildPageSnippet({
      id: "11111111-1111-4111-8111-111111111111",
      ownerType: "task",
      ownerId: "22222222-2222-4222-8222-222222222222",
      text: "  Pricing ships in v2. ",
      url: "https://example.com/pricing-faq",
      context: "Sent to customers who ask",
      capturedAt: "2026-10-09T15:00:00.000Z",
    });
    expect(snippet).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      ownerType: "task",
      ownerId: "22222222-2222-4222-8222-222222222222",
      content: "Pricing ships in v2.",
      context: "Sent to customers who ask\nhttps://example.com/pricing-faq",
      source: "page",
      createdAt: "2026-10-09T15:00:00.000Z",
    });
  });

  it("appends only the URL when the context box is empty", () => {
    const snippet = buildPageSnippet({
      id: "11111111-1111-4111-8111-111111111111",
      ownerType: "project",
      ownerId: "22222222-2222-4222-8222-222222222222",
      text: "Read the section on caching",
      url: "https://example.com/docs",
      context: "   ",
      capturedAt: "2026-10-09T15:00:00.000Z",
    });
    expect(snippet.context).toBe("https://example.com/docs");
    expect(snippet.source).toBe("page");
  });

  it("keeps an empty context when there is no page URL", () => {
    const snippet = buildPageSnippet({
      id: "11111111-1111-4111-8111-111111111111",
      ownerType: "task",
      ownerId: "22222222-2222-4222-8222-222222222222",
      text: "Typed note",
      url: "",
      context: "",
      capturedAt: "2026-10-09T15:00:00.000Z",
    });
    expect(snippet.context).toBe("");
  });
});

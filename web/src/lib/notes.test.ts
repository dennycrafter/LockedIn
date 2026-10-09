import { describe, expect, it } from "vitest";
import { noteBodyWithoutTitle, noteDisplayTitle, notePreview, noteTitle, NOTE_TITLE_FALLBACK } from "./notes";

describe("noteTitle (first line is the title, SPEC 8.7)", () => {
  it("takes the first line", () => {
    expect(noteTitle("Call the bank\ndetails here\nmore")).toBe("Call the bank");
  });

  it("trims spaces around the first line", () => {
    expect(noteTitle("   Grocery run  \nrest")).toBe("Grocery run");
  });

  it("is empty for an empty body", () => {
    expect(noteTitle("")).toBe("");
  });

  it("is empty when the first line is only whitespace", () => {
    expect(noteTitle("   \nsecond line")).toBe("");
  });

  it("handles a single line without a newline", () => {
    expect(noteTitle("Just one line")).toBe("Just one line");
  });

  it("ignores later empty lines, not the first", () => {
    expect(noteTitle("Title\n\n\nbody")).toBe("Title");
  });
});

describe("noteDisplayTitle", () => {
  it("falls back to Untitled when there is no first line", () => {
    expect(noteDisplayTitle("")).toBe(NOTE_TITLE_FALLBACK);
    expect(noteDisplayTitle("\nbody only")).toBe(NOTE_TITLE_FALLBACK);
  });

  it("returns the parsed title otherwise", () => {
    expect(noteDisplayTitle("Read the spec\nthen sleep")).toBe("Read the spec");
  });
});

describe("notePreview", () => {
  it("joins the lines after the title into one line", () => {
    expect(notePreview("Title\npoint one\npoint two")).toBe("point one point two");
  });

  it("is empty for a title-only note", () => {
    expect(notePreview("Title only")).toBe("");
  });

  it("clips long previews and keeps an ellipsis", () => {
    const preview = notePreview("Title\n" + "x".repeat(200), 90);
    expect(preview.length).toBe(90);
    expect(preview.endsWith("\u2026")).toBe(true);
  });
});

describe("noteBodyWithoutTitle", () => {
  it("removes only the first line", () => {
    expect(noteBodyWithoutTitle("Title\nkeep\nthis")).toBe("keep\nthis");
  });

  it("is empty without a title line", () => {
    expect(noteBodyWithoutTitle("only")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./links";

describe("normalizeUrl", () => {
  it("prepends https:// to a bare domain (SPEC 8.3 test vector)", () => {
    expect(normalizeUrl("google.com")).toBe("https://google.com/");
  });

  it("keeps an existing https URL intact", () => {
    expect(normalizeUrl("https://example.com/page")).toBe("https://example.com/page");
  });

  it("keeps an existing http URL intact", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("trims whitespace", () => {
    expect(normalizeUrl("  example.org  ")).toBe("https://example.org/");
  });

  it("accepts a host:port shape", () => {
    expect(normalizeUrl("localhost:3000/app")).toBe("https://localhost:3000/app");
  });

  it("preserves paths and queries", () => {
    expect(normalizeUrl("docs.google.com/a?b=1")).toBe("https://docs.google.com/a?b=1");
  });

  it("rejects non-web schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("mailto:someone@example.com")).toBeNull();
  });

  it("rejects empty and junk input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { normalizeHostname } from "./hostname";

// Vectors shared with web/src/lib/hostname.test.ts (SPEC 8.5: full URL or
// bare domain in, lowercase hostname without "www." out, subdomains covered
// by the DNR requestDomains match which includes subdomains of the entry).
describe("normalizeHostname", () => {
  it("keeps bare domains", () => {
    expect(normalizeHostname("x.com")).toBe("x.com");
    expect(normalizeHostname("youtube.com")).toBe("youtube.com");
  });

  it("strips www.", () => {
    expect(normalizeHostname("www.youtube.com")).toBe("youtube.com");
    expect(normalizeHostname("WWW.YouTube.com")).toBe("youtube.com");
  });

  it("keeps subdomains as their own entry", () => {
    expect(normalizeHostname("sub.example.com")).toBe("sub.example.com");
  });

  it("accepts full URLs", () => {
    expect(normalizeHostname("https://www.youtube.com/watch?v=abc")).toBe("youtube.com");
    expect(normalizeHostname("http://Sub.Example.com/page#frag")).toBe("sub.example.com");
    expect(normalizeHostname("https://x.com/")).toBe("x.com");
  });

  it("lowercases and trims", () => {
    expect(normalizeHostname("  X.COM  ")).toBe("x.com");
  });

  it("strips ports and credentials", () => {
    expect(normalizeHostname("localhost:3000")).toBe("localhost");
    expect(normalizeHostname("https://user:pass@example.com:8443/x")).toBe("example.com");
  });

  it("allows single-label hosts for local testing", () => {
    expect(normalizeHostname("localhost")).toBe("localhost");
  });

  it("strips a trailing dot from FQDNs", () => {
    expect(normalizeHostname("example.com.")).toBe("example.com");
  });

  it("rejects junk", () => {
    expect(normalizeHostname("")).toBeNull();
    expect(normalizeHostname("   ")).toBeNull();
    expect(normalizeHostname("not a domain!!")).toBeNull();
    expect(normalizeHostname("mailto:someone@example.com")).toBeNull();
    expect(normalizeHostname("chrome://extensions")).toBeNull();
    expect(normalizeHostname("https://[::1]:8080/x")).toBeNull();
    expect(normalizeHostname("1.2.3.4.9")).toBeNull();
  });
});

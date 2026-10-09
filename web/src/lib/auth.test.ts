import { describe, expect, it } from "vitest";
import {
  parseSessionToken,
  safeEqualStrings,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "./auth";

const SECRET = "a".repeat(64);

describe("safeEqualStrings", () => {
  it("matches identical strings", () => {
    expect(safeEqualStrings("same", "same")).toBe(true);
  });

  it("rejects different strings", () => {
    expect(safeEqualStrings("same", "sane")).toBe(false);
  });

  it("rejects prefixes and extensions", () => {
    expect(safeEqualStrings("short", "shorter")).toBe(false);
    expect(safeEqualStrings("shorter", "short")).toBe(false);
  });

  it("rejects empty vs non-empty", () => {
    expect(safeEqualStrings("", "x")).toBe(false);
  });

  it("matches two empty strings", () => {
    expect(safeEqualStrings("", "")).toBe(true);
  });

  it("compares full contents, not just length", () => {
    expect(safeEqualStrings("aaaa", "aaab")).toBe(false);
  });

  it("handles multibyte characters", () => {
    expect(safeEqualStrings("héllo", "héllo")).toBe(true);
    expect(safeEqualStrings("héllo", "hallo")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts the configured password", async () => {
    await expect(verifyPassword("correct horse", "correct horse")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    await expect(verifyPassword("wrong", "correct horse")).resolves.toBe(false);
  });

  it("fails closed when no password is configured", async () => {
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
    await expect(verifyPassword("", "")).resolves.toBe(false);
  });

  it("rejects inputs of different lengths without crashing", async () => {
    await expect(verifyPassword("a", "a much longer password")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  const NOW = 1_800_000_000;

  it("round trips a valid token", async () => {
    const token = await signSessionToken(SECRET, NOW + 1000);
    await expect(verifySessionToken(token, SECRET, NOW)).resolves.toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await signSessionToken(SECRET, NOW - 1);
    await expect(verifySessionToken(token, SECRET, NOW)).resolves.toBe(false);
  });

  it("rejects a tampered mac", async () => {
    const token = await signSessionToken(SECRET, NOW + 1000);
    const tampered = `${token.slice(0, -2)}ff`;
    await expect(verifySessionToken(tampered, SECRET, NOW)).resolves.toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken(SECRET, NOW + 1000);
    await expect(verifySessionToken(token, "b".repeat(64), NOW)).resolves.toBe(false);
  });

  it("fails closed without a secret", async () => {
    const token = await signSessionToken(SECRET, NOW + 1000);
    await expect(verifySessionToken(token, undefined, NOW)).resolves.toBe(false);
  });

  it("rejects malformed tokens", async () => {
    await expect(verifySessionToken("garbage", SECRET, NOW)).resolves.toBe(false);
    await expect(verifySessionToken("1.2.3", SECRET, NOW)).resolves.toBe(false);
    await expect(verifySessionToken(`abc.${"0".repeat(64)}`, SECRET, NOW)).resolves.toBe(false);
    await expect(verifySessionToken(`123.${"z".repeat(64)}`, SECRET, NOW)).resolves.toBe(false);
  });

  it("keeps the cookie payload format <expiryUnix>.<hex mac>", async () => {
    const token = await signSessionToken(SECRET, 123);
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(parseSessionToken(token)?.expiryUnix).toBe(123);
  });
});

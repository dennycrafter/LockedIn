// Session token and password verification primitives shared by the login API
// (Node runtime) and middleware (Edge runtime). Web Crypto only, so the same
// code runs in both places.

export const SESSION_COOKIE = "lockedin_session";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days per SPEC 8.1

/**
 * Constant-time string comparison: walks the full length of both inputs and
 * accumulates XOR differences, so the result never leaks where two strings
 * first diverge or how long they are.
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time password check per SPEC 8.1. Both sides are hashed to fixed
 * length digests first, so input length never reaches the comparison. Fails
 * closed when no expected password is configured.
 */
export async function verifyPassword(input: string, expected: string | undefined): Promise<boolean> {
  if (expected === undefined || expected === "") return false;
  const [inputDigest, expectedDigest] = await Promise.all([sha256Hex(input), sha256Hex(expected)]);
  return safeEqualStrings(inputDigest, expectedDigest);
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cookie token per SPEC 8.1: `<expiryUnix>.<HMAC-SHA256(expiryUnix, SESSION_SECRET) hex>`.
 */
export async function signSessionToken(secret: string, expiryUnix: number): Promise<string> {
  const expiry = String(expiryUnix);
  return `${expiry}.${await hmacSha256Hex(secret, expiry)}`;
}

export interface ParsedSessionToken {
  expiry: string;
  expiryUnix: number;
  mac: string;
}

export function parseSessionToken(token: string): ParsedSessionToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [expiry, mac] = parts;
  if (!/^\d+$/.test(expiry) || !/^[0-9a-f]{64}$/.test(mac)) return null;
  return { expiry, expiryUnix: Number(expiry), mac };
}

export async function verifySessionToken(
  token: string,
  secret: string | undefined,
  nowUnix: number,
): Promise<boolean> {
  if (!secret) return false; // fail closed when SESSION_SECRET is not configured
  const parsed = parseSessionToken(token);
  if (!parsed) return false;
  if (parsed.expiryUnix <= nowUnix) return false;
  const expectedMac = await hmacSha256Hex(secret, parsed.expiry);
  return safeEqualStrings(parsed.mac, expectedMac);
}

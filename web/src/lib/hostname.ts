// Hostname normalization for blocked sites (SPEC 8.5): accept a full URL or a
// bare domain, store only the lowercase hostname without "www.". Keep in sync
// with extension/src/lib/hostname.ts; the test vectors are identical on both
// sides so the dashboard editor and the extension service worker can never
// disagree about what is blocked.

function isWebProtocol(protocol: string): boolean {
  return protocol === "https:" || protocol === "http:" || protocol === "ws:" || protocol === "wss:";
}

export function normalizeHostname(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // Parse as a URL; bare input ("youtube.com", "localhost") is retried with an
  // https:// prefix so the first label is treated as the host. The same retry
  // covers scheme-like hosts ("localhost:3000" parses as scheme "localhost"),
  // but only when the post-colon part is port-like digits: that keeps true
  // non-web schemes ("mailto:...", "chrome://...") out of the block list.
  let url: URL | null = null;
  try {
    const parsed = new URL(value);
    if (isWebProtocol(parsed.protocol)) url = parsed;
  } catch {
    // Not a full URL; the retry below decides.
  }
  if (!url) {
    // Any scheme-shaped token before the first colon is scheme-like; the
    // post-colon part must be port-like digits to retry as a host:port.
    const schemeLike = /^([a-zA-Z][a-zA-Z0-9+.-]*):([^/?#]*)/.exec(value);
    const hostPortLike = schemeLike !== null && /^\d+$/.test(schemeLike[2] ?? "");
    if (schemeLike && !hostPortLike) return null;
    try {
      url = new URL(`https://${value}`);
    } catch {
      return null;
    }
  }

  // url.hostname is already lowercased and has no port, credentials or path.
  let host = url.hostname;
  if (host.startsWith("[") || host.includes(":")) return null; // IPv6 literals: out of scope
  if (host.startsWith("www.")) host = host.slice(4);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return null;

  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.includes("..")) return null;

  // Single-label hosts (localhost) are allowed for local testing.
  if (!host.includes(".")) return /^[a-z0-9-]+$/.test(host) ? host : null;

  // Last label must be alphabetic: skips numeric junk like "1.2.3.4.9" and
  // IP addresses, which requestDomains cannot match anyway.
  const labels = host.split(".");
  if (!/^[a-z]+$/.test(labels[labels.length - 1] ?? "")) return null;

  return host;
}

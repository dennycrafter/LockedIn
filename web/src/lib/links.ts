// Link URL normalization (SPEC 8.3): a URL without http gets https://
// prepended. Returns the absolute href the browser should open, or null when
// the input is not a usable web link. Pure so tests pin the vectors.

function isWebProtocol(protocol: string): boolean {
  return protocol === "https:" || protocol === "http:";
}

export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    // Scheme-shaped input that is not http(s) ("mailto:...", "javascript:...")
    // is rejected; a host:port shape ("localhost:3000") retries as a host.
    const schemeLike = /^([a-zA-Z][a-zA-Z0-9+.-]*):([^/?#]*)/.exec(candidate);
    const portLike = schemeLike !== null && /^\d+$/.test(schemeLike[2] ?? "");
    if (schemeLike && !portLike) return null;
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (!isWebProtocol(url.protocol)) return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

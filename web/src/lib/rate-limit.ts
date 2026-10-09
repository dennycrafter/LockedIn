// In-memory login rate limiter per SPEC 8.1: after 5 wrong attempts within 10
// minutes from one IP, login returns 429 for 10 minutes. In-memory state is
// explicitly allowed by the spec for this single-user deployment.

export interface RateLimitOptions {
  now?: () => number;
  windowMs?: number;
  blockMs?: number;
  maxFailures?: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSeconds?: number;
}

interface IpRecord {
  failures: number[];
  blockedUntil: number | null;
}

export class LoginRateLimiter {
  private readonly records = new Map<string, IpRecord>();
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxFailures: number;

  constructor(options: RateLimitOptions = {}) {
    this.now = options.now ?? Date.now;
    this.windowMs = options.windowMs ?? 10 * 60 * 1000;
    this.blockMs = options.blockMs ?? 10 * 60 * 1000;
    this.maxFailures = options.maxFailures ?? 5;
  }

  /** True while the IP is inside a triggered block window. */
  check(ip: string): RateLimitVerdict {
    const record = this.records.get(ip);
    if (!record) return { allowed: true };
    const t = this.now();
    if (record.blockedUntil === null) return { allowed: true };
    if (t < record.blockedUntil) {
      return { allowed: false, retryAfterSeconds: Math.ceil((record.blockedUntil - t) / 1000) };
    }
    // Block expired: start the IP clean.
    this.records.delete(ip);
    return { allowed: true };
  }

  /** Records one wrong attempt; the 5th within the window starts a block. */
  recordFailure(ip: string): RateLimitVerdict {
    const t = this.now();
    const record = this.records.get(ip) ?? { failures: [], blockedUntil: null };
    record.failures = record.failures.filter((f) => t - f < this.windowMs);
    record.failures.push(t);
    this.records.set(ip, record);
    if (record.failures.length >= this.maxFailures) {
      record.blockedUntil = t + this.blockMs;
      return { allowed: false, retryAfterSeconds: Math.ceil(this.blockMs / 1000) };
    }
    return { allowed: true };
  }

  /** A correct password clears the IP's failure history. */
  recordSuccess(ip: string): void {
    this.records.delete(ip);
  }
}

// Single process-wide instance; the spec allows in-memory counting.
export const loginRateLimiter = new LoginRateLimiter();

import { describe, expect, it } from "vitest";
import { LoginRateLimiter } from "./rate-limit";

const MINUTE = 60 * 1000;

/** Limiter on a controllable clock starting at t0. */
function makeLimiter(t0 = 1_000_000) {
  let t = t0;
  const limiter = new LoginRateLimiter({ now: () => t });
  return {
    limiter,
    tick: (ms: number) => {
      t += ms;
    },
  };
}

describe("LoginRateLimiter", () => {
  it("allows up to four wrong attempts", () => {
    const { limiter } = makeLimiter();
    for (let i = 0; i < 4; i++) {
      expect(limiter.recordFailure("1.2.3.4").allowed).toBe(true);
    }
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("returns 429 on the fifth failure within the window", () => {
    const { limiter } = makeLimiter();
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure("1.2.3.4");
    }
    const fifth = limiter.recordFailure("1.2.3.4");
    expect(fifth.allowed).toBe(false);
    expect(fifth.retryAfterSeconds).toBe(600);
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
  });

  it("keeps the block for ten minutes, then releases it", () => {
    const { limiter, tick } = makeLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("1.2.3.4");
    tick(9 * MINUTE);
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
    tick(1 * MINUTE + 1);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("starts the IP clean after the block expires", () => {
    const { limiter, tick } = makeLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("1.2.3.4");
    tick(10 * MINUTE + 1);
    for (let i = 0; i < 4; i++) {
      expect(limiter.recordFailure("1.2.3.4").allowed).toBe(true);
    }
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("only counts failures inside the ten minute window", () => {
    const { limiter, tick } = makeLimiter();
    for (let i = 0; i < 4; i++) limiter.recordFailure("1.2.3.4");
    tick(10 * MINUTE + 1); // earlier failures age out
    for (let i = 0; i < 4; i++) limiter.recordFailure("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    expect(limiter.recordFailure("1.2.3.4").allowed).toBe(false);
  });

  it("clears history after a successful login", () => {
    const { limiter } = makeLimiter();
    for (let i = 0; i < 4; i++) limiter.recordFailure("1.2.3.4");
    limiter.recordSuccess("1.2.3.4");
    for (let i = 0; i < 4; i++) {
      expect(limiter.recordFailure("1.2.3.4").allowed).toBe(true);
    }
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("tracks IPs separately", () => {
    const { limiter } = makeLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("1.2.3.4");
    expect(limiter.check("5.6.7.8").allowed).toBe(true);
  });
});

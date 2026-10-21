import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRateLimiter } from "./rate-limit";

describe("MemoryRateLimiter", () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    limiter = new MemoryRateLimiter({
      maxRequests: 3,
      windowMs: 1000,
    });
  });

  it("allows requests below the limit and decreases remaining count", () => {
    const res1 = limiter.check("192.168.1.1");
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check("192.168.1.1");
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check("192.168.1.1");
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("blocks requests when limit is exceeded", () => {
    limiter.check("192.168.1.1");
    limiter.check("192.168.1.1");
    limiter.check("192.168.1.1");

    const blocked = limiter.check("192.168.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates rate limits by IP address", () => {
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");
    limiter.check("10.0.0.1");

    // 10.0.0.1 is blocked
    expect(limiter.check("10.0.0.1").allowed).toBe(false);

    // 10.0.0.2 is allowed
    const otherIp = limiter.check("10.0.0.2");
    expect(otherIp.allowed).toBe(true);
    expect(otherIp.remaining).toBe(2);
  });
});

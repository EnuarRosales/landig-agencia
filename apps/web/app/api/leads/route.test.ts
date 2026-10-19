import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { leadService } from "@mocter/domain";
import * as rateLimitModule from "../../../lib/rate-limit";
import { POST } from "./route";

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    leadService: {
      registerLead: vi.fn(),
    },
  };
});

describe("POST /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });
  });

  function createMockRequest(body: unknown, headers?: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3000/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(headers ?? {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("returns 201 Created when leadService succeeds", async () => {
    vi.mocked(leadService.registerLead).mockResolvedValue({
      ok: true,
      data: {
        id: "lead-abc-123",
        name: "Carlos Gomez",
        email: "carlos@example.com",
        phone: "+573001234567",
        message: "Demo please",
        createdAt: new Date("2026-10-19T10:00:00Z"),
      },
    });

    const req = createMockRequest({
      name: "Carlos Gomez",
      email: "carlos@example.com",
      phone: "+573001234567",
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data).toEqual({ ok: true });
  });

  it("returns 400 Bad Request when validation fails", async () => {
    vi.mocked(leadService.registerLead).mockResolvedValue({
      ok: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: [{ path: ["name"], message: "El nombre es obligatorio" }],
    });

    const req = createMockRequest({ email: "invalid" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 Too Many Requests when rate limit is exceeded", async () => {
    vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30000,
    });

    const req = createMockRequest({ name: "Spam Bot" });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.error).toContain("Rate limit exceeded");
  });
});

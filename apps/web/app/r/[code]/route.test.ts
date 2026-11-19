import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/logger", () => ({
  getRequestLogger: vi.fn().mockResolvedValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { GET } from "./route";

describe("SPEC-16 D-01 · GET /r/[code]", () => {
  it("guarda cookie HttpOnly mocter_ref y redirige 307 a /es/register?r=CODE", async () => {
    const req = new NextRequest("https://mocter.co/r/andes482");
    const res = await GET(req, { params: Promise.resolve({ code: "andes482" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://mocter.co/es/register?r=ANDES482");

    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("mocter_ref=ANDES482");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("respeta locale en cuando existe cookie NEXT_LOCALE=en", async () => {
    const req = new NextRequest("https://mocter.co/r/CAFE101", {
      headers: { cookie: "NEXT_LOCALE=en" },
    });
    const res = await GET(req, { params: Promise.resolve({ code: "CAFE101" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://mocter.co/en/register?r=CAFE101");
  });

  it("redirige a /register sin cookie si el código es inválido", async () => {
    const req = new NextRequest("https://mocter.co/r/!!");
    const res = await GET(req, { params: Promise.resolve({ code: "!!" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://mocter.co/es/register");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

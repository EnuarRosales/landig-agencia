/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleUnauthorized, adminFetch, resolveLoginBase } from "./api-client";

describe("apps/admin · api-client & 401 Interceptor", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Mock de window.location con Object.defineProperty
    delete (window as unknown as { location?: unknown }).location;
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: {
        href: "http://localhost:3003/admin/cells",
        hostname: "localhost",
        protocol: "http:",
        origin: "http://localhost:3003",
      },
    });

    // Mock de document.cookie
    Object.defineProperty(document, "cookie", {
      writable: true,
      configurable: true,
      value: "mocter_sid=stale-session-token",
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("calcula loginBase apuntando al puerto 3001 en desarrollo local", () => {
    const base = resolveLoginBase();
    expect(base).toBe("http://localhost:3001");
  });

  it("handleUnauthorized limpia cookies y redirige con return_to y reason=expired", () => {
    handleUnauthorized("http://localhost:3003/admin/cells");
    expect(document.cookie).toContain("max-age=0");
    expect(window.location.href).toContain("http://localhost:3001/es/login");
    expect(window.location.href).toContain("reason=expired");
    expect(window.location.href).toContain(encodeURIComponent("http://localhost:3003/admin/cells"));
  });

  it("adminFetch no redirige si el status es 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await adminFetch("/api/admin/cells");
    expect(res.status).toBe(200);
    expect(window.location.href).toBe("http://localhost:3003/admin/cells");
  });

  it("adminFetch detecta 401, limpia cookies y redirige al login universal", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 401 }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await adminFetch("/api/admin/cells");
    expect(res.status).toBe(401);
    expect(window.location.href).toContain("/es/login");
    expect(window.location.href).toContain("reason=expired");
  });
});

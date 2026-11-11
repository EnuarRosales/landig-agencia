import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextResponse, NextRequest } from "next/server";

vi.mock("next-intl/middleware", () => ({
  default: () => () => new NextResponse(null, { status: 200 }),
}));

import { proxy } from "../proxy";

describe("Proxy Middleware · Redirección Universal de Nodos Celulares", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("en modo SaaS (sin CELL_CODE), permite el flujo normal hacia la landing page", () => {
    delete process.env.CELL_CODE;

    const request = new NextRequest("http://localhost:3001/es");
    const response = proxy(request);

    // No debe redirigir a /login
    expect(response.status).not.toBe(307);
    expect(response.headers.get("x-request-id")).toBeDefined();
  });

  it("en cualquier nodo celular (CELL_CODE definido), redirige la raíz / a /{locale}/login cuando no hay sesión", () => {
    process.env.CELL_CODE = "any-generic-cell-99";

    const request = new NextRequest("http://localhost:3004/");
    const response = proxy(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/es/login");
    expect(response.headers.get("x-request-id")).toBeDefined();
  });

  it("en cualquier nodo celular, redirige /es y /en a su respectivo /login sin sesión", () => {
    process.env.CELL_CODE = "customer-cell-02";

    const reqEs = new NextRequest("http://localhost:3004/es");
    const resEs = proxy(reqEs);
    expect(resEs.status).toBe(307);
    expect(resEs.headers.get("location")).toContain("/es/login");

    const reqEn = new NextRequest("http://localhost:3004/en");
    const resEn = proxy(reqEn);
    expect(resEn.status).toBe(307);
    expect(resEn.headers.get("location")).toContain("/en/login");
  });

  it("en cualquier nodo celular, redirige rutas de marketing SaaS (/register, /terminos) a /login", () => {
    process.env.CELL_CODE = "remote-cell-vps-01";

    const reqRegister = new NextRequest("http://localhost:3004/es/register");
    const resRegister = proxy(reqRegister);
    expect(resRegister.status).toBe(307);
    expect(resRegister.headers.get("location")).toContain("/es/login");

    const reqTerminos = new NextRequest("http://localhost:3004/es/terminos");
    const resTerminos = proxy(reqTerminos);
    expect(resTerminos.status).toBe(307);
    expect(resTerminos.headers.get("location")).toContain("/es/login");
  });

  it("en nodo celular con sesión activa, redirige la raíz / hacia /workspace", () => {
    process.env.CELL_CODE = "cell-01";

    const request = new NextRequest("http://localhost:3004/es", {
      headers: {
        cookie: "mocter_sid=valid-session-id-xyz",
      },
    });
    const response = proxy(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/workspace");
  });

  it("en nodo celular, redirige al Login Central (puerto 3001) preservando return_to", () => {
    process.env.CELL_CODE = "cell-01";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";

    const request = new NextRequest("http://localhost:3004/es/login");
    const response = proxy(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("http://localhost:3001/es/login");
    expect(location).toContain("return_to=");
  });
});

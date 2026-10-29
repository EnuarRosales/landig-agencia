import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME_PROD,
  CSRF_COOKIE_NAME_DEV,
  CSRF_COOKIE_MAX_AGE,
  getCsrfCookieName,
  getCsrfCookieOptions,
  getCsrfTokenFromRequest,
} from "./csrf";

describe("AUTH-001 T-22 · Utilidades de token y cookie CSRF (csrf.ts)", () => {
  it("expone las constantes estándar requeridas por la especificación", () => {
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
    expect(CSRF_COOKIE_NAME_PROD).toBe("__Host-mocter_csrf");
    expect(CSRF_COOKIE_NAME_DEV).toBe("mocter_csrf");
    expect(CSRF_COOKIE_MAX_AGE).toBe(43200); // 12 horas
  });

  it("resuelve el nombre de cookie canónico con prefijo __Host- en producción y sin prefijo en desarrollo", () => {
    expect(getCsrfCookieName(true)).toBe("__Host-mocter_csrf");
    expect(getCsrfCookieName(false)).toBe("mocter_csrf");
  });

  it("configura las opciones de cookie CSRF para ser legible por el cliente (httpOnly: false) y SameSite=Strict", () => {
    const prodOptions = getCsrfCookieOptions(true);
    expect(prodOptions.httpOnly).toBe(false);
    expect(prodOptions.secure).toBe(true);
    expect(prodOptions.sameSite).toBe("strict");
    expect(prodOptions.path).toBe("/");
    expect(prodOptions.maxAge).toBe(43200);

    const devOptions = getCsrfCookieOptions(false);
    expect(devOptions.httpOnly).toBe(false);
    expect(devOptions.secure).toBe(false);
    expect(devOptions.sameSite).toBe("strict");
    expect(devOptions.path).toBe("/");
  });

  it("extrae el token CSRF del encabezado X-CSRF-Token eliminando espacios accidentales", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/test", {
      headers: {
        "x-csrf-token": "  token-criptografico-csrf-valido   ",
      },
    });

    const token = getCsrfTokenFromRequest(req);
    expect(token).toBe("token-criptografico-csrf-valido");
  });

  it("retorna undefined si el encabezado X-CSRF-Token no está presente en la solicitud", () => {
    const req = new NextRequest("http://localhost:3000/api/auth/test");
    const token = getCsrfTokenFromRequest(req);
    expect(token).toBeUndefined();
  });
});

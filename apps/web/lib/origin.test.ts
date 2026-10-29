import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { isValidOrigin } from "./origin";

describe("AUTH-001 T-22 · Validación de encabezado Origin (isValidOrigin)", () => {
  function createRequestWithOrigin(origin?: string, host = "localhost:3000"): NextRequest {
    const headers: Record<string, string> = { host };
    if (origin !== undefined) {
      headers.origin = origin;
    }
    return new NextRequest("http://localhost:3000/api/auth/test", {
      method: "POST",
      headers,
    });
  }

  it("acepta solicitudes donde Origin coincide exactamente con el encabezado Host", () => {
    const req = createRequestWithOrigin("http://localhost:3000", "localhost:3000");
    expect(isValidOrigin(req)).toBe(true);
  });

  it("acepta orígenes canónicos presentes en la allowlist de siteConfig", () => {
    const allowed = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3003",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3003",
      "https://mocter.co",
      "https://admin.mocter.co",
      "https://staging.mocter.co",
    ];

    for (const origin of allowed) {
      const req = createRequestWithOrigin(origin, "api.mocter.co");
      expect(isValidOrigin(req)).toBe(true);
    }
  });

  it("acepta subdominios oficiales de *.mocter.co", () => {
    const req1 = createRequestWithOrigin("https://app.mocter.co");
    const req2 = createRequestWithOrigin("https://cliente1.mocter.co");
    expect(isValidOrigin(req1)).toBe(true);
    expect(isValidOrigin(req2)).toBe(true);
  });

  it("rechaza de forma estricta el valor literal 'null' (ataques de sandboxed iframes)", () => {
    const req = createRequestWithOrigin("null");
    expect(isValidOrigin(req)).toBe(false);
  });

  it("rechaza comodines '*' en el encabezado Origin", () => {
    const req = createRequestWithOrigin("*");
    expect(isValidOrigin(req)).toBe(false);
  });

  it("rechaza cadenas vacías o espacios en blanco en Origin", () => {
    const reqEmpty = createRequestWithOrigin("");
    const reqWhitespace = createRequestWithOrigin("   ");
    expect(isValidOrigin(reqEmpty)).toBe(false);
    expect(isValidOrigin(reqWhitespace)).toBe(false);
  });

  it("rechaza orígenes externos no autorizados o maliciosos", () => {
    const maliciousOrigins = [
      "https://sitio-malicioso.com",
      "http://evil-attacker.org",
      "https://phishing-mocter.com",
      "http://localhost:8080",
      "http://localhost:9999",
    ];

    for (const origin of maliciousOrigins) {
      const req = createRequestWithOrigin(origin, "localhost:3000");
      expect(isValidOrigin(req)).toBe(false);
    }
  });

  it("rechaza dominios que simulan el nombre de marca pero no son subdominios válidos", () => {
    const lookalikeOrigins = [
      "https://evilmocter.co",
      "https://fake-mocter.co",
      "https://mocter.co.attacker.com",
    ];

    for (const origin of lookalikeOrigins) {
      const req = createRequestWithOrigin(origin, "admin.mocter.co");
      expect(isValidOrigin(req)).toBe(false);
    }
  });

  it("rechaza URLs malformadas que provoquen errores de parsing sin arrojar excepciones", () => {
    const malformedOrigins = [
      "invalid://:::3000",
      "http://[::1",
      "not-a-valid-url",
    ];

    for (const origin of malformedOrigins) {
      const req = createRequestWithOrigin(origin);
      expect(isValidOrigin(req)).toBe(false);
    }
  });

  it("permite peticiones sin Origin por defecto si no se exige requireOrigin", () => {
    const req = createRequestWithOrigin(undefined);
    expect(isValidOrigin(req)).toBe(true);
  });

  it("rechaza peticiones sin Origin cuando se activa requireOrigin", () => {
    const req = createRequestWithOrigin(undefined);
    expect(isValidOrigin(req, { requireOrigin: true })).toBe(false);
  });
});

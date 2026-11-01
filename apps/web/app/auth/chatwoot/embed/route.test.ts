import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("ADM-001 T-36 / AUTH-001 §5.10 · GET /auth/chatwoot/embed", () => {
  it("retorna 400 si falta el parámetro client_id", async () => {
    const req = new NextRequest("http://localhost:3000/auth/chatwoot/embed");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("client_id is required");
  });

  it("retorna página HTML con auto-submit y token SSO sin guardar en caché (no-store)", async () => {
    const req = new NextRequest(
      "http://localhost:3000/auth/chatwoot/embed?client_id=01930000-0000-7000-8000-000000000001",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toContain("no-store");

    const html = await res.text();
    expect(html).toContain('id="ssoForm"');
    expect(html).toContain('name="sso_token"');
    expect(html).toContain('document.getElementById("ssoForm").submit()');
  });
});


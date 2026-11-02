import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("apps/admin · Proxy Auth Guard", () => {
  it("permite el acceso a /api/health sin cookie de sesión", () => {
    const req = new NextRequest("http://localhost:3003/api/health");
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirige a login si se accede a una vista administrativa sin cookie de sesión", () => {
    const req = new NextRequest("http://localhost:3003/admin/cells");
    const res = proxy(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/es/login");
    expect(location).toContain("return_to=");
  });

  it("responde 401 JSON en endpoints de API si no hay cookie de sesión", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/cells");
    const res = proxy(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe("UNAUTHORIZED");
  });

  it("permite el acceso si la cookie mocter_sid está presente", () => {
    const req = new NextRequest("http://localhost:3003/admin/cells", {
      headers: {
        cookie: "mocter_sid=valid-session-id-123",
      },
    });
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});


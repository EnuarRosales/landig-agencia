import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("DAT-001 T1 · Legacy apps/admin/api/admin/cells", () => {
  it("GET devuelve 410 Gone", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/cells", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe("DEPRECATED");
  });

  it("POST devuelve 410 Gone y no registra celdas", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/cells", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "cell-evil" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });
});

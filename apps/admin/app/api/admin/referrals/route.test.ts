import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const mockOverview = {
  program: { id: "prog-01", status: "active" },
  metrics: { totalReferrals: 0 },
  topReferrers: [],
};

vi.mock("@mocter/domain", () => ({
  fetchAdminReferralsOverview: vi.fn().mockImplementation(() => Promise.resolve(mockOverview)),
  updateAdminReferralProgram: vi.fn().mockImplementation((input) => {
    return Promise.resolve({ ok: true, data: { success: true, status: input.status || "active" } });
  }),
}));

describe("REF-001 · Route Handler (/api/admin/referrals)", () => {
  it("GET responde 200 con el resumen del programa de referidos", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.program.id).toBe("prog-01");
  });

  it("POST rechaza con 400 si falta programId", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST actualiza el estado del programa y retorna 200", async () => {
    const req = new NextRequest("http://localhost:3003/api/admin/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: "prog-01", status: "paused" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("paused");
  });
});

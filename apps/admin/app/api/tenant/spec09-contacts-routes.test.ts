import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as domain from "@mocter/domain";

const { mockCrmService } = vi.hoisted(() => ({
  mockCrmService: {
    listContacts: vi.fn(),
    createContact: vi.fn(),
    getContactDetail: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    rateContact: vi.fn(),
    listAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
    updateStage: vi.fn(),
    recordConsent: vi.fn(),
    revokeConsent: vi.fn(),
  },
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantSession: vi.fn(),
}));

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof domain>();
  return {
    ...actual,
    getTenantCrmService: vi.fn(() => mockCrmService),
  };
});

import { resolveTenantSession } from "@/lib/tenant-auth";
import { GET as listContacts, POST as createContact } from "./contacts/route";
import {
  GET as getContactDetail,
  PATCH as updateContact,
  DELETE as deleteContact,
} from "./contacts/[id]/route";
import { POST as rateContact } from "./contacts/[id]/ratings/route";
import {
  GET as listAddresses,
  POST as createAddress,
} from "./contacts/[id]/addresses/route";
import {
  PATCH as updateAddress,
  DELETE as deleteAddress,
} from "./contacts/[id]/addresses/[addressId]/route";
import { PATCH as updateStage } from "./contacts/[id]/stage/route";
import { POST as recordConsent } from "./contacts/[id]/consents/route";
import { PATCH as revokeConsent } from "./contacts/[id]/consents/[consentId]/revoke/route";

function mockSession(role: "tenant_owner" | "tenant_agent" = "tenant_owner") {
  vi.mocked(resolveTenantSession).mockResolvedValueOnce({
    ok: true,
    clientId: "client-1",
    context: {
      scope: "tenant",
      role,
      effectiveRoles: [role],
      user: {
        id: "user-1",
        email: `${role}@shop.co`,
        displayName: "Operador CRM",
      },
      activeClient: { id: "client-1", name: "Tienda Demo", slug: "demo" },
      lifecycleStatus: "activo",
      capabilities: {},
    },
  } as unknown as Awaited<ReturnType<typeof resolveTenantSession>>);
}

describe("SPEC-09 · API REST /api/tenant/contacts*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/tenant/contacts usa ordenamiento whatsapp_priority por defecto y aplica filtros", async () => {
    mockSession("tenant_agent");
    mockCrmService.listContacts.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [],
        pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
        quota: { used: 12, limit: 500, mode: "LIMITED" },
      },
    });

    const req = new NextRequest(
      "http://localhost:3003/api/tenant/contacts?stage=qualified&source=instagram&whatsappWindow=active&minRating=4&page=2&limit=10",
      { method: "GET", headers: { "x-request-id": "req-list-1" } },
    );

    const res = await listContacts(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-list-1");
    expect(mockCrmService.listContacts).toHaveBeenCalledWith("client-1", {
      query: undefined,
      stage: "qualified",
      source: "instagram",
      channel: undefined,
      whatsappWindow: "active",
      minRating: 4,
      page: 2,
      limit: 10,
      sortBy: "whatsapp_priority",
      sortDir: "desc",
    });
  });

  it("POST /api/tenant/contacts crea contacto multi-fuente y retorna 201", async () => {
    mockSession("tenant_agent");
    mockCrmService.createContact.mockResolvedValueOnce({
      ok: true,
      data: { id: "c-new", fullName: "Laura Gómez", source: "referral" },
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Laura Gómez",
        phoneMobile: "+573001112233",
        source: "referral",
        preferredChannel: "whatsapp_cloud",
        initialAddress: {
          label: "Casa",
          city: "Bogotá",
          addressLine: "Cra 7 # 10-20",
          isDefault: true,
        },
      }),
    });

    const res = await createContact(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe("c-new");
  });

  it("POST /api/tenant/contacts retorna 409 Conflict RFC 9457 cuando el contacto ya existe", async () => {
    mockSession("tenant_owner");
    mockCrmService.createContact.mockResolvedValueOnce({
      ok: false,
      code: "CONFLICT",
      error: "Ya existe un contacto activo con ese teléfono.",
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Duplicado",
        phoneMobile: "+573001112233",
        source: "manual",
      }),
    });

    const res = await createContact(req);
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const json = await res.json();
    expect(json.code).toBe("CONFLICT");
  });

  it("POST /api/tenant/contacts retorna 422 cuando excede la cuota de contactos del plan", async () => {
    mockSession("tenant_owner");
    mockCrmService.createContact.mockResolvedValueOnce({
      ok: false,
      code: "QUOTA_EXCEEDED",
      error: "Has alcanzado el límite de contactos incluido en tu plan.",
    });

    const req = new NextRequest("http://localhost:3003/api/tenant/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Sobre Cupo",
        phoneMobile: "+573001112244",
      }),
    });

    const res = await createContact(req);
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });

  it("DELETE /api/tenant/contacts/[id] bloquea a tenant_agent (403) y permite a tenant_owner (200)", async () => {
    mockSession("tenant_agent");
    const agentReq = new NextRequest("http://localhost:3003/api/tenant/contacts/c-1", {
      method: "DELETE",
    });
    const agentRes = await deleteContact(agentReq, {
      params: Promise.resolve({ id: "c-1" }),
    });
    expect(agentRes.status).toBe(403);
    expect(mockCrmService.deleteContact).not.toHaveBeenCalled();

    mockSession("tenant_owner");
    mockCrmService.deleteContact.mockResolvedValueOnce({
      ok: true,
      data: { id: "c-1", deletedAt: "2026-11-15T20:00:00.000Z" },
    });
    const ownerReq = new NextRequest("http://localhost:3003/api/tenant/contacts/c-1", {
      method: "DELETE",
    });
    const ownerRes = await deleteContact(ownerReq, {
      params: Promise.resolve({ id: "c-1" }),
    });
    expect(ownerRes.status).toBe(200);
    expect(mockCrmService.deleteContact).toHaveBeenCalledWith(
      "client-1",
      "c-1",
      "tenant_owner@shop.co",
    );
  });

  it("GET y PATCH /api/tenant/contacts/[id] devuelven ficha y actualizan datos", async () => {
    mockSession("tenant_agent");
    mockCrmService.getContactDetail.mockResolvedValueOnce({
      ok: false,
      code: "NOT_FOUND",
      error: "No encontrado",
    });
    const notFoundRes = await getContactDetail(
      new NextRequest("http://localhost:3003/api/tenant/contacts/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(notFoundRes.status).toBe(404);

    mockSession("tenant_owner");
    mockCrmService.updateContact.mockResolvedValueOnce({
      ok: true,
      data: { id: "c-1", companyName: "Café Andino S.A.S." },
    });
    const patchRes = await updateContact(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName: "Café Andino S.A.S." }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(patchRes.status).toBe(200);
  });

  it("POST /api/tenant/contacts/[id]/ratings valida estrellas 1..5 y persiste calificación", async () => {
    mockSession("tenant_agent");
    const badRes = await rateContact(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars: 6 }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(badRes.status).toBe(400);

    mockSession("tenant_agent");
    mockCrmService.rateContact.mockResolvedValueOnce({
      ok: true,
      data: { rating: { id: "r-1", stars: 5 }, contact: { id: "c-1", currentRatingStars: 5 } },
    });
    const okRes = await rateContact(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars: 5, comment: "Cliente recurrente" }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(okRes.status).toBe(201);
  });

  it("CRUD de direcciones múltiples, cambio de etapa y consentimientos Ley 1581", async () => {
    mockSession("tenant_agent");
    mockCrmService.listAddresses.mockResolvedValueOnce({ ok: true, data: [] });
    const listAddrRes = await listAddresses(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/addresses"),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(listAddrRes.status).toBe(200);

    mockSession("tenant_agent");
    mockCrmService.createAddress.mockResolvedValueOnce({
      ok: true,
      data: { id: "addr-1", label: "Oficina", isDefault: true },
    });
    const createAddrRes = await createAddress(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: "Oficina",
          city: "Medellín",
          addressLine: "Av Poblado # 5-10",
          isDefault: true,
        }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(createAddrRes.status).toBe(201);

    mockSession("tenant_agent");
    mockCrmService.updateAddress.mockResolvedValueOnce({
      ok: true,
      data: { id: "addr-1", isDefault: true },
    });
    const patchAddrRes = await updateAddress(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/addresses/addr-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      }),
      { params: Promise.resolve({ id: "c-1", addressId: "addr-1" }) },
    );
    expect(patchAddrRes.status).toBe(200);

    mockSession("tenant_agent");
    mockCrmService.deleteAddress.mockResolvedValueOnce({
      ok: true,
      data: { deleted: true, promotedAddressId: "addr-2" },
    });
    const delAddrRes = await deleteAddress(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/addresses/addr-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "c-1", addressId: "addr-1" }) },
    );
    expect(delAddrRes.status).toBe(200);

    mockSession("tenant_agent");
    mockCrmService.updateStage.mockResolvedValueOnce({
      ok: true,
      data: { id: "c-1", stage: "customer" },
    });
    const stageRes = await updateStage(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/stage", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: "customer", notes: "Cerró primer pedido" }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(stageRes.status).toBe(200);

    mockSession("tenant_agent");
    mockCrmService.recordConsent.mockResolvedValueOnce({
      ok: true,
      data: { id: "cons-1", purpose: "data_treatment", status: "granted" },
    });
    const consentRes = await recordConsent(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/consents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: "data_treatment",
          channel: "manual",
          evidenceRef: "Acta #42",
        }),
      }),
      { params: Promise.resolve({ id: "c-1" }) },
    );
    expect(consentRes.status).toBe(201);

    mockSession("tenant_agent");
    mockCrmService.revokeConsent.mockResolvedValueOnce({
      ok: true,
      data: { id: "cons-1", status: "revoked" },
    });
    const revokeRes = await revokeConsent(
      new NextRequest("http://localhost:3003/api/tenant/contacts/c-1/consents/cons-1/revoke", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ id: "c-1", consentId: "cons-1" }) },
    );
    expect(revokeRes.status).toBe(200);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createChatwootWebhookHandler } from "./route";
import { ok } from "@mocter/domain";
import type { CellContact } from "@mocter/domain";

describe("CRM-001 / CHW-001 · Chatwoot Webhook Route Handler", () => {
  let mockClientsRepo: {
    findTenantByChatwootAccountId: ReturnType<typeof vi.fn>;
  };
  let mockCrmService: {
    ingestFromChatwoot: ReturnType<typeof vi.fn>;
  };
  let handler: (req: NextRequest) => Promise<Response>;

  beforeEach(() => {
    mockClientsRepo = {
      findTenantByChatwootAccountId: vi.fn(),
    };
    mockCrmService = {
      ingestFromChatwoot: vi.fn(),
    };
    handler = createChatwootWebhookHandler(mockClientsRepo, mockCrmService);
  });

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost:3003/api/webhooks/chatwoot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("responde 400 Bad Request si el cuerpo no es JSON válido", async () => {
    const req = new NextRequest("http://localhost:3003/api/webhooks/chatwoot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalido",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("responde 400 Bad Request si falta account.id numérico", async () => {
    const req = createRequest({
      event: "contact_created",
      name: "Juan",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("account.id");
  });

  it("responde 200 ignored_unknown_account si la cuenta de Chatwoot no está enlazada", async () => {
    mockClientsRepo.findTenantByChatwootAccountId.mockResolvedValue(null);

    const req = createRequest({
      account: { id: 999 },
      id: 1234,
      name: "Prueba Desconocida",
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ignored_unknown_account");
  });

  it("responde 200 ignored_no_contact si el evento no contiene identificador de contacto", async () => {
    mockClientsRepo.findTenantByChatwootAccountId.mockResolvedValue({
      clientId: "11111111-1111-7111-8111-111111111111",
      cellId: "pg-cell-01",
    });

    const req = createRequest({
      account: { id: 101 },
      event: "inbox_updated",
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ignored_no_contact");
  });

  it("ingesta el contacto con éxito delegando a CrmService y retorna 200", async () => {
    mockClientsRepo.findTenantByChatwootAccountId.mockResolvedValue({
      clientId: "11111111-1111-7111-8111-111111111111",
      cellId: "pg-cell-01",
    });

    mockCrmService.ingestFromChatwoot.mockResolvedValue(
      ok({
        prospect: { id: "p-1" } as CellContact,
        action: "created",
        duplicateWarning: true,
      }),
    );

    const req = createRequest({
      account: { id: 101 },
      id: 5432,
      name: "Carlos Mario",
      phone_number: "+573005556677",
      email: "carlos@mario.com",
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      action: string;
      duplicateWarning: boolean;
    };
    expect(json.ok).toBe(true);
    expect(json.action).toBe("created");
    expect(json.duplicateWarning).toBe(true);
    expect(mockCrmService.ingestFromChatwoot).toHaveBeenCalledWith(
      "pg-cell-01",
      "11111111-1111-7111-8111-111111111111",
      expect.objectContaining({
        chatwootContactId: 5432,
        name: "Carlos Mario",
        phoneMobile: "+573005556677",
        email: "carlos@mario.com",
      }),
    );
  });
});

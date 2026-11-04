import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";

const mockCreateOrSyncContact = vi.fn();
const mockImportContacts = vi.fn();
const mockListContacts = vi.fn();
const mockDeleteContact = vi.fn();

vi.mock("@mocter/domain", () => {
  return {
    DrizzleTenantContactsAndUsersRepository: class MockRepo {},
    TenantContactsAndUsersService: class MockService {
      createOrSyncContact = mockCreateOrSyncContact;
      importContacts = mockImportContacts;
      listContacts = mockListContacts;
      deleteContact = mockDeleteContact;
    },
  };
});

describe("API /api/admin/tenants/[id]/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("retorna la lista de contactos del inquilino", async () => {
      mockListContacts.mockResolvedValueOnce([
        { id: "c1", fullName: "Carlos López", email: "carlos@example.com" },
      ]);

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/contacts");
      const res = await GET(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockListContacts).toHaveBeenCalledWith("t1");
    });
  });

  describe("POST", () => {
    it("crea un contacto individual exitosamente retornando 201", async () => {
      mockCreateOrSyncContact.mockResolvedValueOnce({
        ok: true,
        data: {
          action: "created",
          contact: { id: "c1", fullName: "Carlos López", email: "carlos@example.com" },
        },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/contacts", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Carlos López",
          email: "carlos@example.com",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.action).toBe("created");
    });

    it("retorna 403 con mensaje S10 si se alcanza la cuota de contactos", async () => {
      mockCreateOrSyncContact.mockResolvedValueOnce({
        ok: false,
        error: "Has alcanzado el límite de contactos incluido en tu plan.",
        code: "QUOTA_EXCEEDED",
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/contacts", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Contacto Bloqueado",
          email: "bloqueado@example.com",
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Has alcanzado el límite de contactos incluido en tu plan.");
    });

    it("importa lote de contactos retornando 201", async () => {
      mockImportContacts.mockResolvedValueOnce({
        ok: true,
        data: {
          created: [{ id: "c1", fullName: "Uno" }],
          updated: [{ id: "c2", fullName: "Dos" }],
        },
      });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/contacts", {
        method: "POST",
        body: JSON.stringify({
          contacts: [
            { fullName: "Uno", email: "u@example.com" },
            { fullName: "Dos", email: "d@example.com" },
          ],
        }),
      });

      const res = await POST(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.data.created).toHaveLength(1);
      expect(body.data.updated).toHaveLength(1);
    });
  });

  describe("DELETE", () => {
    it("elimina un contacto retornando 200", async () => {
      mockDeleteContact.mockResolvedValueOnce({ ok: true, data: true });

      const req = new NextRequest("http://localhost:3003/api/admin/tenants/t1/contacts?contactId=c1", {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: "t1" }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockDeleteContact).toHaveBeenCalledWith("t1", "c1", "admin-api");
    });
  });
});

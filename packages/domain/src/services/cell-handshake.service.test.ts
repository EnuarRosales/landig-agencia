import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CellHandshakeService,
  validatePrivateTarget,
  probeDatabase,
  probeHttpHealth,
} from "./cell-handshake.service";
import { CellSecretsCryptoService } from "./cell-secrets.service";
import * as clientModule from "../db/client";

describe("DAT-001 §3.6.3 · CellHandshakeService", () => {
  const dummyKey = Buffer.alloc(32, 9);
  let secretsService: CellSecretsCryptoService;
  let handshakeService: CellHandshakeService;

  beforeEach(() => {
    secretsService = new CellSecretsCryptoService();
    secretsService.registerKey("k-test-1", dummyKey);
    handshakeService = new CellHandshakeService(secretsService);
  });

  describe("validatePrivateTarget", () => {
    it("rechaza puertos fuera del rango TCP permitido", () => {
      expect(validatePrivateTarget("10.0.1.10", 0).valid).toBe(false);
      expect(validatePrivateTarget("10.0.1.10", 70000).valid).toBe(false);
      expect(validatePrivateTarget("10.0.1.10", 6432).valid).toBe(true);
    });

    it("rechaza destinos loopback si allowLocal es falso", () => {
      expect(validatePrivateTarget("127.0.0.1", 5432, { allowLocal: false }).valid).toBe(false);
      expect(validatePrivateTarget("localhost", 5432, { allowLocal: false }).valid).toBe(false);
      expect(validatePrivateTarget("127.0.0.1", 5432, { allowLocal: true }).valid).toBe(true);
    });
  });

  describe("probeDatabase", () => {
    it("retorna ok: true cuando sql responde SELECT 1", async () => {
      const mockClient = vi.fn().mockResolvedValue([{ alive: 1 }]);
      (mockClient as any).end = vi.fn().mockResolvedValue(undefined);
      const mockFactory = vi.fn().mockReturnValue(mockClient);

      const res = await probeDatabase({
        host: "10.0.1.20",
        port: 6432,
        database: "db_test",
        user: "mocter_app",
        password: "secret-password",
        dbClientFactory: mockFactory,
      });

      expect(res.ok).toBe(true);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.details?.pgAlive).toBe(true);
      expect((mockClient as any).end).toHaveBeenCalled();
    });

    it("retorna ok: false cuando la conexión a la base falla", async () => {
      const mockClient = vi.fn().mockRejectedValue(new Error("Connection timeout"));
      (mockClient as any).end = vi.fn().mockResolvedValue(undefined);
      const mockFactory = vi.fn().mockReturnValue(mockClient);

      const res = await probeDatabase({
        host: "10.0.1.20",
        port: 6432,
        database: "db_test",
        user: "mocter_app",
        dbClientFactory: mockFactory,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("Connection timeout");
    });
  });

  describe("probeHttpHealth", () => {
    it("retorna ok: true cuando el endpoint /api/health responde 200 con el handshake secret", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" }),
      });

      const res = await probeHttpHealth({
        appUrl: "https://cell-02.internal",
        handshakeSecret: "secret-token-xyz",
        fetchImpl: mockFetch as any,
      });

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://cell-02.internal/api/health",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Mocter-Handshake-Secret": "secret-token-xyz",
          }),
        }),
      );
    });

    it("retorna ok: false si el servicio responde con error HTTP 500", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const res = await probeHttpHealth({
        appUrl: "https://cell-02.internal",
        handshakeSecret: "secret-token-xyz",
        fetchImpl: mockFetch as any,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain("HTTP 500");
    });
  });

  describe("executeHandshake (End-to-End Orchestrator)", () => {
    it("activa la celda a 'active' cuando ambos probes responden exitosamente", async () => {
      const cellId = "01930000-0000-7000-8000-000000000020";
      const payload = secretsService.generateAndEncrypt(cellId);

      const mockCell = {
        id: cellId,
        code: "cell-02",
        tier: "standard",
        status: "draft",
        topologyType: "remote_vps",
        pgbouncerHost: "10.0.1.30",
        pgbouncerPort: 6432,
        databaseName: "db_cell_02",
        appUrl: "https://cell-02.internal",
        cellSecretsCiphertext: payload.ciphertext,
        cellSecretsKeyId: payload.keyId,
        maxClients: 100,
        currentClients: 0,
        region: "us-east-1",
      };

      const updateCalls: any[] = [];
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [mockCell],
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => {
            updateCalls.push(vals);
            return {
              where: async () => undefined,
            };
          },
        }),
      };

      vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

      const mockDbClient = vi.fn().mockResolvedValue([{ alive: 1 }]);
      (mockDbClient as any).end = vi.fn().mockResolvedValue(undefined);
      const mockDbFactory = vi.fn().mockReturnValue(mockDbClient);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" }),
      });

      const res = await handshakeService.executeHandshake(cellId, {
        allowLocalTargets: true,
        dbClientFactory: mockDbFactory,
        fetchImpl: mockFetch as any,
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe("active");
      expect(res.diagnostic.ok).toBe(true);
      expect(res.diagnostic.db.ok).toBe(true);
      expect(res.diagnostic.app.ok).toBe(true);

      // Primer update fue verifying, segundo fue active
      expect(updateCalls[0].status).toBe("verifying");
      expect(updateCalls[1].status).toBe("active");
    });

    it("transiciona a 'error_connection' cuando la base de datos no responde", async () => {
      const cellId = "01930000-0000-7000-8000-000000000021";
      const payload = secretsService.generateAndEncrypt(cellId);

      const mockCell = {
        id: cellId,
        code: "cell-broken",
        tier: "standard",
        status: "draft",
        topologyType: "remote_vps",
        pgbouncerHost: "10.0.1.99",
        pgbouncerPort: 6432,
        databaseName: "db_cell_broken",
        appUrl: "https://cell-broken.internal",
        cellSecretsCiphertext: payload.ciphertext,
        cellSecretsKeyId: payload.keyId,
        maxClients: 100,
        currentClients: 0,
        region: "us-east-1",
      };

      const updateCalls: any[] = [];
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [mockCell],
            }),
          }),
        }),
        update: () => ({
          set: (vals: any) => {
            updateCalls.push(vals);
            return {
              where: async () => undefined,
            };
          },
        }),
      };

      vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

      const mockDbClient = vi.fn().mockRejectedValue(new Error("Connection refused"));
      (mockDbClient as any).end = vi.fn().mockResolvedValue(undefined);
      const mockDbFactory = vi.fn().mockReturnValue(mockDbClient);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" }),
      });

      const res = await handshakeService.executeHandshake(cellId, {
        allowLocalTargets: true,
        dbClientFactory: mockDbFactory,
        fetchImpl: mockFetch as any,
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe("error_connection");
      expect(res.diagnostic.ok).toBe(false);
      expect(res.diagnostic.db.ok).toBe(false);
      expect(res.diagnostic.error).toContain("Connection refused");
      expect(updateCalls[1].status).toBe("error_connection");
    });
  });
});

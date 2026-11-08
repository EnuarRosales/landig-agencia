import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CellHandshakeService,
  validatePrivateTarget,
  probeDatabase,
  probeHttpHealth,
  isIpInCidr,
  executeCellPeriodicProbe,
  resolveLocalProbeTarget,
} from "./cell-handshake.service";
import { CellSecretsCryptoService } from "./cell-secrets.service";
import * as clientModule from "../db/client";
import * as redisModule from "../redis/client";

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

    it("rechaza destinos link-local y metadatos de nube en todo entorno (CEL-RF-014)", () => {
      expect(validatePrivateTarget("169.254.169.254", 80, { allowLocal: true }).valid).toBe(false);
      expect(validatePrivateTarget("169.254.1.1", 5432, { allowLocal: false }).valid).toBe(false);
      expect(validatePrivateTarget("169.254.169.254", 80, { allowLocal: true }).reason).toContain("link-local");
    });

    it("rechaza IPs públicas no autorizadas fuera de los CIDRs privados permitidos", () => {
      expect(validatePrivateTarget("8.8.8.8", 5432, { allowLocal: false }).valid).toBe(false);
      expect(validatePrivateTarget("1.1.1.1", 5432, { allowLocal: false }).valid).toBe(false);
      expect(validatePrivateTarget("10.20.30.40", 5432, { allowLocal: false }).valid).toBe(true);
      expect(validatePrivateTarget("172.16.5.10", 5432, { allowLocal: false }).valid).toBe(true);
      expect(validatePrivateTarget("192.168.1.50", 5432, { allowLocal: false }).valid).toBe(true);
    });

    it("admite bloques CIDR personalizados configurados", () => {
      expect(
        validatePrivateTarget("50.10.20.30", 5432, {
          allowLocal: false,
          allowedCidrs: ["50.10.0.0/16"],
        }).valid,
      ).toBe(true);
      expect(
        validatePrivateTarget("50.20.20.30", 5432, {
          allowLocal: false,
          allowedCidrs: ["50.10.0.0/16"],
        }).valid,
      ).toBe(false);
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

  describe("executeCellPeriodicProbe (Sonda 60s CEL-RF-014)", () => {
    it("transiciona celda a error_connection al acumular 3 fallos consecutivos", async () => {
      const cellId = "01930000-0000-7000-8000-000000000099";
      const payload = secretsService.generateAndEncrypt(cellId);

      const mockActiveCell = {
        id: cellId,
        code: "cell-active-failing",
        tier: "standard",
        status: "active",
        topologyType: "local_compose",
        pgbouncerHost: "127.0.0.1",
        pgbouncerPort: 6432,
        databaseName: "db_cell_active",
        appUrl: "http://127.0.0.1:3004",
        cellSecretsCiphertext: payload.ciphertext,
        cellSecretsKeyId: payload.keyId,
        maxClients: 100,
        currentClients: 10,
        region: "us-east-1",
      };

      const updateCalls: any[] = [];
      const mockDb = {
        select: () => ({
          from: () => ({
            where: async () => [mockActiveCell],
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

      // Simular Redis retornando 3 fallos
      const mockRedis = {
        set: vi.fn().mockResolvedValue("OK"),
        incr: vi.fn().mockResolvedValue(3),
        expire: vi.fn().mockResolvedValue(1),
        del: vi.fn().mockResolvedValue(1),
      };
      vi.spyOn(redisModule, "getRedisClient").mockReturnValue(mockRedis as any);

      // Probes que fallan
      const mockDbClient = vi.fn().mockRejectedValue(new Error("PgBouncer down"));
      (mockDbClient as any).end = vi.fn().mockResolvedValue(undefined);
      const mockDbFactory = vi.fn().mockReturnValue(mockDbClient);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const res = await executeCellPeriodicProbe({
        dbClientFactory: mockDbFactory,
        fetchImpl: mockFetch as any,
        secretsService,
        redisClient: mockRedis,
      });

      expect(res.checkedCount).toBe(1);
      expect(res.transitionedCount).toBe(1);
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(updateCalls[0].status).toBe("error_connection");
      expect(mockRedis.incr).toHaveBeenCalledWith(`cell:probe:failures:${cellId}`);
    });
  });

  describe("resolveLocalProbeTarget", () => {
    it("conserva host y appUrl sin alteraciones para remote_vps", () => {
      const res = resolveLocalProbeTarget({
        topologyType: "remote_vps",
        host: "10.0.1.20",
        appUrl: "https://cell-01.mocter.co",
      });
      expect(res.probeHost).toBe("10.0.1.20");
      expect(res.probeAppUrl).toBe("https://cell-01.mocter.co");
    });

    it("resuelve localhost y stack celular a host.docker.internal cuando DOCKER_CONTAINER=true", () => {
      const prevEnv = process.env.DOCKER_CONTAINER;
      process.env.DOCKER_CONTAINER = "true";
      try {
        const res1 = resolveLocalProbeTarget({
          topologyType: "local_compose",
          host: "pgbouncer-cell-01",
          appUrl: "http://localhost:3004/",
        });
        expect(res1.probeHost).toBe("host.docker.internal");
        expect(res1.probeAppUrl).toBe("http://host.docker.internal:3004/");

        const res2 = resolveLocalProbeTarget({
          topologyType: "local_compose",
          host: "127.0.0.1",
          appUrl: "http://127.0.0.1:3004/api/health",
        });
        expect(res2.probeHost).toBe("host.docker.internal");
        expect(res2.probeAppUrl).toBe("http://host.docker.internal:3004/api/health");
      } finally {
        if (prevEnv !== undefined) {
          process.env.DOCKER_CONTAINER = prevEnv;
        } else {
          delete process.env.DOCKER_CONTAINER;
        }
      }
    });
  });
});

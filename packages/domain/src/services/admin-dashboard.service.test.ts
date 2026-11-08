import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminCell, fetchAdminCells, type CreateAdminCellInput } from "./admin-dashboard.service";
import type { Cell } from "../db/schemas";

vi.mock("../db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("./cell-secrets.service", () => ({
  cellSecretsCryptoService: {
    generateAndEncrypt: vi.fn().mockReturnValue({
      ciphertext: Buffer.from("encrypted-secrets"),
      keyId: "k1",
      bundle: {
        mocter_app_password: "app-pass",
        mocter_migrator_password: "migrator-pass",
        mocter_healthcheck_password: "health-pass",
        handshake_secret: "handshake-secret",
      },
    }),
  },
}));

vi.mock("./cell-authorization.service", () => ({
  authorizeCellProvision: vi.fn(),
}));

import { getDb } from "../db/client";
import { authorizeCellProvision } from "./cell-authorization.service";

function createMockCell(overrides?: Partial<Cell>): Cell {
  return {
    id: "cell-uuid-001",
    code: "cell-01",
    hostId: null,
    tier: "standard",
    status: "draft",
    topologyType: "remote_vps",
    pgbouncerHost: "pgbouncer-cell-01",
    pgbouncerPort: 6432,
    databaseName: "mocter_cell_01",
    appUrl: "http://localhost:3004",
    privateIp: "10.0.0.2",
    publicIp: null,
    workingDir: "/opt/cell-01",
    deployUser: "deploy:1000",
    cellSecretsCiphertext: Buffer.from("encrypted"),
    cellSecretsKeyId: "k1",
    maxClients: 100,
    currentClients: 0,
    region: "us-east-1",
    healthStatus: null,
    lastHealthCheckAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "owner-001",
    updatedBy: "owner-001",
    ...overrides,
  };
}

describe("DAT-001 T1 · admin-dashboard.service · celdas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAdminCells", () => {
    it("nunca expone secretos en el DTO de listado", async () => {
      const orderByMock = vi.fn().mockResolvedValue([
        {
          id: "cell-uuid-001",
          code: "cell-01",
          tier: "standard",
          status: "draft",
          pgbouncerHost: "pgbouncer-cell-01",
          pgbouncerPort: 6432,
          databaseName: "mocter_cell_01",
          maxClients: 100,
          currentClients: 0,
          region: "us-east-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "owner-001",
          updatedBy: "owner-001",
        },
      ]);
      const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });

      vi.mocked(getDb).mockReturnValue({
        select: selectMock,
      } as unknown as ReturnType<typeof getDb>);

      const list = await fetchAdminCells();
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty("cellSecretsCiphertext");
      expect(list[0]).not.toHaveProperty("cellSecretsKeyId");
      expect(list[0].code).toBe("cell-01");

      const selectedColumns = selectMock.mock.calls[0][0];
      expect(selectedColumns).not.toHaveProperty("cellSecretsCiphertext");
      expect(selectedColumns).not.toHaveProperty("cellSecretsKeyId");
    });
  });

  describe("createAdminCell", () => {
    const baseInput: CreateAdminCellInput = {
      code: "cell-02",
      tier: "standard",
      topologyType: "remote_vps",
      pgbouncerHost: "pgbouncer-cell-02",
      pgbouncerPort: 6432,
      databaseName: "mocter_cell_02",
      appUrl: "http://localhost:3004",
      workingDir: "/opt/cell-02",
      maxClients: 100,
      region: "us-east-1",
      actorUserId: "owner-001",
    };

    it("rechaza la petición si el actor no está autorizado", async () => {
      vi.mocked(authorizeCellProvision).mockResolvedValue({
        ok: false,
        error: "No autorizado: se requiere autoridad de Platform Owner.",
        code: "FORBIDDEN",
      });

      const result = await createAdminCell(baseInput);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("FORBIDDEN");

      expect(getDb).not.toHaveBeenCalled();
    });

    it("registra una celda en estado draft con secretos cifrados cuando el actor es platform_owner", async () => {
      vi.mocked(authorizeCellProvision).mockResolvedValue({ ok: true, data: undefined });

      const insertedCell = createMockCell({
        id: "cell-uuid-002",
        code: "cell-02",
        status: "draft",
      });

      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([insertedCell]),
      });
      const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

      vi.mocked(getDb).mockReturnValue({
        insert: insertMock,
      } as unknown as ReturnType<typeof getDb>);

      const result = await createAdminCell(baseInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("draft");
        expect(result.data).not.toHaveProperty("cellSecretsCiphertext");
        expect(result.data).not.toHaveProperty("cellSecretsKeyId");
      }

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg.status).toBe("draft");
      expect(valuesArg.cellSecretsCiphertext).toEqual(Buffer.from("encrypted-secrets"));
      expect(valuesArg.cellSecretsKeyId).toBe("k1");
      expect(valuesArg.workingDir).toBe("/opt/cell-02");
    });

    it("rechaza si faltan campos obligatorios y no inserta", async () => {
      vi.mocked(authorizeCellProvision).mockResolvedValue({ ok: true, data: undefined });
      const insertMock = vi.fn();
      vi.mocked(getDb).mockReturnValue({
        insert: insertMock,
      } as unknown as ReturnType<typeof getDb>);

      const result = await createAdminCell({ ...baseInput, code: "   " });
      expect(result.ok).toBe(false);
      expect(insertMock).not.toHaveBeenCalled();
    });
  });
});

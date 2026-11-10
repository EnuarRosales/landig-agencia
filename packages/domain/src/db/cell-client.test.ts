import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolvePgBouncerTarget,
  CellDatabasePoolManager,
  CellPoolError,
} from "./cell-client";

describe("resolvePgBouncerTarget", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CELL_PGBOUNCER_HOST_OVERRIDE;
    delete process.env.CELL_PGBOUNCER_PORT_OVERRIDE;
    delete process.env.DOCKER_CONTAINER;
    delete process.env.IS_DOCKER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("retorna 127.0.0.1 cuando la topología es local_compose y se ejecuta en host", () => {
    process.env.IS_DOCKER = "false";
    const target = resolvePgBouncerTarget({
      topologyType: "local_compose",
      pgbouncerHost: "pgbouncer-cell-01",
      pgbouncerPort: 6432,
    });
    expect(target).toEqual({ host: "127.0.0.1", port: 6432 });
  });

  it("retorna host.docker.internal cuando la topología es local_compose y corre dentro de Docker", () => {
    process.env.DOCKER_CONTAINER = "true";
    const target = resolvePgBouncerTarget({
      topologyType: "local_compose",
      pgbouncerHost: "127.0.0.1",
      pgbouncerPort: 6432,
    });
    expect(target).toEqual({ host: "host.docker.internal", port: 6432 });
  });

  it("preserva host y puerto originales cuando la topología es remote_vps", () => {
    const target = resolvePgBouncerTarget({
      topologyType: "remote_vps",
      pgbouncerHost: "198.51.100.10",
      pgbouncerPort: 6432,
    });
    expect(target).toEqual({ host: "198.51.100.10", port: 6432 });
  });

  it("respeta variables de sobreescritura si están presentes", () => {
    process.env.CELL_PGBOUNCER_HOST_OVERRIDE = "custom-pgbouncer.internal";
    process.env.CELL_PGBOUNCER_PORT_OVERRIDE = "7432";
    const target = resolvePgBouncerTarget({
      topologyType: "local_compose",
      pgbouncerHost: "127.0.0.1",
      pgbouncerPort: 6432,
    });
    expect(target).toEqual({ host: "custom-pgbouncer.internal", port: 7432 });
  });
});

describe("CellDatabasePoolManager", () => {
  const testCellId = "6ae5619b-7ca3-4764-baae-1b8950a8e534";
  const testClientId = "01a1bc84-cc30-73b6-bc84-1f0cda5a9661";

  it("resolveCellIdForClient valida el formato UUID de clientId", async () => {
    const manager = new CellDatabasePoolManager();
    await expect(manager.resolveCellIdForClient("invalid-client-id")).rejects.toThrow(
      CellPoolError,
    );
  });

  it("resolveCellIdForClient consulta la ruta y la almacena en caché", async () => {
    const mockRoute = [{ cellId: testCellId, routingStatus: "active" }];
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(mockRoute),
    });
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      }),
    };

    const manager = new CellDatabasePoolManager(() => mockDb as any);
    const resolvedCellId1 = await manager.resolveCellIdForClient(testClientId);
    expect(resolvedCellId1).toBe(testCellId);

    // Segunda llamada debe salir de caché sin consultar la base de datos de control
    const resolvedCellId2 = await manager.resolveCellIdForClient(testClientId);
    expect(resolvedCellId2).toBe(testCellId);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("resolveCellIdForClient lanza error si no existe ruta celular activa", async () => {
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    });
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: mockWhere,
        }),
      }),
    };

    const manager = new CellDatabasePoolManager(() => mockDb as any);
    await expect(manager.resolveCellIdForClient(testClientId)).rejects.toThrow(
      /No se encontró ruta celular activa/,
    );
  });

  it("getCellDb inicializa el cliente con prepare: false y descifra las credenciales", async () => {
    const mockCell = {
      id: testCellId,
      code: "cell-01",
      status: "active",
      topologyType: "local_compose",
      pgbouncerHost: "pgbouncer-cell-01",
      pgbouncerPort: 6432,
      databaseName: "pg-cell-01",
      cellSecretsCiphertext: Buffer.from("ciphertext"),
      cellSecretsKeyId: "k1",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCell]),
          }),
        }),
      }),
    };

    const mockCrypto = {
      decryptBundle: vi.fn().mockReturnValue({
        mocter_app_password: "decrypted_secret_password",
      }),
    };

    const mockSqlInstance = {
      end: vi.fn().mockResolvedValue(undefined),
      options: { parsers: {} },
    };

    const mockDrizzleDb = {
      select: vi.fn(),
      transaction: vi.fn(),
    };

    const mockClientFactory = vi.fn().mockReturnValue(mockSqlInstance);
    const mockDrizzleFactory = vi.fn().mockReturnValue(mockDrizzleDb);

    const manager = new CellDatabasePoolManager(
      () => mockDb as any,
      mockCrypto as any,
      mockClientFactory as any,
      {},
      mockDrizzleFactory as any,
    );

    const cellDb = await manager.getCellDb(testCellId);
    expect(cellDb).toBe(mockDrizzleDb);

    expect(mockCrypto.decryptBundle).toHaveBeenCalledWith(
      mockCell.cellSecretsCiphertext,
      mockCell.id,
      mockCell.cellSecretsKeyId,
      mockCell.code,
    );

    expect(mockClientFactory).toHaveBeenCalledWith(
      expect.stringContaining("decrypted_secret_password"),
      expect.objectContaining({ prepare: false }),
    );

    // Consulta subsecuente por código reutiliza el pool sin re-inicializar
    const cellDbByCode = await manager.getCellDb("cell-01");
    expect(cellDbByCode).toBe(cellDb);
    expect(mockClientFactory).toHaveBeenCalledTimes(1);

    await manager.shutdown();
    expect(mockSqlInstance.end).toHaveBeenCalled();
  });

  it("withTenantCellTransaction inyecta SELECT set_config('app.current_client_id', ..., true)", async () => {
    const executedSql: any[] = [];
    const mockTx = {
      execute: vi.fn().mockImplementation((statement) => {
        executedSql.push(statement);
        return Promise.resolve();
      }),
    };

    const mockCellDb = {
      transaction: vi.fn().mockImplementation(async (cb) => {
        return await cb(mockTx);
      }),
    };

    const manager = new CellDatabasePoolManager();
    vi.spyOn(manager, "resolveCellIdForClient").mockResolvedValue(testCellId);
    vi.spyOn(manager, "getCellDb").mockResolvedValue(mockCellDb as any);

    const result = await manager.withTenantCellTransaction(testClientId, async (tx) => {
      expect(tx).toBeDefined();
      return "transaction_success";
    });

    expect(result).toBe("transaction_success");
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    expect(executedSql[0].queryChunks[0].value).toContain("SELECT set_config('app.current_client_id', ");
    expect(executedSql[0].queryChunks[1]).toBe(testClientId);
  });
});

describe.runIf(Boolean(process.env.RUN_LIVE_RECONCILIATION))("Live Cell Reconciliation (TNT-001 M1)", () => {
  it("reconcilia y materializa Synergia Market en pg-cell-01 con RLS estricto", async () => {
    const { reconcileProvisionedTenantsInCells } = await import("../services/admin-dashboard.service");
    const result = await reconcileProvisionedTenantsInCells();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.reconciledCount).toBeGreaterThanOrEqual(1);
    const synergia = result.data.tenants.find((t) => t.slug === "synergia-market");
    expect(synergia).toBeDefined();
    expect(synergia?.lifecycleStatus).toBe("alta");
  }, 30000);
});


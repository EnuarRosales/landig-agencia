import { describe, it, expect, vi, beforeEach } from "vitest";
import { CellManifestService } from "./cell-manifest.service";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
import * as clientModule from "../db/client";

describe("DAT-001 §3.6.2 · CellManifestService", () => {
  const dummyKey = Buffer.alloc(32, 7);
  let secretsService: CellSecretsCryptoService;
  let manifestService: CellManifestService;

  beforeEach(() => {
    secretsService = new CellSecretsCryptoService();
    secretsService.registerKey("k-test-1", dummyKey);
    manifestService = new CellManifestService(secretsService);
  });

  it("genera el archivo .env, compose canónico e instrucciones con usuario deploy:1000 y /opt/<name-cell>", async () => {
    const cellId = "01930000-0000-7000-8000-000000000010";
    const customBundle: CellSecretsBundle = {
      mocter_app_password: "mock-app-password-12345",
      mocter_migrator_password: "mock-migrator-password-12345",
      mocter_healthcheck_password: "mock-healthcheck-password-12345",
      handshake_secret: "mock-handshake-secret-67890",
    };
    const payload = secretsService.encryptBundle(customBundle, cellId);

    const mockCell = {
      id: cellId,
      code: "cell-02",
      tier: "standard",
      status: "draft",
      topologyType: "remote_vps",
      pgbouncerHost: "10.0.1.15",
      pgbouncerPort: 6432,
      databaseName: "db_cell_02",
      appUrl: "https://cell-02.internal:3000",
      privateIp: "10.0.1.15",
      publicIp: null,
      workingDir: "/opt/cell-02",
      deployUser: "deploy:1000",
      cellSecretsCiphertext: payload.ciphertext,
      cellSecretsKeyId: payload.keyId,
      maxClients: 100,
      currentClients: 0,
      region: "us-east-1",
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockCell],
          }),
        }),
      }),
    };

    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

    const manifest = await manifestService.generateManifest(cellId);

    expect(manifest.cellId).toBe(cellId);
    expect(manifest.code).toBe("cell-02");
    expect(manifest.workingDir).toBe("/opt/cell-02");
    expect(manifest.deployUser).toBe("deploy:1000");

    // Validar .env
    expect(manifest.envContent).toContain("CELL_CODE=cell-02");
    expect(manifest.envContent).toContain("WORKING_DIR=/opt/cell-02");
    expect(manifest.envContent).toContain("DEPLOY_USER=deploy:1000");
    expect(manifest.envContent).toContain("POSTGRES_PASSWORD=mock-app-password-12345");
    expect(manifest.envContent).toContain("HANDSHAKE_SECRET=mock-handshake-secret-67890");

    // Validar compose
    expect(manifest.dockerComposeContent).toContain("name: mocter-cell-02");
    expect(manifest.dockerComposeContent).toContain("cell-migrator:");
    expect(manifest.dockerComposeContent).toContain("pg-cell:");
    expect(manifest.dockerComposeContent).toContain("pgbouncer-cell:");

    // Validar instrucciones
    expect(manifest.instructions).toHaveLength(7);
    expect(manifest.instructions[0]).toContain("deploy@<host>");
    expect(manifest.instructions[1]).toContain("/opt/cell-02");
  });

  it("descifra y genera el manifiesto correctamente cuando los secretos fueron cifrados con cell.code (fallback AAD)", async () => {
    const cellId = "01930000-0000-7000-8000-000000000020";
    const customBundle: CellSecretsBundle = {
      mocter_app_password: "mock-app-password-fallback",
      mocter_migrator_password: "mock-migrator-password-fallback",
      mocter_healthcheck_password: "mock-healthcheck-password-fallback",
      handshake_secret: "mock-handshake-secret-fallback",
    };
    // Cifrado con cell.code en lugar de cellId
    const payload = secretsService.encryptBundle(customBundle, "cell-legacy");

    const mockCell = {
      id: cellId,
      code: "cell-legacy",
      tier: "standard",
      status: "draft",
      topologyType: "remote_vps",
      pgbouncerHost: "10.0.1.15",
      pgbouncerPort: 6432,
      databaseName: "db_cell_legacy",
      appUrl: "https://cell-legacy.internal:3000",
      privateIp: "10.0.1.15",
      publicIp: null,
      workingDir: "/opt/cell-legacy",
      deployUser: "deploy:1000",
      cellSecretsCiphertext: payload.ciphertext,
      cellSecretsKeyId: payload.keyId,
      maxClients: 100,
      currentClients: 0,
      region: "us-east-1",
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockCell],
          }),
        }),
      }),
    };

    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

    const manifest = await manifestService.generateManifest(cellId);
    expect(manifest.cellId).toBe(cellId);
    expect(manifest.code).toBe("cell-legacy");
    expect(manifest.envContent).toContain("POSTGRES_PASSWORD=mock-app-password-fallback");
  });

  it("resuelve el perfil local_development a partir de cell.hostId y genera manifiesto con node:24-alpine", async () => {
    const cellId = "01930000-0000-7000-8000-000000000030";
    const customBundle: CellSecretsBundle = {
      mocter_app_password: "mock-app-password-dev",
      mocter_migrator_password: "mock-migrator-password-dev",
      mocter_healthcheck_password: "mock-healthcheck-password-dev",
      handshake_secret: "mock-handshake-secret-dev",
    };
    const payload = secretsService.encryptBundle(customBundle, cellId);

    const mockCell = {
      id: cellId,
      code: "cell-dev",
      tier: "standard",
      status: "draft",
      topologyType: "local_compose",
      pgbouncerHost: "127.0.0.1",
      pgbouncerPort: 6432,
      databaseName: "pg-cell-dev",
      appUrl: "http://localhost:3004/",
      privateIp: "127.0.0.1",
      publicIp: null,
      workingDir: "/opt/cell-dev",
      deployUser: "deploy:1000",
      cellSecretsCiphertext: payload.ciphertext,
      cellSecretsKeyId: payload.keyId,
      maxClients: 100,
      currentClients: 0,
      region: "us-east-1",
      hostId: "host-uuid-local-01",
    };

    const mockHost = {
      id: "host-uuid-local-01",
      deploymentProfile: "local_development",
    };

    let queryCount = 0;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              queryCount++;
              return queryCount === 1 ? [mockCell] : [mockHost];
            },
          }),
        }),
      }),
    };

    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

    const manifest = await manifestService.generateManifest(cellId);

    expect(manifest.dockerComposeContent).toContain("Perfil local_development");
    expect(manifest.dockerComposeContent).toContain("image: node:24-alpine");
    expect(manifest.dockerComposeContent).toContain("127.0.0.1:3004:3000");
    expect(manifest.dockerComposeContent).not.toContain("ghcr.io/enuarrosales/mocter-web");
    expect(manifest.dockerComposeContent).not.toContain("${TAG:-latest}");
  });

  it("lanza un error explícito si la celda no existe", async () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };
    vi.spyOn(clientModule, "getDb").mockReturnValue(mockDb as any);

    await expect(
      manifestService.generateManifest("01930000-0000-7000-8000-000000000099"),
    ).rejects.toThrow('Célula de datos no encontrada para id: "01930000-0000-7000-8000-000000000099".');
  });
});

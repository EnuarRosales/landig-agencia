import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ComposeCellManifestRenderer, type ComposeCellRenderContext } from "./compose-cell-manifest-renderer";
import { buildCellDeploymentSpec } from "./cell-deployment-spec";
import type { CellSecretsBundle } from "./cell-secrets.service";

const MOCK_SECRETS: CellSecretsBundle = {
  mocter_app_password: "test-app-password-secret-123",
  mocter_migrator_password: "test-migrator-password-secret-456",
  mocter_healthcheck_password: "test-healthcheck-password-secret-789",
  handshake_secret: "test-handshake-secret-abc",
};

const MOCK_CELL_SOURCE = {
  id: "cell-test-uuid-001",
  code: "cell-02",
  tier: "standard",
  topologyType: "remote_vps",
  pgbouncerPort: 6432,
  databaseName: "pg-cell-02",
  appUrl: "https://cell-02.cell.mocter.co",
  maxClients: 100,
  hostId: "host-vps-01",
};

const MOCK_CONTEXT: ComposeCellRenderContext = {
  secrets: MOCK_SECRETS,
  workingDirOverride: "/opt/cell-02",
  deployUserOverride: "deploy:1000",
  legacyRegion: "us-east-1",
};

/** Comprueba si el binario de docker compose está disponible en el entorno de ejecución. */
const isDockerComposeAvailable = (() => {
  try {
    execSync("docker compose version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Valida la sintaxis del manifiesto Compose renderizado usando `docker compose config -q`.
 */
function validateComposeSyntax(dockerComposeYaml: string, envLines: string[]) {
  if (!isDockerComposeAvailable) {
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "cell-compose-test-"));
  const composePath = join(tempDir, "docker-compose.yml");
  const envPath = join(tempDir, ".env");

  try {
    writeFileSync(composePath, dockerComposeYaml, "utf8");
    writeFileSync(envPath, envLines.join("\n"), "utf8");

    // Ejecuta docker compose config con variables necesarias para pasar la interpolación
    execSync(`docker compose -f "${composePath}" --env-file "${envPath}" config -q`, {
      env: {
        ...process.env,
        TAG: "v1.0.0-test",
        CELL_CODE: "cell-02",
        PGBOUNCER_PORT: "6432",
        POSTGRES_DB: "pg-cell-02",
        POSTGRES_USER: "mocter_app",
        POSTGRES_PASSWORD: "test-password",
        HANDSHAKE_SECRET: "test-secret",
        APP_URL: "https://cell-02.cell.mocter.co",
      },
      stdio: "pipe",
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("ComposeCellManifestRenderer · Perfiles de Despliegue CEL-001 §3.2 (CEL-T05, CEL-T06, CEL-T07)", () => {
  const renderer = new ComposeCellManifestRenderer();

  describe("Perfil 1: control_plane_vps (CEL-RF-006, CEL-RF-007, CEL-RF-008)", () => {
    const spec = buildCellDeploymentSpec(MOCK_CELL_SOURCE, "control_plane_vps");
    const artifacts = renderer.render(spec, MOCK_CONTEXT);

    it("garantiza CERO puertos publicados en el host (CEL-RF-006, CEL-RF-023, R-10, Regla 4.16)", () => {
      // Ningún servicio debe tener directiva `ports:`
      expect(artifacts.dockerComposeContent).not.toMatch(/^\s+ports:/m);
      expect(artifacts.dockerComposeContent).not.toContain("3004:");
      expect(artifacts.dockerComposeContent).not.toContain("6432:");
    });

    it("conecta únicamente tenant-app a las redes externas del VPS de control (CEL-RF-006)", () => {
      expect(artifacts.dockerComposeContent).toContain("traefik_network:\n    external: true");
      expect(artifacts.dockerComposeContent).toContain("mocter-admin-prod_backend:\n    external: true");

      // Verificamos que pg-cell y pgbouncer-cell NO estén en redes del control plane
      const pgSection = artifacts.dockerComposeContent.split("pg-cell:")[1].split("cell-migrator:")[0];
      expect(pgSection).not.toContain("traefik_network");
      expect(pgSection).not.toContain("mocter-admin-prod_backend");

      const pgbouncerSection = artifacts.dockerComposeContent.split("pgbouncer-cell:")[1].split("tenant-app:")[0];
      expect(pgbouncerSection).not.toContain("traefik_network");
      expect(pgbouncerSection).not.toContain("mocter-admin-prod_backend");

      // Verificamos que tenant-app sí esté en ambas
      const appSection = artifacts.dockerComposeContent.split("tenant-app:")[1].split("volumes:")[0];
      expect(appSection).toContain("- traefik_network");
      expect(appSection).toContain("- mocter-admin-prod_backend");
    });

    it("configura etiquetas Traefik estrictas con regla de Host única y TLS (AC-01)", () => {
      expect(artifacts.dockerComposeContent).toContain('"traefik.enable=true"');
      expect(artifacts.dockerComposeContent).toContain(
        `"traefik.http.routers.mocter-${MOCK_CELL_SOURCE.code}-tenant.rule=Host(\`${MOCK_CELL_SOURCE.code}.cell.mocter.co\`)"`
      );
      expect(artifacts.dockerComposeContent).toContain(
        `"traefik.http.routers.mocter-${MOCK_CELL_SOURCE.code}-tenant.entrypoints=websecure"`
      );
      expect(artifacts.dockerComposeContent).toContain(
        `"traefik.http.routers.mocter-${MOCK_CELL_SOURCE.code}-tenant.tls=true"`
      );
      expect(artifacts.dockerComposeContent).toContain(
        `"traefik.http.routers.mocter-${MOCK_CELL_SOURCE.code}-tenant.tls.certresolver=mytlschallenge"`
      );
    });

    it("utiliza artefacto inmutable y prohíbe fallback a latest (R-04, CEL-RF-006)", () => {
      expect(artifacts.dockerComposeContent).toContain(
        "image: ghcr.io/enuarrosales/mocter-web:${TAG:?TAG variable is required}"
      );
      expect(artifacts.dockerComposeContent).not.toContain(":-latest");
    });

    it("configura endpoint multimedia S3 privado en la red de admin (CEL-RF-017)", () => {
      expect(artifacts.dockerComposeContent).toContain("S3_ENDPOINT: http://seaweedfs:8333");
    });

    it("ejecuta migrador one-shot con parámetro --target=cell (CEL-RF-012)", () => {
      expect(artifacts.dockerComposeContent).toContain(
        'command: ["node", "migrator/scripts/migrate.mjs", "--target=cell"]'
      );
    });

    it("cumple sintaxis Compose válida (verificada con docker compose config)", () => {
      validateComposeSyntax(artifacts.dockerComposeContent, artifacts.envContent.split("\n"));
    });
  });

  describe("Perfil 2: external_vps (CEL-RF-006, CEL-RF-007, CEL-RF-009)", () => {
    const spec = buildCellDeploymentSpec(MOCK_CELL_SOURCE, "external_vps");
    const artifacts = renderer.render(spec, MOCK_CONTEXT);

    it("mantiene aislamiento total de redes: CERO redes del VPS principal (AC-02)", () => {
      expect(artifacts.dockerComposeContent).not.toContain("traefik_network");
      expect(artifacts.dockerComposeContent).not.toContain("mocter-admin-prod_backend");
      expect(artifacts.dockerComposeContent).toContain("cell-backend:\n    driver: bridge");
    });

    it("utiliza artefacto inmutable y prohíbe fallback a latest (R-04)", () => {
      expect(artifacts.dockerComposeContent).toContain(
        "image: ghcr.io/enuarrosales/mocter-web:${TAG:?TAG variable is required}"
      );
      expect(artifacts.dockerComposeContent).not.toContain(":-latest");
    });

    it("ejecuta migrador one-shot con parámetro --target=cell", () => {
      expect(artifacts.dockerComposeContent).toContain(
        'command: ["node", "migrator/scripts/migrate.mjs", "--target=cell"]'
      );
    });

    it("cumple sintaxis Compose válida (verificada con docker compose config)", () => {
      validateComposeSyntax(artifacts.dockerComposeContent, artifacts.envContent.split("\n"));
    });
  });

  describe("Perfil 3: local_development (CEL-RF-010, CEL-RF-011, CEL-RF-012, R-10, Regla 4.16)", () => {
    const spec = buildCellDeploymentSpec(MOCK_CELL_SOURCE, "local_development");
    const artifacts = renderer.render(spec, MOCK_CONTEXT);

    it("publica puertos EXCLUSIVAMENTE en loopback 127.0.0.1 (R-10, CEL-RF-010, Regla 4.16)", () => {
      expect(artifacts.dockerComposeContent).toContain('"127.0.0.1:5433:5432"');
      expect(artifacts.dockerComposeContent).toContain('"127.0.0.1:${PGBOUNCER_PORT}:6432"');
      expect(artifacts.dockerComposeContent).toContain('"127.0.0.1:3004:3000"');

      // Prohibición estricta de 0.0.0.0 o puertos expuestos sin loopback
      expect(artifacts.dockerComposeContent).not.toMatch(/"0\.0\.0\.0:/);
      expect(artifacts.dockerComposeContent).not.toMatch(/- "\d+:\d+"/);
    });

    it("monta código fuente del repositorio en volumen para desarrollo activo (CEL-RF-010)", () => {
      expect(artifacts.dockerComposeContent).toContain(":/app");
      expect(artifacts.dockerComposeContent).toContain("image: node:24-alpine");
    });

    it("configura healthcheck estricto de PgBouncer con pg_isready (CEL-RF-011)", () => {
      expect(artifacts.dockerComposeContent).toContain(
        'test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 6432 -U $$POSTGRES_USER -d $$POSTGRES_DB"]'
      );
    });

    it("establece dependencia tenant-app -> pgbouncer-cell condition service_healthy", () => {
      const tenantSection = artifacts.dockerComposeContent.split("tenant-app:")[1];
      expect(tenantSection).toContain("pgbouncer-cell:\n        condition: service_healthy");
    });

    it("ejecuta migrador local con parámetro --target=cell (CEL-RF-012)", () => {
      expect(artifacts.dockerComposeContent).toContain(
        'command: ["node", "packages/domain/scripts/migrate.mjs", "--target=cell"]'
      );
    });

    it("cumple sintaxis Compose válida (verificada con docker compose config)", () => {
      validateComposeSyntax(artifacts.dockerComposeContent, artifacts.envContent.split("\n"));
    });
  });

  describe("Fallback de compatibilidad: profile null (Etapa 1 baseline)", () => {
    const spec = buildCellDeploymentSpec(MOCK_CELL_SOURCE, null);
    const artifacts = renderer.render(spec, MOCK_CONTEXT);

    it("produce el manifiesto histórico de compatibilidad con fallback a latest", () => {
      expect(artifacts.dockerComposeContent).toContain(
        "image: ghcr.io/enuarrosales/mocter-web:${TAG:-latest}"
      );
      expect(artifacts.dockerComposeContent).toContain('"3004:3000"');
      expect(artifacts.dockerComposeContent).toContain('"${PGBOUNCER_PORT}:6432"');
    });
  });
});


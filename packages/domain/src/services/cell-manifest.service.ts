import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cells } from "../db/schemas/admin/cells";
import { cellHosts } from "../db/schemas/admin/cell-hosts";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
import { buildCellDeploymentSpec, type CellDeploymentProfile } from "./cell-deployment-spec";
import {
  ComposeCellManifestRenderer,
  extractAppPortFromUrl,
} from "./compose-cell-manifest-renderer";
import { getCellManifestEnvConfig } from "../utils/env";
import { appLogger } from "../utils/logger";

/**
 * Manifiesto de despliegue generado para una celda autónoma (DAT-001 §3.6.2).
 */
export interface CellManifestDto {
  cellId: string;
  code: string;
  workingDir: string;
  deployUser: string;
  envContent: string;
  dockerComposeContent: string;
  instructions: string[];
}

/**
 * Servicio para la generación de manifiestos declarativos de celdas (Modelo A).
 *
 * Desde CEL-001 (Etapa 1) orquesta la lectura de la celda y el descifrado de secretos, y delega la
 * construcción del modelo neutral en {@link buildCellDeploymentSpec} y la salida Compose en
 * {@link ComposeCellManifestRenderer}. Su contrato público no cambia.
 */
export class CellManifestService {
  /**
   * @param secretsService - Servicio de descifrado de secretos por celda.
   * @param renderer - Renderer Compose; inyectable para pruebas.
   */
  constructor(
    private readonly secretsService: CellSecretsCryptoService = new CellSecretsCryptoService(),
    private readonly renderer: ComposeCellManifestRenderer = new ComposeCellManifestRenderer(),
  ) {}

  /**
   * Genera el manifiesto canónico .env y docker-compose.cell.yml para una celda dada.
   */
  async generateManifest(cellId: string): Promise<CellManifestDto> {
    const db = getDb();
    const [cell] = await db.select().from(cells).where(eq(cells.id, cellId)).limit(1);

    if (!cell) {
      throw new Error(`Célula de datos no encontrada para id: "${cellId}".`);
    }

    let bundle: CellSecretsBundle;
    try {
      bundle = this.secretsService.decryptBundle(
        cell.cellSecretsCiphertext,
        cell.id,
        cell.cellSecretsKeyId,
        cell.code,
      );
    } catch (err) {
      appLogger.error(`[CellManifestService.generateManifest] Error al descifrar secretos para celda ${cell.code}`, err);
      throw new Error(`No se pudieron descifrar los secretos de la célula ${cell.code}.`);
    }

    const envCfg = getCellManifestEnvConfig();
    let resolvedProfile: CellDeploymentProfile | null = null;
    if (cell.hostId) {
      try {
        const [host] = await db
          .select({ deploymentProfile: cellHosts.deploymentProfile })
          .from(cellHosts)
          .where(eq(cellHosts.id, cell.hostId))
          .limit(1);
        if (host) {
          resolvedProfile = host.deploymentProfile as CellDeploymentProfile;
        }
      } catch (err) {
        appLogger.warn(`[CellManifestService.generateManifest] No se pudo resolver host ${cell.hostId}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let localPgHostPortOverride: number | undefined;
    const conflictWarnings: string[] = [];

    if (resolvedProfile === "local_development" && cell.hostId) {
      try {
        const siblingRows = await db
          .select({
            id: cells.id,
            code: cells.code,
            pgbouncerPort: cells.pgbouncerPort,
            appUrl: cells.appUrl,
            createdAt: cells.createdAt,
          })
          .from(cells)
          .where(eq(cells.hostId, cell.hostId))
          .limit(200);

        const validSiblings = Array.isArray(siblingRows)
          ? siblingRows.filter((row) => row && typeof row.id === "string" && typeof row.pgbouncerPort === "number")
          : [];

        if (validSiblings.length > 0) {
          const sortedSiblings = [...validSiblings].sort((a, b) => {
            const timeDiff = (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0);
            if (timeDiff !== 0) return timeDiff;
            const codeDiff = (a.code ?? "").localeCompare(b.code ?? "");
            if (codeDiff !== 0) return codeDiff;
            return a.id.localeCompare(b.id);
          });

          const usedPorts = new Set<number>([envCfg.CELL_PG_INTERNAL_PORT]);
          for (const sibling of sortedSiblings) {
            usedPorts.add(sibling.pgbouncerPort);
            usedPorts.add(extractAppPortFromUrl(sibling.appUrl || "", envCfg.CELL_LOCAL_APP_PORT_BASE));
          }

          let candidatePgPort = envCfg.CELL_LOCAL_PG_PORT_BASE;
          for (const sibling of sortedSiblings) {
            while (usedPorts.has(candidatePgPort)) {
              candidatePgPort++;
            }
            usedPorts.add(candidatePgPort);
            if (sibling.id === cell.id) {
              localPgHostPortOverride = candidatePgPort;
              break;
            }
          }

          const currentAppPort = extractAppPortFromUrl(cell.appUrl || "", envCfg.CELL_LOCAL_APP_PORT_BASE);
          const otherSiblings = sortedSiblings.filter((s) => s.id !== cell.id);
          const pgbouncerCollision = otherSiblings.find((s) => s.pgbouncerPort === cell.pgbouncerPort);
          if (pgbouncerCollision) {
            conflictWarnings.push(
              `ADVERTENCIA: PGBOUNCER_PORT=${cell.pgbouncerPort} colisiona con la celda "${pgbouncerCollision.code}". Edita el Puerto de Conexión de "${cell.code}" antes de levantarla en paralelo.`,
            );
          }
          const appPortCollision = otherSiblings.find(
            (s) => extractAppPortFromUrl(s.appUrl || "", envCfg.CELL_LOCAL_APP_PORT_BASE) === currentAppPort,
          );
          if (appPortCollision) {
            conflictWarnings.push(
              `ADVERTENCIA: APP_PORT=${currentAppPort} colisiona con la celda "${appPortCollision.code}". Cambia la URL de aplicación de "${cell.code}" a otro puerto libre.`,
            );
          }
        }
      } catch (err) {
        appLogger.warn(`[CellManifestService.generateManifest] No se pudieron evaluar puertos hermanos para ${cell.code}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const spec = buildCellDeploymentSpec(cell, resolvedProfile, {
      appArtifactReference: envCfg.CELL_APP_IMAGE,
      appInternalPort: envCfg.CELL_APP_INTERNAL_PORT,
      postgresInternalPort: envCfg.CELL_PG_INTERNAL_PORT,
      pgbouncerInternalPort: envCfg.CELL_PGBOUNCER_INTERNAL_PORT,
      seaweedS3Endpoint: resolvedProfile ? envCfg.S3_ENDPOINT : null,
    });

    const artifacts = this.renderer.render(spec, {
      secrets: bundle,
      workingDirOverride: cell.workingDir,
      deployUserOverride: cell.deployUser,
      legacyRegion: cell.region,
      options: {
        pgvectorImage: envCfg.CELL_PGVECTOR_IMAGE,
        pgbouncerImage: envCfg.CELL_PGBOUNCER_IMAGE,
        localNodeImage: envCfg.CELL_LOCAL_NODE_IMAGE,
        deployUserDefault: envCfg.CELL_DEPLOY_USER,
        cellBaseDomain: envCfg.CELL_BASE_DOMAIN,
        traefikNetwork: envCfg.CELL_TRAEFIK_NETWORK,
        controlPlaneNetwork: envCfg.CELL_CONTROL_PLANE_NETWORK,
        traefikCertResolver: envCfg.CELL_TRAEFIK_CERTRESOLVER,
        seaweedS3Endpoint: envCfg.S3_ENDPOINT,
        localRepoDir: envCfg.CELL_LOCAL_REPO_DIR,
        localWorkDirBase: envCfg.CELL_LOCAL_WORK_DIR_BASE,
        localPgPortBase: envCfg.CELL_LOCAL_PG_PORT_BASE,
        localPgbouncerPortBase: envCfg.CELL_LOCAL_PGBOUNCER_PORT_BASE,
        localAppPortBase: envCfg.CELL_LOCAL_APP_PORT_BASE,
        localPgHostPortOverride,
      },
    });

    return {
      cellId: cell.id,
      code: cell.code,
      workingDir: artifacts.workingDir,
      deployUser: artifacts.deployUser,
      envContent: artifacts.envContent,
      dockerComposeContent: artifacts.dockerComposeContent,
      instructions: [...conflictWarnings, ...artifacts.instructions],
    };
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cells, type Cell } from "../db/schemas/admin/cells";
import { cellHosts } from "../db/schemas/admin/cell-hosts";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
import { buildCellDeploymentSpec, type CellDeploymentProfile } from "./cell-deployment-spec";
import { ComposeCellManifestRenderer } from "./compose-cell-manifest-renderer";
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
        appLogger.warn(`[CellManifestService.generateManifest] No se pudo resolver host ${cell.hostId}`, err);
      }
    }

    const spec = buildCellDeploymentSpec(cell, resolvedProfile);
    const artifacts = this.renderer.render(spec, {
      secrets: bundle,
      workingDirOverride: cell.workingDir,
      deployUserOverride: cell.deployUser,
      legacyRegion: cell.region,
    });

    return {
      cellId: cell.id,
      code: cell.code,
      workingDir: artifacts.workingDir,
      deployUser: artifacts.deployUser,
      envContent: artifacts.envContent,
      dockerComposeContent: artifacts.dockerComposeContent,
      instructions: artifacts.instructions,
    };
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cells, type Cell } from "../db/schemas/admin/cells";
import { CellSecretsCryptoService, type CellSecretsBundle } from "./cell-secrets.service";
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
 */
export class CellManifestService {
  constructor(
    private readonly secretsService: CellSecretsCryptoService = new CellSecretsCryptoService(),
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

    const workingDir = cell.workingDir || `/opt/${cell.code}`;
    const deployUser = cell.deployUser || "deploy:1000";

    const envContent = [
      `# ─────────────────────────────────────────────────────────────`,
      `# Configuración de Célula Autónoma · ${cell.code} (DAT-001 §3.6)`,
      `# Directorio de trabajo canónico: ${workingDir}`,
      `# Usuario de ejecución autorizado: ${deployUser}`,
      `# ─────────────────────────────────────────────────────────────`,
      `CELL_CODE=${cell.code}`,
      `CELL_TIER=${cell.tier}`,
      `TOPOLOGY_TYPE=${cell.topologyType}`,
      `WORKING_DIR=${workingDir}`,
      `DEPLOY_USER=${deployUser}`,
      ``,
      `# Base de Datos PostgreSQL 18 & PgBouncer`,
      `POSTGRES_DB=${cell.databaseName}`,
      `POSTGRES_USER=mocter_app`,
      `POSTGRES_PASSWORD=${bundle.mocter_app_password}`,
      `POSTGRES_MIGRATOR_PASSWORD=${bundle.mocter_migrator_password}`,
      `POSTGRES_HEALTHCHECK_PASSWORD=${bundle.mocter_healthcheck_password}`,
      `POSTGRES_PORT=5432`,
      `PGBOUNCER_PORT=${cell.pgbouncerPort}`,
      ``,
      `# Secreto de Handshake y Aplicación`,
      `HANDSHAKE_SECRET=${bundle.handshake_secret}`,
      `APP_URL=${cell.appUrl}`,
      `REGION=${cell.region}`,
      `MAX_CLIENTS=${cell.maxClients}`,
    ].join("\n");

    const dockerComposeContent = [
      `# Manifiesto Canónico de Celda Mocter (${cell.code})`,
      `# Estándar DAT-001 §3.6.2 / OPS-001 RF-06.7`,
      `name: mocter-${cell.code}`,
      ``,
      `services:`,
      `  pg-cell:`,
      `    image: pgvector/pgvector:pg18`,
      `    environment:`,
      `      POSTGRES_DB: \${POSTGRES_DB}`,
      `      POSTGRES_USER: \${POSTGRES_USER}`,
      `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
      `    volumes:`,
      `      - pgdata-${cell.code}:/var/lib/postgresql`,
      `    networks:`,
      `      - cell-backend`,
      `    restart: unless-stopped`,
      `    healthcheck:`,
      `      test: ["CMD-SHELL", "pg_isready -U \$\$POSTGRES_USER -d \$\$POSTGRES_DB"]`,
      `      interval: 5s`,
      `      timeout: 3s`,
      `      retries: 10`,
      ``,
      `  cell-migrator:`,
      `    image: ghcr.io/enuarrosales/mocter-web:\${TAG:-latest}`,
      `    command: ["node", "migrator/scripts/migrate.mjs", "--target=cell"]`,
      `    environment:`,
      `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:5432/\${POSTGRES_DB}`,
      `    networks:`,
      `      - cell-backend`,
      `    depends_on:`,
      `      pg-cell:`,
      `        condition: service_healthy`,
      `    restart: "no"`,
      ``,
      `  pgbouncer-cell:`,
      `    image: edoburu/pgbouncer:v1.26.1-p0`,
      `    environment:`,
      `      DB_HOST: pg-cell`,
      `      DB_PORT: 5432`,
      `      DB_NAME: \${POSTGRES_DB}`,
      `      DB_USER: \${POSTGRES_USER}`,
      `      DB_PASSWORD: \${POSTGRES_PASSWORD}`,
      `      LISTEN_PORT: 6432`,
      `      POOL_MODE: transaction`,
      `      MAX_CLIENT_CONN: 100`,
      `      DEFAULT_POOL_SIZE: 20`,
      `    ports:`,
      `      - "\${PGBOUNCER_PORT}:6432"`,
      `    networks:`,
      `      - cell-backend`,
      `    depends_on:`,
      `      pg-cell:`,
      `        condition: service_healthy`,
      `      cell-migrator:`,
      `        condition: service_completed_successfully`,
      `    restart: unless-stopped`,
      ``,
      `  tenant-app:`,
      `    image: ghcr.io/enuarrosales/mocter-web:\${TAG:-latest}`,
      `    environment:`,
      `      CELL_CODE: \${CELL_CODE}`,
      `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:6432/\${POSTGRES_DB}`,
      `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
      `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
      `    ports:`,
      `      - "3004:3000"`,
      `    networks:`,
      `      - cell-backend`,
      `    depends_on:`,
      `      pgbouncer-cell:`,
      `        condition: service_healthy`,
      `    restart: unless-stopped`,
      ``,
      `volumes:`,
      `  pgdata-${cell.code}:`,
      ``,
      `networks:`,
      `  cell-backend:`,
      `    driver: bridge`,
    ].join("\n");

    const instructions = [
      `Conectarse al servidor VPS o host destino con el usuario de despliegue: ssh deploy@<host>`,
      `Crear y posicionarse en el directorio canónico: mkdir -p ${workingDir} && cd ${workingDir}`,
      `Crear el archivo .env con el contenido generado y otorgarle permisos estrictos: chmod 0600 .env`,
      `Crear el archivo docker-compose.yml con el contenido del manifiesto`,
      `Levantar el stack celular: docker compose up -d`,
      `Verificar que el inicializador cell-migrator finalice con éxito y pg-cell esté saludable`,
      `Regresar a mocter-admin (/admin/cells) y ejecutar la acción «Verificar y Activar Handshake»`,
    ];

    return {
      cellId: cell.id,
      code: cell.code,
      workingDir,
      deployUser,
      envContent,
      dockerComposeContent,
      instructions,
    };
  }
}

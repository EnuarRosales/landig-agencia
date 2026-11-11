import type { CellSecretsBundle } from "./cell-secrets.service";
import type { CellDeploymentSpec, CellManifestRenderer } from "./cell-deployment-spec";

/**
 * Puerto del host con el que el baseline publicaba `tenant-app`.
 *
 * @remarks Valor heredado del generador previo y conservado únicamente para garantizar equivalencia
 * en la Etapa 1. Es un defecto conocido (publicación fija en el host, regla 4.16 y CEL-RF-023/R-10):
 * la Etapa 2 lo reemplaza por la política de puertos de cada perfil.
 */
const LEGACY_TENANT_APP_HOST_PORT = 3004;

/**
 * Datos de renderizado Compose que no pertenecen al modelo neutral.
 */
export interface ComposeCellRenderContext {
  /** Secretos de la celda ya descifrados; solo se usan para emitir el `.env`. */
  secrets: CellSecretsBundle;
  /** Directorio de trabajo persistido en la celda; `null` usa `/opt/<code>` (CEL-RF-023). */
  workingDirOverride: string | null;
  /** Usuario de despliegue persistido en la celda; `null` usa `deploy:1000` (CEL-RF-023). */
  deployUserOverride: string | null;
  /**
   * Región legada de `cells.region`, emitida como `REGION` en el `.env`.
   *
   * @remarks Paso legado: CEL-RF-025 excluye la región del modelo neutral, pero el campo persiste
   * temporalmente y el baseline la emite. No participa en placement ni routing.
   */
  legacyRegion: string;
}

/**
 * Artefactos que produce {@link ComposeCellManifestRenderer}.
 */
export interface ComposeCellArtifacts {
  workingDir: string;
  deployUser: string;
  envContent: string;
  dockerComposeContent: string;
  instructions: string[];
}

/**
 * Renderer que traduce {@link CellDeploymentSpec} a `.env` y `docker-compose.cell.yml` (CEL-RF-008).
 *
 * Es el único componente que conoce la sintaxis Compose, las rutas `/opt` y el usuario `deploy`.
 *
 * @remarks Etapa 1: reproduce byte a byte la salida del generador previo para cualquier perfil/topología;
 * la diferenciación por perfil se introduce en la Etapa 2. Servicio puro: sin I/O ni estado.
 */
export class ComposeCellManifestRenderer
  implements CellManifestRenderer<ComposeCellRenderContext, ComposeCellArtifacts>
{
  /**
   * Genera `.env`, Compose e instrucciones operativas para una celda.
   *
   * @param spec - Modelo neutral de la celda.
   * @param context - Secretos resueltos, rutas persistidas y región legada.
   * @returns Artefactos de despliegue Compose.
   */
  render(spec: CellDeploymentSpec, context: ComposeCellRenderContext): ComposeCellArtifacts {
    const code = spec.cell.code;
    const workingDir = context.workingDirOverride || `/opt/${code}`;
    const deployUser = context.deployUserOverride || "deploy:1000";
    const { secrets } = context;
    const config = spec.configuration;
    const pgUser = spec.postgres.user;
    const pgPort = spec.postgres.internalPort;
    const pool = spec.connectionPool;
    const app = spec.application;

    const envContent = [
      `# ─────────────────────────────────────────────────────────────`,
      `# Configuración de Célula Autónoma · ${code} (DAT-001 §3.6)`,
      `# Directorio de trabajo canónico: ${workingDir}`,
      `# Usuario de ejecución autorizado: ${deployUser}`,
      `# ─────────────────────────────────────────────────────────────`,
      `CELL_CODE=${code}`,
      `CELL_TIER=${config.tier}`,
      `TOPOLOGY_TYPE=${config.topologyType}`,
      `WORKING_DIR=${workingDir}`,
      `DEPLOY_USER=${deployUser}`,
      ``,
      `# Base de Datos PostgreSQL 18 & PgBouncer`,
      `POSTGRES_DB=${config.databaseName}`,
      `POSTGRES_USER=${pgUser}`,
      `POSTGRES_PASSWORD=${secrets.mocter_app_password}`,
      `POSTGRES_MIGRATOR_PASSWORD=${secrets.mocter_migrator_password}`,
      `POSTGRES_HEALTHCHECK_PASSWORD=${secrets.mocter_healthcheck_password}`,
      `POSTGRES_PORT=${pgPort}`,
      `PGBOUNCER_PORT=${config.pgbouncerPort}`,
      ``,
      `# Secreto de Handshake y Aplicación`,
      `HANDSHAKE_SECRET=${secrets.handshake_secret}`,
      `APP_URL=${config.appUrl}`,
      `REGION=${context.legacyRegion}`,
      `MAX_CLIENTS=${spec.cell.maxClients}`,
    ].join("\n");

    const instructions =
      spec.profile === "local_development"
        ? [
            `Crear un subdirectorio dedicado para la célula dentro del repositorio: mkdir -p ${workingDir} && cd ${workingDir}`,
            `Guardar los archivos .env y docker-compose.yml generados dentro de esa carpeta`,
            `Levantar el stack celular local: docker compose up -d`,
            `Verificar que el inicializador cell-migrator aplique las 10 migraciones y termine con éxito (exited 0)`,
            `Comprobar que pg-cell y pgbouncer-cell estén saludables en loopback 127.0.0.1`,
            `Regresar a mocter-admin (/admin/cells) y presionar el botón «Verificar Conexión» (Handshake)`,
          ]
        : [
            `Conectarse al servidor VPS o host destino con el usuario de despliegue: ssh deploy@<host>`,
            `Crear y posicionarse en el directorio canónico: mkdir -p ${workingDir} && cd ${workingDir}`,
            `Crear el archivo .env con el contenido generado y otorgarle permisos estrictos: chmod 0600 .env`,
            `Crear el archivo docker-compose.yml con el contenido del manifiesto`,
            `Levantar el stack celular: docker compose up -d`,
            `Verificar que el inicializador cell-migrator finalice con éxito y pg-cell esté saludable`,
            `Regresar a mocter-admin (/admin/cells) y ejecutar la acción «Verificar y Activar Handshake»`,
          ];

    // Diferenciación de manifiestos por Perfil de Despliegue (CEL-RF-006, CEL-RF-007, CEL-RF-008, CEL-RF-009)
    if (spec.profile === "control_plane_vps") {
      const dockerComposeContent = [
        `# Manifiesto Canónico de Celda Mocter (${code}) · Perfil control_plane_vps`,
        `# Estándar CEL-001 §3.2 / OPS-001 RF-06.7 (Zero Puertos Host, Redes Traefik y Media)`,
        `name: mocter-${code}`,
        ``,
        `services:`,
        `  pg-cell:`,
        `    image: pgvector/pgvector:pg18`,
        `    environment:`,
        `      POSTGRES_DB: \${POSTGRES_DB}`,
        `      POSTGRES_USER: \${POSTGRES_USER}`,
        `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
        `    volumes:`,
        `      - pgdata-${code}:/var/lib/postgresql`,
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
        `    image: ${app.artifactReference}:\${TAG:?TAG variable is required}`,
        `    command: ["node", "migrator/scripts/migrate.mjs", "--target=cell"]`,
        `    environment:`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB}`,
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
        `      DB_PORT: ${pgPort}`,
        `      DB_NAME: \${POSTGRES_DB}`,
        `      DB_USER: \${POSTGRES_USER}`,
        `      DB_PASSWORD: \${POSTGRES_PASSWORD}`,
        `      DATABASE_URLS: "postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB},postgres://mocter_healthcheck:\${POSTGRES_HEALTHCHECK_PASSWORD}@pg-cell:${pgPort}/*"`,
        `      LISTEN_PORT: ${pool.listenPort}`,
        `      POOL_MODE: ${pool.mode}`,
        `      MAX_CLIENT_CONN: ${pool.maxClientConnections}`,
        `      DEFAULT_POOL_SIZE: ${pool.defaultPoolSize}`,
        `    networks:`,
        `      - cell-backend`,
        `    healthcheck:`,
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$POSTGRES_USER -d \$\$POSTGRES_DB"]`,
        `      interval: 5s`,
        `      timeout: 3s`,
        `      retries: 5`,
        `    depends_on:`,
        `      pg-cell:`,
        `        condition: service_healthy`,
        `      cell-migrator:`,
        `        condition: service_completed_successfully`,
        `    restart: unless-stopped`,
        ``,
        `  tenant-app:`,
        `    image: ${app.artifactReference}:\${TAG:?TAG variable is required}`,
        `    environment:`,
        `      CELL_CODE: \${CELL_CODE}`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:${pool.listenPort}/\${POSTGRES_DB}`,
        `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
        `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
        `      S3_ENDPOINT: http://seaweedfs:8333`,
        `    networks:`,
        `      - cell-backend`,
        `      - traefik_network`,
        `      - mocter-admin-prod_backend`,
        `    labels:`,
        `      - "traefik.enable=true"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.rule=Host(\`${code}.cell.mocter.co\`)"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.entrypoints=websecure"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.tls=true"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.tls.certresolver=mytlschallenge"`,
        `      - "traefik.http.services.mocter-${code}-tenant.loadbalancer.server.port=${app.internalPort}"`,
        `    depends_on:`,
        `      pgbouncer-cell:`,
        `        condition: service_healthy`,
        `    restart: unless-stopped`,
        ``,
        `volumes:`,
        `  pgdata-${code}:`,
        ``,
        `networks:`,
        `  cell-backend:`,
        `    driver: bridge`,
        `  traefik_network:`,
        `    external: true`,
        `  mocter-admin-prod_backend:`,
        `    external: true`,
      ].join("\n");

      return { workingDir, deployUser, envContent, dockerComposeContent, instructions };
    }

    if (spec.profile === "external_vps") {
      const dockerComposeContent = [
        `# Manifiesto Canónico de Celda Mocter (${code}) · Perfil external_vps`,
        `# Estándar CEL-001 §3.2 / OPS-001 RF-06.7 (Redes Aisladas de VPS Principal)`,
        `name: mocter-${code}`,
        ``,
        `services:`,
        `  pg-cell:`,
        `    image: pgvector/pgvector:pg18`,
        `    environment:`,
        `      POSTGRES_DB: \${POSTGRES_DB}`,
        `      POSTGRES_USER: \${POSTGRES_USER}`,
        `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
        `    volumes:`,
        `      - pgdata-${code}:/var/lib/postgresql`,
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
        `    image: ${app.artifactReference}:\${TAG:?TAG variable is required}`,
        `    command: ["node", "migrator/scripts/migrate.mjs", "--target=cell"]`,
        `    environment:`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB}`,
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
        `      DB_PORT: ${pgPort}`,
        `      DB_NAME: \${POSTGRES_DB}`,
        `      DB_USER: \${POSTGRES_USER}`,
        `      DB_PASSWORD: \${POSTGRES_PASSWORD}`,
        `      DATABASE_URLS: "postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB},postgres://mocter_healthcheck:\${POSTGRES_HEALTHCHECK_PASSWORD}@pg-cell:${pgPort}/*"`,
        `      LISTEN_PORT: ${pool.listenPort}`,
        `      POOL_MODE: ${pool.mode}`,
        `      MAX_CLIENT_CONN: ${pool.maxClientConnections}`,
        `      DEFAULT_POOL_SIZE: ${pool.defaultPoolSize}`,
        `    networks:`,
        `      - cell-backend`,
        `    healthcheck:`,
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$POSTGRES_USER -d \$\$POSTGRES_DB"]`,
        `      interval: 5s`,
        `      timeout: 3s`,
        `      retries: 5`,
        `    depends_on:`,
        `      pg-cell:`,
        `        condition: service_healthy`,
        `      cell-migrator:`,
        `        condition: service_completed_successfully`,
        `    restart: unless-stopped`,
        ``,
        `  tenant-app:`,
        `    image: ${app.artifactReference}:\${TAG:?TAG variable is required}`,
        `    environment:`,
        `      CELL_CODE: \${CELL_CODE}`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:${pool.listenPort}/\${POSTGRES_DB}`,
        `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
        `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
        `    networks:`,
        `      - cell-backend`,
        `    depends_on:`,
        `      pgbouncer-cell:`,
        `        condition: service_healthy`,
        `    restart: unless-stopped`,
        ``,
        `volumes:`,
        `  pgdata-${code}:`,
        ``,
        `networks:`,
        `  cell-backend:`,
        `    driver: bridge`,
      ].join("\n");

      return { workingDir, deployUser, envContent, dockerComposeContent, instructions };
    }

    if (spec.profile === "local_development") {
      const dockerComposeContent = [
        `# Manifiesto Canónico de Celda Mocter (${code}) · Perfil local_development`,
        `# Estándar CEL-001 §3.2 / OPS-001 RF-06.7 (Puertos Loopback 127.0.0.1, Readiness y Offline)`,
        `name: mocter-${code}`,
        ``,
        `services:`,
        `  pg-cell:`,
        `    image: pgvector/pgvector:pg18`,
        `    environment:`,
        `      POSTGRES_DB: \${POSTGRES_DB}`,
        `      POSTGRES_USER: \${POSTGRES_USER}`,
        `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
        `    ports:`,
        `      - "127.0.0.1:5433:5432"`,
        `    volumes:`,
        `      - pgdata-${code}:/var/lib/postgresql`,
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
        `    image: node:24-alpine`,
        `    working_dir: /app`,
        `    command: ["node", "packages/domain/scripts/migrate.mjs", "--target=cell"]`,
        `    volumes:`,
        `      - \${REPO_DIR:-..}:/app`,
        `      - mocter-core_root-node-modules:/app/node_modules`,
        `      - mocter-core_domain-node-modules:/app/packages/domain/node_modules`,
        `    environment:`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB}`,
        `      POSTGRES_HEALTHCHECK_PASSWORD: \${POSTGRES_HEALTHCHECK_PASSWORD}`,
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
        `      DB_PORT: ${pgPort}`,
        `      DB_NAME: \${POSTGRES_DB}`,
        `      DB_USER: \${POSTGRES_USER}`,
        `      DB_PASSWORD: \${POSTGRES_PASSWORD}`,
        `      DATABASE_URLS: "postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB},postgres://mocter_healthcheck:\${POSTGRES_HEALTHCHECK_PASSWORD}@pg-cell:${pgPort}/*"`,
        `      LISTEN_PORT: ${pool.listenPort}`,
        `      POOL_MODE: ${pool.mode}`,
        `      MAX_CLIENT_CONN: ${pool.maxClientConnections}`,
        `      DEFAULT_POOL_SIZE: ${pool.defaultPoolSize}`,
        `      AUTH_TYPE: scram-sha-256`,
        `    ports:`,
        `      - "127.0.0.1:\${PGBOUNCER_PORT}:${pool.listenPort}"`,
        `    healthcheck:`,
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$POSTGRES_USER -d \$\$POSTGRES_DB"]`,
        `      interval: 5s`,
        `      timeout: 3s`,
        `      retries: 5`,
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
        `    image: node:24-alpine`,
        `    working_dir: /app/apps/web`,
        `    command: ["./node_modules/.bin/next", "dev", "-p", "3000"]`,
        `    volumes:`,
        `      - \${REPO_DIR:-..}:/app`,
        `      - mocter-core_root-node-modules:/app/node_modules`,
        `      - mocter-core_web-node-modules:/app/apps/web/node_modules`,
        `      - mocter-core_domain-node-modules:/app/packages/domain/node_modules`,
        `      - cell-${code}-web-next:/app/apps/web/.next`,
        `    environment:`,
        `      CELL_CODE: \${CELL_CODE}`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:${pool.listenPort}/\${POSTGRES_DB}`,
        `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
        `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
        `      PORT: 3000`,
        `    ports:`,
        `      - "127.0.0.1:3004:${app.internalPort}"`,
        `    networks:`,
        `      - cell-backend`,
        `    depends_on:`,
        `      pgbouncer-cell:`,
        `        condition: service_healthy`,
        `    restart: unless-stopped`,
        ``,
        `volumes:`,
        `  pgdata-${code}:`,
        `  cell-${code}-web-next:`,
        `  mocter-core_root-node-modules:`,
        `    external: true`,
        `  mocter-core_domain-node-modules:`,
        `    external: true`,
        `  mocter-core_web-node-modules:`,
        `    external: true`,
        ``,
        `networks:`,
        `  cell-backend:`,
        `    driver: bridge`,
      ].join("\n");

      return { workingDir, deployUser, envContent, dockerComposeContent, instructions };
    }

    // Salida histórica de baseline legado para perfil null (Etapa 1 equivalencia)
    const image = `${app.artifactReference}:\${${app.artifactVersionParameter.name}:-${app.artifactVersionParameter.legacyDefault}}`;
    const migratorCommand = `["node", "migrator/scripts/migrate.mjs", "--target=${spec.migration.target}"]`;

    const dockerComposeContent = [
      `# Manifiesto Canónico de Celda Mocter (${code})`,
      `# Estándar DAT-001 §3.6.2 / OPS-001 RF-06.7`,
      `name: mocter-${code}`,
      ``,
      `services:`,
      `  pg-cell:`,
      `    image: pgvector/pgvector:pg18`,
      `    environment:`,
      `      POSTGRES_DB: \${POSTGRES_DB}`,
      `      POSTGRES_USER: \${POSTGRES_USER}`,
      `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
      `    volumes:`,
      `      - pgdata-${code}:/var/lib/postgresql`,
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
      `    image: ${image}`,
      `    command: ${migratorCommand}`,
      `    environment:`,
      `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pg-cell:${pgPort}/\${POSTGRES_DB}`,
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
      `      DB_PORT: ${pgPort}`,
      `      DB_NAME: \${POSTGRES_DB}`,
      `      DB_USER: \${POSTGRES_USER}`,
      `      DB_PASSWORD: \${POSTGRES_PASSWORD}`,
      `      LISTEN_PORT: ${pool.listenPort}`,
      `      POOL_MODE: ${pool.mode}`,
      `      MAX_CLIENT_CONN: ${pool.maxClientConnections}`,
      `      DEFAULT_POOL_SIZE: ${pool.defaultPoolSize}`,
      `    ports:`,
      `      - "\${PGBOUNCER_PORT}:${pool.listenPort}"`,
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
      `    image: ${image}`,
      `    environment:`,
      `      CELL_CODE: \${CELL_CODE}`,
      `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:${pool.listenPort}/\${POSTGRES_DB}`,
      `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
      `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
      `    ports:`,
      `      - "${LEGACY_TENANT_APP_HOST_PORT}:${app.internalPort}"`,
      `    networks:`,
      `      - cell-backend`,
      `    depends_on:`,
      `      pgbouncer-cell:`,
      `        condition: service_healthy`,
      `    restart: unless-stopped`,
      ``,
      `volumes:`,
      `  pgdata-${code}:`,
      ``,
      `networks:`,
      `  cell-backend:`,
      `    driver: bridge`,
    ].join("\n");

    return { workingDir, deployUser, envContent, dockerComposeContent, instructions };
  }
}


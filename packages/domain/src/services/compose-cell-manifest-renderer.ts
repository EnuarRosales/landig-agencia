import type { CellSecretsBundle } from "./cell-secrets.service";
import type { CellDeploymentSpec, CellManifestRenderer } from "./cell-deployment-spec";
import { getCellManifestEnvConfig } from "../utils/env";

/**
 * Opciones de renderizado configurables para evitar valores fijos en el manifiesto Compose.
 */
export interface ComposeCellRenderOptions {
  /** Imagen PostgreSQL con extensión pgvector. */
  pgvectorImage?: string;
  /** Imagen PgBouncer. */
  pgbouncerImage?: string;
  /** Imagen Node.js para entorno local. */
  localNodeImage?: string;
  /** Usuario de ejecución no privilegiado por defecto (`uid:gid`). */
  deployUserDefault?: string;
  /** Dominio base por defecto para reglas Traefik en `control_plane_vps`. */
  cellBaseDomain?: string;
  /** Nombre de la red externa de Traefik. */
  traefikNetwork?: string;
  /** Nombre de la red externa del Control Plane. */
  controlPlaneNetwork?: string;
  /** Nombre del certresolver TLS de Traefik. */
  traefikCertResolver?: string;
  /** Endpoint privado S3 de SeaweedFS. */
  seaweedS3Endpoint?: string;
  /** Ruta relativa o absoluta hacia la raíz del monorepo desde el directorio local de la celda. */
  localRepoDir?: string;
  /** Directorio base relativo para celdas locales en desarrollo. */
  localWorkDirBase?: string;
  /** Puerto base en loopback para PostgreSQL en desarrollo local. */
  localPgPortBase?: number;
  /** Puerto base en loopback para PgBouncer en desarrollo local. */
  localPgbouncerPortBase?: number;
  /** Puerto base en loopback para la app celular en desarrollo local. */
  localAppPortBase?: number;
  /** Puerto loopback asignado explícitamente a PostgreSQL para evitar colisiones entre N celdas. */
  localPgHostPortOverride?: number;
  /** Puerto loopback asignado explícitamente a la aplicación celular en desarrollo local. */
  localAppPortOverride?: number;
}

/**
 * Extrae el puerto HTTP(S) de una URL de aplicación, con respaldo al puerto configurado.
 *
 * @param appUrl - URL configurada para la aplicación celular.
 * @param fallbackPort - Puerto por defecto si la URL carece de puerto explícito y esquema reconocido.
 * @returns Puerto TCP válido entre 1 y 65535.
 */
export function extractAppPortFromUrl(appUrl: string, fallbackPort: number): number {
  const trimmed = appUrl.trim();
  if (!trimmed) return fallbackPort;

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(normalized);
    if (parsed.port) {
      const explicit = Number(parsed.port);
      if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 65535) {
        return explicit;
      }
    }
    if (parsed.protocol === "https:") return 443;
    if (parsed.protocol === "http:") return 80;
  } catch {
    // Usar fallback si appUrl no es una URL parseable todavía
  }
  return fallbackPort;
}

/**
 * Extrae el nombre de host (sin puerto) de una URL dada.
 *
 * @param appUrl - URL de la aplicación celular.
 * @returns Hostname normalizado en minúsculas o `null` si no es válido.
 */
function extractHostnameFromUrl(appUrl: string): string | null {
  const trimmed = appUrl.trim();
  if (!trimmed) return null;

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Determina si un hostname corresponde a loopback local o dirección IP literal.
 */
function isLocalOrIpHostname(hostname: string | null): boolean {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "::1") return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

/**
 * Resuelve el hostname público de la regla Traefik para `control_plane_vps`.
 */
function resolveControlPlaneRouterHost(code: string, appUrl: string, cellBaseDomain: string): string {
  const hostname = extractHostnameFromUrl(appUrl);
  if (hostname && !isLocalOrIpHostname(hostname)) {
    return hostname;
  }
  return `${code}.${cellBaseDomain}`;
}

/**
 * Calcula la ruta relativa hacia la raíz del monorepo según la profundidad de `workingDir`.
 *
 * Si `workingDir` es una ruta absoluta heredada (ej. `/opt/cell-01`), usa `defaultRepoDir`.
 */
function resolveLocalRepoDir(workingDir: string, defaultRepoDir: string): string {
  const normalized = workingDir.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    return defaultRepoDir;
  }

  const segments = normalized
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".");

  if (segments.length === 0 || segments.some((s) => s === "..")) {
    return defaultRepoDir;
  }

  return segments.map(() => "..").join("/");
}

/**
 * Calcula un puerto loopback determinístico y libre de colisiones para `pg-cell` en local.
 */
function resolveLocalPostgresHostPort(params: {
  overridePort?: number;
  pgPortBase: number;
  pgbouncerPort: number;
  pgbouncerPortBase: number;
  appPort: number;
  appPortBase: number;
  pgInternalPort: number;
}): number {
  if (
    params.overridePort !== undefined &&
    Number.isInteger(params.overridePort) &&
    params.overridePort >= 1 &&
    params.overridePort <= 65535
  ) {
    return params.overridePort;
  }

  const pgbouncerDelta = params.pgbouncerPort - params.pgbouncerPortBase;
  const appDelta = params.appPort - params.appPortBase;
  const offset = pgbouncerDelta !== 0 ? Math.max(0, pgbouncerDelta) : Math.max(0, appDelta);
  const reserved = new Set([params.pgInternalPort, params.pgbouncerPort, params.appPort]);

  let candidate = params.pgPortBase + offset;
  if (candidate < 1024 || candidate > 65535) {
    candidate = params.pgPortBase;
  }

  while (reserved.has(candidate)) {
    candidate = candidate >= 65535 ? 1024 : candidate + 1;
  }

  return candidate;
}

/**
 * Datos de renderizado Compose que no pertenecen al modelo neutral.
 */
export interface ComposeCellRenderContext {
  /** Secretos de la celda ya descifrados; solo se usan para emitir el `.env`. */
  secrets: CellSecretsBundle;
  /** Directorio de trabajo persistido en la celda; `null` usa el directorio por perfil (CEL-RF-023). */
  workingDirOverride: string | null;
  /** Usuario de despliegue persistido en la celda; `null` usa el valor configurado en entorno (CEL-RF-023). */
  deployUserOverride: string | null;
  /**
   * Región legada de `cells.region`, emitida como `REGION` en el `.env`.
   *
   * @remarks Paso legado: CEL-RF-025 excluye la región del modelo neutral, pero el campo persiste
   * temporalmente y el baseline la emite. No participa en placement ni routing.
   */
  legacyRegion: string;
  /** Opciones configurables inyectadas desde entorno o controlador sin valores fijos. */
  options?: ComposeCellRenderOptions;
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
  implements CellManifestRenderer<ComposeCellRenderContext, ComposeCellArtifacts> {
  /**
   * Genera `.env`, Compose e instrucciones operativas para una celda.
   *
   * @param spec - Modelo neutral de la celda.
   * @param context - Secretos resueltos, rutas persistidas y región legada.
   * @returns Artefactos de despliegue Compose.
   */
  render(spec: CellDeploymentSpec, context: ComposeCellRenderContext): ComposeCellArtifacts {
    const envCfg = getCellManifestEnvConfig();
    const opts = {
      pgvectorImage: context.options?.pgvectorImage ?? envCfg.CELL_PGVECTOR_IMAGE,
      pgbouncerImage: context.options?.pgbouncerImage ?? envCfg.CELL_PGBOUNCER_IMAGE,
      localNodeImage: context.options?.localNodeImage ?? envCfg.CELL_LOCAL_NODE_IMAGE,
      deployUserDefault: context.options?.deployUserDefault ?? envCfg.CELL_DEPLOY_USER,
      cellBaseDomain: context.options?.cellBaseDomain ?? envCfg.CELL_BASE_DOMAIN,
      traefikNetwork: context.options?.traefikNetwork ?? envCfg.CELL_TRAEFIK_NETWORK,
      controlPlaneNetwork: context.options?.controlPlaneNetwork ?? envCfg.CELL_CONTROL_PLANE_NETWORK,
      traefikCertResolver: context.options?.traefikCertResolver ?? envCfg.CELL_TRAEFIK_CERTRESOLVER,
      seaweedS3Endpoint: context.options?.seaweedS3Endpoint ?? spec.integrations.seaweedS3Endpoint ?? envCfg.S3_ENDPOINT,
      localRepoDirDefault: context.options?.localRepoDir ?? envCfg.CELL_LOCAL_REPO_DIR,
      localWorkDirBase: context.options?.localWorkDirBase ?? envCfg.CELL_LOCAL_WORK_DIR_BASE,
      localPgPortBase: context.options?.localPgPortBase ?? envCfg.CELL_LOCAL_PG_PORT_BASE,
      localPgbouncerPortBase: context.options?.localPgbouncerPortBase ?? envCfg.CELL_LOCAL_PGBOUNCER_PORT_BASE,
      localAppPortBase: context.options?.localAppPortBase ?? envCfg.CELL_LOCAL_APP_PORT_BASE,
    };

    const code = spec.cell.code;
    const isLocalDev = spec.profile === "local_development";
    const workingDir =
      context.workingDirOverride || (isLocalDev ? `${opts.localWorkDirBase}/${code}` : `/opt/${code}`);
    const deployUser = context.deployUserOverride || opts.deployUserDefault;
    const { secrets } = context;
    const config = spec.configuration;
    const pgUser = spec.postgres.user;
    const pgPort = spec.postgres.internalPort;
    const pool = spec.connectionPool;
    const app = spec.application;

    const localAppPort =
      context.options?.localAppPortOverride ?? extractAppPortFromUrl(config.appUrl, opts.localAppPortBase);
    const postgresHostPort = resolveLocalPostgresHostPort({
      overridePort: context.options?.localPgHostPortOverride,
      pgPortBase: opts.localPgPortBase,
      pgbouncerPort: config.pgbouncerPort,
      pgbouncerPortBase: opts.localPgbouncerPortBase,
      appPort: localAppPort,
      appPortBase: opts.localAppPortBase,
      pgInternalPort: pgPort,
    });
    const localRepoDir = resolveLocalRepoDir(workingDir, opts.localRepoDirDefault);

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
      ...(isLocalDev ? [`REPO_DIR=${localRepoDir}`] : []),
      ``,
      `# Base de Datos PostgreSQL 18 & PgBouncer`,
      `POSTGRES_DB=${config.databaseName}`,
      `POSTGRES_USER=${pgUser}`,
      `POSTGRES_PASSWORD=${secrets.mocter_app_password}`,
      `POSTGRES_MIGRATOR_PASSWORD=${secrets.mocter_migrator_password}`,
      `POSTGRES_HEALTHCHECK_PASSWORD=${secrets.mocter_healthcheck_password}`,
      `POSTGRES_PORT=${pgPort}`,
      ...(isLocalDev ? [`POSTGRES_HOST_PORT=${postgresHostPort}`] : []),
      `PGBOUNCER_PORT=${config.pgbouncerPort}`,
      ``,
      `# Secreto de Handshake y Aplicación`,
      `HANDSHAKE_SECRET=${secrets.handshake_secret}`,
      `APP_URL=${config.appUrl}`,
      ...(isLocalDev ? [`APP_PORT=${localAppPort}`] : []),
      `REGION=${context.legacyRegion}`,
      `MAX_CLIENTS=${spec.cell.maxClients}`,
    ].join("\n");

    const instructions = isLocalDev
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
      const routerHost = resolveControlPlaneRouterHost(code, config.appUrl, opts.cellBaseDomain);
      const dockerComposeContent = [
        `# Manifiesto Canónico de Celda Mocter (${code}) · Perfil control_plane_vps`,
        `# Estándar CEL-001 §3.2 / OPS-001 RF-06.7 (Zero Puertos Host, Redes Traefik y Media)`,
        `name: mocter-${code}`,
        ``,
        `services:`,
        `  pg-cell:`,
        `    image: ${opts.pgvectorImage}`,
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
        `    image: ${opts.pgbouncerImage}`,
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
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$DB_USER -d \$\$DB_NAME"]`,
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
        `      S3_ENDPOINT: ${opts.seaweedS3Endpoint}`,
        `    networks:`,
        `      - cell-backend`,
        `      - ${opts.traefikNetwork}`,
        `      - ${opts.controlPlaneNetwork}`,
        `    labels:`,
        `      - "traefik.enable=true"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.rule=Host(\`${routerHost}\`)"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.entrypoints=websecure"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.tls=true"`,
        `      - "traefik.http.routers.mocter-${code}-tenant.tls.certresolver=${opts.traefikCertResolver}"`,
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
        `  ${opts.traefikNetwork}:`,
        `    external: true`,
        `  ${opts.controlPlaneNetwork}:`,
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
        `    image: ${opts.pgvectorImage}`,
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
        `    image: ${opts.pgbouncerImage}`,
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
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$DB_USER -d \$\$DB_NAME"]`,
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

    if (isLocalDev) {
      const dockerComposeContent = [
        `# Manifiesto Canónico de Celda Mocter (${code}) · Perfil local_development`,
        `# Estándar CEL-001 §3.2 / OPS-001 RF-06.7 (Puertos Loopback 127.0.0.1, Readiness y Offline)`,
        `name: mocter-${code}`,
        ``,
        `services:`,
        `  pg-cell:`,
        `    image: ${opts.pgvectorImage}`,
        `    environment:`,
        `      POSTGRES_DB: \${POSTGRES_DB}`,
        `      POSTGRES_USER: \${POSTGRES_USER}`,
        `      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}`,
        `    ports:`,
        `      - "127.0.0.1:\${POSTGRES_HOST_PORT}:${pgPort}"`,
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
        `    image: ${opts.localNodeImage}`,
        `    working_dir: /app`,
        `    command: ["node", "packages/domain/scripts/migrate.mjs", "--target=cell"]`,
        `    volumes:`,
        `      - \${REPO_DIR:-${localRepoDir}}:/app`,
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
        `    image: ${opts.pgbouncerImage}`,
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
        `      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p ${pool.listenPort} -U \$\$DB_USER -d \$\$DB_NAME"]`,
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
        `    image: ${opts.localNodeImage}`,
        `    working_dir: /app/apps/web`,
        `    command: ["./node_modules/.bin/next", "dev", "-p", "\${APP_PORT}"]`,
        `    volumes:`,
        `      - \${REPO_DIR:-${localRepoDir}}:/app`,
        `      - mocter-core_root-node-modules:/app/node_modules`,
        `      - mocter-core_web-node-modules:/app/apps/web/node_modules`,
        `      - mocter-core_domain-node-modules:/app/packages/domain/node_modules`,
        `      - cell-${code}-web-next:/app/apps/web/.next`,
        `    environment:`,
        `      CELL_CODE: \${CELL_CODE}`,
        `      DATABASE_URL: postgres://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@pgbouncer-cell:${pool.listenPort}/\${POSTGRES_DB}`,
        `      HANDSHAKE_SECRET: \${HANDSHAKE_SECRET}`,
        `      NEXT_PUBLIC_APP_URL: \${APP_URL}`,
        `      PORT: \${APP_PORT}`,
        `    ports:`,
        `      - "127.0.0.1:\${APP_PORT}:\${APP_PORT}"`,
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
      `    image: ${opts.pgvectorImage}`,
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
      `    image: ${opts.pgbouncerImage}`,
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
      `      - "${opts.localAppPortBase}:${app.internalPort}"`,
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


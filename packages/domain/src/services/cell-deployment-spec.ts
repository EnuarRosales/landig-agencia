import type { CellSecretsBundle } from "./cell-secrets.service";
import { getCellManifestEnvConfig } from "../utils/env";

/**
 * Perfiles de despliegue aprobados en CEL-001 §3.2.
 *
 * El perfil lo determina el registro de host (`cell_hosts.deployment_profile`) y no la
 * topología persistida de la celda (CEL-RF-026).
 */
export type CellDeploymentProfile = "local_development" | "control_plane_vps" | "external_vps";

/**
 * Nombres de los secretos por celda que el modelo neutral referencia sin portar su valor (CEL-RF-015).
 */
export type CellSecretReference = keyof CellSecretsBundle;

/**
 * Parámetros de configuración no secretos de una celda.
 *
 * @remarks `region` queda fuera por diseño (CEL-RF-025, AC-13): el campo legado de `cells.region`
 * no forma parte del modelo neutral y solo viaja como paso legado hacia el renderer.
 */
export type CellDeploymentConfiguration = {
  tier: string;
  topologyType: string;
  databaseName: string;
  pgbouncerPort: number;
  appUrl: string;
};

/**
 * Intenciones de conectividad que una celda necesita, independientes de redes físicas (CEL-RF-006).
 */
export type CellConnectivityIntent =
  | "internal-cell"
  | "public-ingress"
  | "control-plane-access"
  | "chatwoot-access"
  | "media-storage-access";

/**
 * Modelo neutral de despliegue de una celda (CEL-RF-006, CEL-RF-007).
 *
 * Describe **qué necesita** la celda; no contiene primitivas Compose (`container_name`, `depends_on`,
 * `restart`, `external: true`, `network_mode`, labels de Traefik, nombres físicos de red, rutas `/opt`,
 * sintaxis de volúmenes/secretos ni publicación de puertos). La traducción a un orquestador concreto
 * pertenece a un {@link CellManifestRenderer}.
 *
 * @remarks Etapa 1 (extracción sin cambio funcional): `cell.hostId` y `profile` admiten `null` para
 * representar filas legadas sin host resuelto. Las etapas posteriores (CEL-T01b/CEL-T03) los vuelven
 * obligatorios y el renderer fallará de forma cerrada ante un valor ausente o ambiguo (CEL-RF-026).
 */
export interface CellDeploymentSpec {
  cell: {
    id: string;
    code: string;
    /** Host de despliegue explícito; `null` solo en filas legadas previas a `cell_hosts`. */
    hostId: string | null;
    /** Capacidad nominal de inquilinos de la celda (CEL-RF-002). */
    maxClients: number;
  };
  /** Perfil resuelto desde el registro del host; `null` mientras no exista resolución (Etapa 1). */
  profile: CellDeploymentProfile | null;
  application: {
    artifactSource: "workspace_source" | "immutable_artifact";
    /** Identidad del artefacto sin etiqueta; no es un campo `image` de Compose. */
    artifactReference: string;
    /**
     * Parámetro operativo que el operador usa para elegir la versión del artefacto.
     *
     * `legacyDefault` conserva el comportamiento histórico del baseline y es un defecto conocido
     * (CEL-RF-003/R-04 prohíben `latest` en producción) que se corrige en la Etapa 2.
     */
    artifactVersionParameter: { name: string; legacyDefault: string };
    internalPort: number;
    healthContract: string;
  };
  postgres: {
    persistenceIntent: "cell_private_persistent";
    user: string;
    internalPort: number;
  };
  migration: { execution: "one_shot"; target: "cell" };
  connectionPool: {
    mode: "transaction";
    /** `false` en el baseline: PgBouncer se publicaba al host. Defecto conocido de la Etapa 1. */
    internalOnly: boolean;
    listenPort: number;
    maxClientConnections: number;
    defaultPoolSize: number;
  };
  configuration: CellDeploymentConfiguration;
  secretReferences: CellSecretReference[];
  integrations: {
    controlPlaneEndpoint: string | null;
    chatwootEndpoint: string | null;
    seaweedS3Endpoint: string | null;
    seaweedBucket: "media" | null;
    imgproxyPublicEndpoint: string | null;
  };
  connectivityIntents: CellConnectivityIntent[];
  placement: { hostId: string | null };
  tls: { database: "required_remote" | "local"; http: "validated_https" | "local" } | null;
}

/**
 * Subconjunto de columnas de `admin.cells` necesario para construir el modelo neutral.
 */
export interface CellDeploymentSpecSource {
  id: string;
  code: string;
  tier: string;
  topologyType: string;
  pgbouncerPort: number;
  databaseName: string;
  appUrl: string;
  maxClients: number;
  hostId?: string | null;
}

/**
 * Referencias de secretos por celda definidas en CEL-RF-015, en el orden histórico del bundle.
 */
export const CELL_SECRET_REFERENCES: readonly CellSecretReference[] = [
  "mocter_app_password",
  "mocter_migrator_password",
  "mocter_healthcheck_password",
  "handshake_secret",
];

/**
 * Parámetros de entorno opcionales para construir el modelo neutral sin valores fijos.
 */
export interface CellDeploymentRuntimeDefaults {
  /** Referencia de imagen base de la aplicación celular. */
  appArtifactReference?: string;
  /** Puerto interno de escucha de `tenant-app`. */
  appInternalPort?: number;
  /** Puerto interno de PostgreSQL celular. */
  postgresInternalPort?: number;
  /** Puerto interno de escucha de PgBouncer. */
  pgbouncerInternalPort?: number;
  /** Endpoint S3 privado compartido para multimedia. */
  seaweedS3Endpoint?: string | null;
}

/**
 * Construye el modelo neutral de despliegue a partir de una fila de celda legada o perfilada.
 *
 * No lee secretos ni región: ambos se entregan al renderer por canales separados.
 *
 * @param cell - Columnas relevantes de `admin.cells`.
 * @param profile - Perfil resuelto desde `admin.cell_hosts` (`null` conserva equivalencia Etapa 1).
 * @param runtimeDefaults - Parámetros resueltos desde configuración centralizada de entorno.
 * @returns Modelo neutral inmutable por convención, sin primitivas Compose.
 *
 * @example
 * ```typescript
 * const spec = buildCellDeploymentSpec(cellRow);
 * const artifacts = new ComposeCellManifestRenderer().render(spec, context);
 * ```
 */
export function buildCellDeploymentSpec(
  cell: CellDeploymentSpecSource,
  profile?: CellDeploymentProfile | null,
  runtimeDefaults?: CellDeploymentRuntimeDefaults,
): CellDeploymentSpec {
  const envCfg = getCellManifestEnvConfig();
  const resolvedProfile = profile ?? null;
  const appArtifactReference = runtimeDefaults?.appArtifactReference ?? envCfg.CELL_APP_IMAGE;
  const appInternalPort = runtimeDefaults?.appInternalPort ?? envCfg.CELL_APP_INTERNAL_PORT;
  const postgresInternalPort = runtimeDefaults?.postgresInternalPort ?? envCfg.CELL_PG_INTERNAL_PORT;
  const pgbouncerInternalPort =
    runtimeDefaults?.pgbouncerInternalPort ?? envCfg.CELL_PGBOUNCER_INTERNAL_PORT;
  const seaweedS3Endpoint =
    runtimeDefaults?.seaweedS3Endpoint !== undefined
      ? runtimeDefaults.seaweedS3Endpoint
      : resolvedProfile
        ? envCfg.S3_ENDPOINT
        : null;

  return {
    cell: {
      id: cell.id,
      code: cell.code,
      hostId: cell.hostId ?? null,
      maxClients: cell.maxClients,
    },
    profile: resolvedProfile,
    application: {
      artifactSource: resolvedProfile === "local_development" ? "workspace_source" : "immutable_artifact",
      artifactReference: appArtifactReference,
      artifactVersionParameter: { name: "TAG", legacyDefault: "latest" },
      internalPort: appInternalPort,
      healthContract: "/api/health",
    },
    postgres: {
      persistenceIntent: "cell_private_persistent",
      user: "mocter_app",
      internalPort: postgresInternalPort,
    },
    migration: { execution: "one_shot", target: "cell" },
    connectionPool: {
      mode: "transaction",
      internalOnly: resolvedProfile === "control_plane_vps" || resolvedProfile === "external_vps",
      listenPort: pgbouncerInternalPort,
      maxClientConnections: 100,
      defaultPoolSize: 20,
    },
    configuration: {
      tier: cell.tier,
      topologyType: cell.topologyType,
      databaseName: cell.databaseName,
      pgbouncerPort: cell.pgbouncerPort,
      appUrl: cell.appUrl,
    },
    secretReferences: [...CELL_SECRET_REFERENCES],
    integrations: {
      controlPlaneEndpoint: null,
      chatwootEndpoint: null,
      seaweedS3Endpoint,
      seaweedBucket: seaweedS3Endpoint ? "media" : null,
      imgproxyPublicEndpoint: null,
    },
    connectivityIntents: ["internal-cell", "public-ingress"],
    placement: { hostId: cell.hostId ?? null },
    tls:
      resolvedProfile === "local_development"
        ? { database: "local", http: "local" }
        : resolvedProfile
          ? { database: "required_remote", http: "validated_https" }
          : null,
  };
}

/**
 * Contrato de un renderer que traduce {@link CellDeploymentSpec} a artefactos de un orquestador concreto.
 *
 * @typeParam TContext - Datos de renderizado ajenos al modelo neutral (secretos resueltos, rutas, legado).
 * @typeParam TArtifacts - Artefactos producidos por el orquestador destino.
 */
export interface CellManifestRenderer<TContext, TArtifacts> {
  /**
   * Genera los artefactos de despliegue.
   *
   * @param spec - Modelo neutral de la celda.
   * @param context - Datos específicos del renderer; nunca forman parte del modelo neutral.
   * @returns Artefactos listos para entregar al operador.
   */
  render(spec: CellDeploymentSpec, context: TContext): TArtifacts;
}


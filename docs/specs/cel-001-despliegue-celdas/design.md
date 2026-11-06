# CEL-001 — Diseño de despliegue celular

**Versión:** 1.0 · **Estado:** Aprobado junto con CEL-001 requirements · 2026-11-06.  
**Alcance:** diseño de documentación; no autoriza código ni despliegue.

## 1. Decisiones de diseño

1. CEL-001 es la fuente detallada para perfil, host placement, generación del manifiesto, ciclo operativo celular y el acceso de `tenant-app` a SeaweedFS/imgproxy.
2. El dominio describe **qué necesita** una celda; `ComposeCellManifestRenderer` traduce esas intenciones a Docker Compose. No se introduce código ni dependencias de Kubernetes en esta especificación.
3. Los tres perfiles comparten la misma topología lógica de cuatro servicios, no necesariamente el mismo YAML resultante. La salida se llama `docker-compose.cell.yml` y sus propiedades de build/imagen, redes, publicación y routing se derivan del perfil.
4. SeaweedFS e imgproxy son servicios compartidos. Las celdas los consumen por endpoints y referencias de secretos; no crean ni gestionan esos servicios.
5. `client_id → cell_id → host_id → application endpoint` se resuelve desde el Control Plane. La ubicación física no se codifica en `client_id` ni en URLs permanentes del navegador.

## 2. Límites entre especificación y renderer

### Modelo neutral

`CellDeploymentSpec` debe expresar al menos:

```ts
interface CellDeploymentSpec {
  cell: {
    id: string;
    code: string;
    hostId: string;
    maxClients: 100;
  };
  profile: "local_development" | "control_plane_vps" | "external_vps";
  application: {
    artifactSource: "workspace_source" | "immutable_artifact";
    artifactReference?: string;
    internalPort: number;
    healthContract: string;
  };
  postgres: { persistenceIntent: "cell_private_persistent" };
  migration: { execution: "one_shot"; target: "cell" };
  connectionPool: { mode: "transaction"; internalOnly: true };
  configuration: Record<string, string | number | boolean>;
  secretReferences: string[];
  integrations: {
    controlPlaneEndpoint: string;
    chatwootEndpoint: string;
    seaweedS3Endpoint: string;
    seaweedBucket: "media";
    imgproxyPublicEndpoint: string;
  };
  connectivityIntents: Array<
    | "internal-cell"
    | "public-ingress"
    | "control-plane-access"
    | "chatwoot-access"
    | "media-storage-access"
  >;
  placement: { hostId: string };
  tls: { database: "required_remote" | "local"; http: "validated_https" | "local" };
}
```

The neutral model must not gain Compose concepts such as `container_name`, `depends_on`, `restart`, `external: true`, `network_mode`, Traefik labels, Docker network names, `/opt` paths, Compose volume/secrets syntax, or `ports` syntax. `artifactReference` is an immutable artifact identity, not a Compose `image` field.

### Compose renderer

`ComposeCellManifestRenderer` is the only component that knows Compose syntax. It translates `CellDeploymentSpec` into the four services, unique resource identities, profile-specific network attachments, routing and port bindings. It validates required external network names and reports their absence; it never claims a network exists merely because a name was configured.

| Intent | Local development | Control Plane VPS | External VPS |
|---|---|---|---|
| `tenant-app` source | Build from the workspace Dockerfile and source using preloaded workspace/dependency cache; no Internet or registry requests | Immutable published artifact | Immutable published artifact |
| Host ports | Development ports bound to `127.0.0.1` only | None | None |
| Ingress | No production Traefik labels | Traefik discovery on configured `traefik_network` | Host-local Traefik |
| Cell services | Four services on a unique private cell network | Four services on a unique private cell network | Four services on a unique private cell network |
| Shared service access | Configured local bridge networks/endpoints | Only `tenant-app` joins configured external networks it needs | Configured private endpoints; no Docker network from the main VPS |
| Media | Shared SeaweedFS endpoint and imgproxy URL | Shared SeaweedFS endpoint and imgproxy URL | Private SeaweedFS endpoint and configurable public imgproxy URL |

Production images are pinned by an immutable release/commit reference supported by the existing release flow; `latest` is rejected. Production profiles never build or mount the source tree. The external profile does not create a VPN or firewall configuration: these are explicitly external prerequisites when absent.

## 3. Cell placement, identity and capacity

The Control Plane owns the `cells` and `cell_hosts` records. `cell_hosts` carries `host_id`, a unique host code, deployment profile/class, operational status and a reference to non-secret connectivity configuration. Secrets remain in the secret-management boundary. `cells.host_id` is nullable only while the cell is `draft` and is required before `provisioning`; its FK is internal to the Control Plane. `CellDeploymentSpec.profile` must match the profile registered for the chosen host; otherwise generation fails closed. No foreign key crosses Control Plane/data-cell boundaries. `client_routing` continues to map tenants to cells; host placement is resolved after that mapping.

The nominal capacity is 100 tenants per cell. Host resource capacity is separate and may reduce effective capacity. There is no fixed cells-per-host count and no automatic scheduler or tenant movement. The operator performs and audits a manual resource-capacity preflight before marking a host `ready`; that readiness is a human declaration, not a measured scheduler result. Host selection is independent of deciding to create a cell. Assignments reserve a cell slot atomically and reject any allocation beyond `max_clients`; this spec defines no numeric CPU/RAM threshold or automated capacity algorithm.

The persisted `topology_type` values `local_compose` and `remote_vps` are preserved. `local_compose` maps to `local_development`; `remote_vps` remains generic and does not choose between `control_plane_vps` and `external_vps`. The renderer obtains the profile from the explicit `host_id`/host registry and fails closed for a missing or ambiguous host profile. Existing records are never remapped automatically.

### Host directory and secret boundary

Production paths are derived from normalized `cell_code` as `/opt/<name-cell>` and are operated by `deploy:1000`; they are renderer/operations details, never neutral-model fields. The secret bundle contains only per-cell credentials and handshake material, is generated with CSPRNG, encrypted at rest with AES-256-GCM and AAD bound to `cell_id` plus purpose, and stored as ciphertext plus key identifier. The active encryption key is mounted through the approved secret manager/path; no fallback production key is allowed. A Platform Owner's explicit `.env.cell` export is audited and `no-store`; the operator installs it with `0600` permissions. The neutral model carries secret references only.

## 4. Service lifecycle and availability

The service graph is exactly `pg-cell`, `cell-migrator`, `pgbouncer-cell` and `tenant-app`.

1. PostgreSQL starts with a cell-owned persistent volume and private network.
2. `cell-migrator` connects directly to PostgreSQL, uses only the cell migration configuration, runs once and exits success/failure. It is not restarted as a long-lived service.
3. PgBouncer starts only after successful migration and remains private; `tenant-app` connects through PgBouncer, never directly to PostgreSQL for ordinary queries.
4. `tenant-app` starts only when PgBouncer is ready, not merely started. Use health checks/readiness and bounded retries; no arbitrary sleeps.
5. Existing DAT-001 lifecycle states remain authoritative. Only the complete data + application handshake can transition `verifying → active`. Periodic probes may move `active → error_connection`; they cannot activate or move tenants.

The data probe uses `mocter_healthcheck` with least privilege, validates TLS in remote profiles, migration journal, base tables and RLS state without reading tenant rows. The HTTP probe calls `/api/health` with the handshake secret, compares it in constant time, rejects invalid secrets, does not follow redirects and only targets approved private destinations. Remote resolution is checked against `CELL_PRIVATE_ALLOWED_CIDRS`; local mode permits only loopback or an explicitly joined cell network. A light `SELECT 1` plus HTTP health probe runs every 60 seconds; three consecutive failures transition `active → error_connection`. Recovery requires the complete manual handshake.

## 5. Multimedia request flow

### Write path

1. `tenant-app` authenticates and authorizes the operation for the active `client_id`, validates the media against ADM-001 type/size/quota requirements and computes the content hash.
2. The backend writes the bytes to the private S3-compatible SeaweedFS endpoint, using the shared `media` bucket and server-side least-privilege credentials referenced from the secret manager.
3. The global media catalog stores the object key, hash, size and media metadata. The tenant's product-to-media relation remains in its cell. PostgreSQL stores no binary payload.
4. The write is not reported as complete until object storage and the corresponding metadata/reference are consistent; partial failures must be surfaced and recoverable without cross-tenant links.

### Read path

1. The backend resolves the media reference and verifies ownership/authorization using `client_id` and the catalog relationship.
2. The backend creates an HMAC-SHA256 signed imgproxy URL for the approved `s3://media/<key>` source and permitted transforms. Key/salt material comes from the platform secret manager, not the image, repository, manifest or browser.
3. The browser receives only the public imgproxy URL. imgproxy reads SeaweedFS over its private network. The browser never receives an S3 endpoint or credentials.
4. Unsigned, invalidly signed, unauthorized or disallowed sources/transforms fail closed. Private media URLs use a 900-second `expires` and backend authorization for each issuance; an expired signature returns 404. Renewal requires reauthorization. Public product images use the approved public-signature policy.

SeaweedFS stays private and has no public ingress or published ports. imgproxy is the only public media service. Platform limits remain those approved in ADM-001: bucket `media`, source limit 100 MB, output dimension 4096 px, queue 100 with 429 on saturation, and one animation frame. Deployment/upgrades/backups of the shared media stack remain owned by the `mocter-media`/OPS-001 boundary.

## 6. Compatibility and stage gates

Stage 1 extracts the neutral model and renderer without changing observable output of the existing supported manifest generator. Capture prior outputs for each legacy topology and compare semantic Compose objects, normalizing only dynamic identifiers/secrets. Record known baseline defects separately; equivalence does not certify compliance with this design.

Stage 2 adds profile differences and the required functional behavior only after Stage 1 equivalence is validated. The gate also requires that known baseline issues affecting the first cell (cell migration target, probes, lifecycle enforcement, private routing and media persistence) have explicit tasks and tests. If the equivalence gate fails or evidence is unavailable, do not start Stage 2.

No Kubernetes renderer is implemented. The profile-neutral intents may later map to Deployment/StatefulSet/Job/Service/Ingress/PVC/Secret/NetworkPolicy, but that mapping is not part of this design's acceptance.
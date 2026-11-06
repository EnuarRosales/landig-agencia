# Cell Handshake Implementation
Implements the approved DAT-001/ADM-001/OPS-001 v1 cell handshake contract before production use.
Scope: no cell is deployed; v1 is remote VPS + local Docker Compose, private Router-to-cell connectivity, and protected cell APIs using Mocter AuthService/RBAC.

## Specs
- S1: “Responde siempres en spanish y continua con la implementacion”
- S2: “VPS + Compose local (Recomendado)”
- S3: “Acceso privado Router→celda (Recomendado)”
- S4: “API protegida en apps/web (Recomendado)”
- S5: Approved source of truth: `docs/specs/dat-001-arquitectura-datos-multiinquilino/requirements.md` RF-03.1, RF-03.8–RF-03.10; `design.md` §3.2, §3.3, §3.6.1–§3.6.4.
- S6: Approved admin and operations contracts: `docs/specs/adm-001-mocter-admin/requirements.md` RF-10.17–RF-10.19; `docs/specs/ops-001-operacion-continuidad-observabilidad/requirements.md` RF-06.7, RF-08.6, RF-09.1–RF-09.7 and acceptance criterion 15.
- S7: “Esto es una Rule para el proyecto. No realizar commit hasta que se pregunte cual el tag # a asignar para vincular dicho cambio al feature de github. El tag que se informe debe ir al principio del mensaje del commit.”
- Proposal status for S8–S23: the user approves the three deployment profiles, `cell_id → host_id`, SeaweedFS persistence/imgproxy reads, 100-client cell capacity, removal of region from the cell/host business model, preserving topology aliases with an explicit profile, manual host-capacity preflight, deferring region-field code removal until a separate authorized migration, an offline local build/run profile, and CEL-001 v1.0 as canonical. The current disposition remains documentation only; no implementation is authorized.
- S8 — Proposed outcomes (quoted from the user's prompt; pending reconciliation):
  > “Desacoplar completamente el ambiente de desarrollo local de las imágenes Docker publicadas del proyecto.”
  > “Mantener imágenes inmutables como mecanismo exclusivo de despliegue productivo.”
  > “Separar la definición lógica de una celda de su ubicación física.”
  > “Permitir que varias celdas convivan en un mismo VPS mientras existan recursos.”
  > “Permitir que nuevas celdas se desplieguen posteriormente en VPS externos.”
  > “Mantener un máximo inicial de 100 inquilinos por celda.”
  > “Preparar el diseño para una futura migración a Kubernetes, sin implementar Kubernetes en esta fase.”
  > “Convertir Docker Compose en un adaptador de salida, no en el modelo de dominio de la infraestructura.”
- S9 — Proposed profiles (quoted; runtime existence of the named networks/endpoints remains unverified):
  > “La solución debe soportar tres perfiles.”
  > “Desarrollo local”
  > “tenant-app se construye desde el código fuente mediante build.”
  > “No requiere TAG.”
  > “No requiere una release.”
  > “No requiere una imagen publicada.”
  > “No requiere GHCR.”
  > “No requiere acceso a Internet.”
  > “Los puertos se publican exclusivamente sobre 127.0.0.1.”
  > “No utiliza labels de Traefik de producción.”
  > “Producción en el VPS del Control Plane”
  > “tenant-app utiliza una imagen inmutable.”
  > “No utiliza build.”
  > “No publica puertos directamente.”
  > “Producción en VPS externo”
  > “El manifiesto no puede utilizar redes Docker que solo existen en el VPS principal.”
  > “La conectividad entre hosts puede depender de red privada, WireGuard, VPN o infraestructura equivalente.”
  > “Clasifícala como requisito externo cuando no exista evidencia de su implementación.”
- S10 — Proposed placement and capacity separation (quoted):
  > “La capacidad lógica de una celda y la capacidad física de un host son conceptos independientes.”
  > “La decisión de crear una celda y la decisión de elegir un host deben permanecer separadas.”
  > “Agrega, si todavía no existe: cell_id -> host_id”
  > “client_id -> cell_id -> host_id -> application endpoint”
- S11 — Proposed renderer boundary (quoted):
  > “Construye primero una especificación neutral, por ejemplo: CellDeploymentSpec”
  > “Después tradúcela mediante un renderer: ComposeCellManifestRenderer”
  > “No implementes ahora KubernetesCellManifestRenderer.”
  > “La especificación neutral no podrá contener primitivas específicas de Docker Compose”
- S12 — Proposed phase gate (quoted):
  > “La Etapa 2 solo puede comenzar si la equivalencia de la Etapa 1 queda validada.”
  > “Durante la Etapa 1 no cambies:
  >
  > - image por build.
  > - Redes.
  > - Labels.
  > - Puertos.
  > - Volúmenes.
  > - Secrets.
  > - Health checks.
  > - Orden de arranque.
  > - Variables de entorno.
  > - Handshake.
  > - Política de reinicio.
  > - Rutas productivas.
  > - Comportamiento funcional.”
  > “Si no se cumple, detén la Etapa 2 y reporta:
  >
  > Etapa 1: IMPLEMENTADA, NO VALIDADA
  > Etapa 2: NO INICIADA
  >
  > o:
  >
  > Etapa 1: BLOQUEADA
  > Etapa 2: NO INICIADA”
- S13 — Proposed media boundary (quoted):
  > “SeaweedFS e imgproxy son infraestructura compartida y no forman parte del ciclo de vida de una celda.”
  > “El Compose celular no debe crear ni administrar SeaweedFS o imgproxy.”
  > “Escribe los archivos en SeaweedFS mediante conectividad privada.”
- S14 — Controlling user instruction (quoted verbatim):
  > “no uses dicho prompt como instruccion absolutista es analizar y contrastar con la realidad del proyecto para documentar los requisitos ODD del requerimiento. Quedo atento a preguntas de aclaración.”
- S15 — Canonical consolidation and approved media/capacity requirement (quoted verbatim):
  > “Primero que todo vamos a centralizar todo en una unica spec que documente por completo el requerimiento, de la remediacion propuesta es aprobada en cuanto a el tema multimedia y capacidad es claro que se debe ajusta todo para que tenant-app pueda persistir datos en SeaweedFS y los pueda leer de forma segura usando del servicio de imgproxy. Primero realiza la consolidacion de especificaciones autorizo su reescritura”
- S16 — User selected “Incluir los tres perfiles”: the consolidated requirements include local development, Control Plane VPS production, external VPS production, and the `cell_id → host_id` placement relation. This selection authorizes the specification scope, not implementation.
- S17 — User decision (quoted verbatim):
  > “Eliminar ambos concepto de region ahora mismo no son relevantes para la logica de negocio”
- S18 — User selected “Conservar alias y perfil explícito (recomendado)”: retain persisted `local_compose`/`remote_vps`; map `local_compose` to `local_development`; keep `remote_vps` generic and require explicit host/profile selection before manifest generation.
- S19 — User selected “Manual, sin umbrales (recomendado)”: only an operator's audited capacity preflight can mark a host `ready`; no fixed cells-per-host count, numeric CPU/RAM thresholds or automatic scheduler are added.
- S20 — User selected “Diferir el retiro (recomendado)”: keep the legacy `cells.region` code/storage field untouched during spec consolidation; remove it only in a later, compatible migration after CEL-001 approval and API/data-use audit.
- S21 — User selected “Build y ejecución offline (recomendado)”: local cell build and runtime require no Internet or image registry; dependencies must be preloaded in the workspace/cache and installation during `cell:up` is offline.
- S22 — User approved CEL-001 v1.0 as the canonical cell deployment, placement and multimedia specification. DAT-001 v1.6, ADM-001 v1.7 and OPS-001 v1.8 are approved with their domain responsibilities and CEL-001 cross-references. This does not authorize code or deployment.
- S23 — User selected “Quedar solo en documentación”: retain the approved specifications without starting CEL-T01 or any code, migration, commit or deployment task absent separate authorization.

## Tasks
- T1 — S4-S6 — Route: gentle-ai-worker — Status: in progress — Commit: pending — Implement control-plane cell schema/migration, CSPRNG secret bundle encryption, draft registration and `cells.provision` authorization in `apps/web`; rewire the existing admin list/create UI through exact-origin CORS/CSRF and remove the unauthenticated legacy cell API path.
- T2 — S3,S5-S6 — Route: inline — Status: pending — Commit: pending — Implement private-target validation, dual DB/HTTP probes, activation/recovery transitions, and scheduled failure handling without automatic route moves.
- T3 — S4,S6 — Route: inline — Status: pending — Commit: pending — Implement admin cell modal/actions and manifest export through the protected `apps/web` API; use exact-origin CORS and CSRF.
- T4 — S2-S6 — Route: inline — Status: pending — Commit: pending — Implement the dedicated cell health service, canonical Compose stack and `pnpm cell:up`; migrations must complete before PgBouncer and the service start.
- T5 — S5-S6 — Route: inline — Status: pending — Commit: pending — Run applicable focused/domain/admin checks, validate compose configuration and cross-check the implemented contract; record any unavailable integration proof.
- T6 — S8-S14 — Route: inline — Status: done — Commit: none (analysis/documentation only) — Contrast the proposed cell deployment profiles and renderer boundary with actual code and approved project specifications; classify evidence and blockers; make no source-code changes.
- T7 — S15-S22 — Route: inline — Status: done — Commit: none — Consolidate and approve the cell deployment, placement, capacity and multimedia specification; omit region from the canonical model but defer code/storage removal; preserve topology aliases; require manual audited host-capacity preflight and offline local build/run; retarget related specs without changing code or T1–T5 statuses.

## Log
- L1: “Responde siempres en spanish y continua con la implementacion”
- L2: User approved v1 choices: “VPS + Compose local (Recomendado)”, “Acceso privado Router→celda (Recomendado)” and “API protegida en apps/web (Recomendado)”.
- L3: User confirmed no cell is deployed and OPS-001's prior `pg-cell-001` production references were stale.
- L4: Specification work is committed as `d2c8d2bb76c34fb2594b75142af7e50b6ba37cfd`; implementation must follow that commit's reviewed contracts.
- L5: Delivery strategy: keep each security/data/environment high-risk behavior in its own conventional work-unit commit; include tests with each behavior; do not push or create a PR.
- L6: “Esto es una Rule para el proyecto. No realizar commit hasta que se pregunte cual el tag # a asignar para vincular dicho cambio al feature de github. El tag que se informe debe ir al principio del mensaje del commit.”
- L6: User selected the existing Mocter AuthService/RBAC boundary; cell APIs will live on the `apps/web` auth origin, which receives the host-only session cookie on credentialed same-site requests from the admin subdomain.
- L7: T1 worker returned partial. Parent review found the cells GET route lacks `cells.provision` authorization, the RBAC role filter builds a malformed/non-matching `IN` query, the secret AAD is bound to `code` rather than the cell UUID, and creation does not validate required `app_url` or enforce derived `working_dir`/fixed `deploy_user`. These require RED tests and correction before T1 can close.
- L8: The worker's host-only-cookie blocker is not established: a credentialed request from the same-site admin subdomain to the cookie's own `apps/web` host can carry that host-only cookie. Keep exact-origin CORS/CSRF and verify the browser flow; do not broaden cookie Domain.
- L9 — Scope/control instruction (verbatim): “no uses dicho prompt como instruccion absolutista es analizar y contrastar con la realidad del proyecto para documentar los requisitos ODD del requerimiento. Quedo atento a preguntas de aclaración.”
- L10 — User selected the chat diagnosis plus an ODD document, then chose to update this existing cell-handshake ODD file. This is documentation/reconciliation only; no implementation of the pasted proposal was authorized.
- L11 — Read-only audit evidence (handoff `mw3wlpwp-2-siln`): `cell-manifest.service.ts:28-190` directly generates env/Compose/instructions rather than consuming a neutral spec; manifest uses `TAG:-latest` at `:96,135`, contrary to core `.agents/AGENTS.md` R-04. `docker-compose.cell.yml:36` invokes the migrator without `--target=cell`; the local tenant app is run as `@mocter/web dev`, and PgBouncer uses local port 6432 rather than the DAT-001 design's 6433. `apps/web/app/api/health/route.ts:20-45` does not validate the handshake secret. `cell-handshake.service.ts:257` probes with `mocter_app` and `SELECT 1`; `:50-81` lacks the proposed CIDR allowlist. `admin-dashboard.service.ts:318-344,425` permits status changes that can bypass the full handshake. `drizzle-cell-auth.repository.ts:37` uses the global `getDb()` provider; no per-cell application data-plane routing was evidenced. `cells.ts:13-61` does not establish `host_id`. Core media code signs imgproxy URLs, but the audit did not find an implemented SeaweedFS upload path.
- L12 — Reconciliation findings: the requested first development cell is not currently demonstrated as functional end-to-end. The renderer/profile proposal is not implemented; the current local migrator target, image/tag policy, handshake health verification, lifecycle gating, and per-cell data routing have material gaps. Stage-1 equivalence against current manifests would only prove preservation of current output, not compliance with DAT-001 or the prompt's final behavior. DAT-001 RF-03.10 describes the same `docker-compose.cell.yml` across its two v1 topologies; reconcile that contract before adopting three profile-specific outputs. Runtime network presence, private endpoint reachability, disposable/live database state, and actual cell deployment were not verified; no `.env` or secret values were inspected. Treat the prompt's production/external profiles, `host_id`, capacity limit, and media upload contract as proposed until reconciled with canonical specs and concrete environment evidence.
- L13 — Project-policy constraint: `.agents/AGENTS.md` requires non-trivial implementation work to originate from `docs/specs/<id>-<name>/` and gives that SDD hierarchy precedence over task documents. This ODD update records the proposal and evidence; it does not replace a canonical SDD revision or authorize future code changes.
- L14 — Independent revalidation correction (handoff `mw3xj8pf-3-1xl6`): supersedes inaccurate parts of L11. Local PgBouncer port 6432 is bound to `127.0.0.1` in `docker-compose.cell.yml:62`; DAT-001 design §3.6.4's 6433 is an example, not a normative port, so this is **not** a contradiction. The real public-port violation is the generated remote manifest at `cell-manifest.service.ts:131`, which publishes PgBouncer without a loopback bind and conflicts with `.agents/AGENTS.md` R-10 / OPS-001 RF-06.7. Current `TAG:-latest` references are `cell-manifest.service.ts:107,142`; local migrator command is `docker-compose.cell.yml:35`, and `scripts/migrate.mjs:10,24-33` defaults to control-plane migrations. The status bypass is `admin-dashboard.service.ts:411` through `apps/web/app/api/admin/cells/[id]/route.ts:60-114`; `/action` restricts its allowed transitions. Prior `:318-344,425` references were stale. Revalidation also confirms `docker-compose.cell.yml:35` orders the cell migrator after PostgreSQL health and PgBouncer after successful migration (`:63-67`); the tenant app only waits for PgBouncer `service_started` (`:85-86`). The profile generator and committed Compose file differ in image/build, network, migrator target, and secret defaults, confirming two sources of deployment truth against DAT-001 RF-03.10. Media transformations sign imgproxy URLs (`catalog-and-media.service.ts:668-704`), while product-media ingestion stores bytes in in-memory Maps (`:466-483`); no SeaweedFS/S3 upload implementation was evidenced. Health-secret validation, probe completeness, CIDR/redirect protection, absent per-cell routing, and missing `host_id` remain as recorded in L11-L12. Runtime Compose validation, network reachability, and deployment remain untested.
- L15 — User authorized specification consolidation and rewrite (verbatim): “Primero que todo vamos a centralizar todo en una unica spec que documente por completo el requerimiento, de la remediacion propuesta es aprobada en cuanto a el tema multimedia y capacidad es claro que se debe ajusta todo para que tenant-app pueda persistir datos en SeaweedFS y los pueda leer de forma segura usando del servicio de imgproxy. Primero realiza la consolidacion de especificaciones autorizo su reescritura”
- L16 — Scope decision: user selected “Incluir los tres perfiles”; the new canonical spec covers local development, Control Plane VPS, external VPS, and `cell_id → host_id`. SeaweedFS write + imgproxy safe-read and 100 tenants/cell are approved requirements.
- L17 — Architecture decision for documentation: create one new canonical cell deployment specification because DAT-001 owns data-plane invariants, ADM-001 owns product/admin behavior, and OPS-001 owns operations; each will retain its domain responsibilities and reference the new source of truth for deployment/placement/media integration.
- L18 — Consolidation delivered as a draft: `docs/specs/cel-001-despliegue-celdas/{requirements,design,tasks}.md` is the single proposed cell deployment/placement/media source. DAT-001 v1.5, ADM-001 v1.6 and OPS-001 v1.7 remain the previously approved baselines; working revisions v1.6/v1.7/v1.8 are marked in review and cross-reference CEL-001. The Control Plane host registry/`host_id`, three profiles, 100-client capacity and SeaweedFS-write/imgproxy-read contract are documented. Private-media TTL and `cells.region` semantics remain explicit open items in CEL-001. No code, migrations, tests, Compose validation or deployment was run; T1–T5 statuses are unchanged.
- L19 — User confirmed a 15-minute TTL (`expires=900` seconds) for private imgproxy URLs. This resolves CEL-001's pending TTL value; public product-image signing remains unchanged. No implementation was authorized.
- L20 — User decision (verbatim): “Eliminar ambos concepto de region ahora mismo no son relevantes para la logica de negocio”. The canonical CEL-001/DAT-001 cell and host model must therefore omit region; this changes documentation only and does not authorize source-code modification.
- L21 — The region decision is reflected in CEL-001 and the DAT-001 working revision: the canonical cell/host schema, neutral model and placement contract omit region fields. The current source tree still contains the legacy `cells.region` field; removing it from code/storage requires a later compatible migration and separate implementation authorization.
- L22 — User selected “Conservar alias y perfil explícito (recomendado)”: keep `local_compose` and `remote_vps` intact, map `local_compose` to `local_development`, and require an explicit `deployment_profile` supported by the selected `host_id` for each `remote_vps` cell. Ambiguous records fail closed; no silent remapping or code migration was authorized.
- L23 — The compatibility choice is documented in CEL-RF-026 and CEL-001 design. No schema/API/code migration or deployment was performed.
- L24 — User selected “Manual, sin umbrales (recomendado)”: host capacity is verified and audited by an operator before setting `ready`; no fixed cells-per-host count, numeric CPU/RAM thresholds or automated scheduler are required. No code was changed.
- L25 — User selected “Diferir el retiro (recomendado)”: leave the existing `cells.region` column/code untouched during this spec-only task. A separate compatible migration/API cleanup requires CEL-001 approval, an audit of persistence and public usage, and explicit implementation authorization.
- L26 — The confirmed topology compatibility rule is in CEL-RF-026; the manual host-capacity preflight is in CEL-RF-001/003. All confirmations to date are specification decisions only; the source code still has legacy `cells.region`, and no implementation/migration was authorized.
- L27 — User selected “Build y ejecución offline (recomendado)”: the local profile must build and run without Internet or registry access; dependency material must be available locally and `cell:up` must not install dependencies online. No implementation was authorized.
- L28 — CEL-001 now records the confirmed offline local build/run contract. Availability of preloaded package artifacts/cache remains a runtime prerequisite to verify; all source changes, migrations, Compose execution and deployment remain outside this documentation task. CEL-001 stays a draft pending owner approval.
- L29 — The strict offline decision is in CEL-RF-010, the local profile and CEL-T03. Whether the target workspace/build cache is actually populated is a runtime verification prerequisite; no build or code change was performed.
- L30 — User selected “Aprobar CEL-001 como canónica”: CEL-001 v1.0 and the aligned DAT-001 v1.6, ADM-001 v1.7 and OPS-001 v1.8 revisions are approved as the consolidated cell deployment specification set. This approval does not authorize code, migrations, commits or deployment.
- L31 — User approved CEL-001 v1.0 as the canonical cell deployment specification. The aligned DAT-001 v1.6, ADM-001 v1.7 and OPS-001 v1.8 revisions are approved and indexed; code, migrations and deployment remain separately unauthorized.
- L32 — User selected “Quedar solo en documentación”; CEL-T01 and remaining implementation tasks stay pending. No source-code, schema, migration, commit or deployment changes are authorized in this disposition.

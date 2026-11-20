# SPEC-15 · Diseño Técnico: Comunidades Multi-Red, Líder/Miembros y Clonación Inteligente

## 1. Arquitectura General Multi-Comunidad y Multi-Celda

```mermaid
flowchart TB
    Admin["Backoffice SaaS (/admin/communities & /admin/plans)"] -->|Aprueba Líder + Cupo / Configura community_feed| CP[("Router Global · schema admin<br/>organizations, organization_members,<br/>community_leader_authorizations,<br/>product_shares, product_share_versions,<br/>product_adoptions, clone_sync_policies,<br/>feed_posts, client_sharing_profiles")]
    Leader["Inquilino Líder (/workspace/community)"] -->|1. Solicita Líder / Crea Comunidad / Invita| CP
    Leader -->|2. Publica o Versiona Simple/Combo<br/>Lee pg-cell(Líder)| CloningSvc["ProductCloningAndCommunitiesService"]
    CloningSvc -->|Snapshot JSONB v1..vN| CP
    Member["Inquilino Miembro (/workspace/community)"] -->|3. Explora Directorio / Feed / Catálogo| CP
    Member -->|4. Clona Kit Comercial AI| AdoptFlow["adoptProduct()<br/>a) Valida cuotas SPEC-03 (productos + medios)<br/>b) Copia objetos S3 a tenants/{adopter}/...<br/>c) Inserta simples/combos en pg-cell(Miembro)<br/>d) Registra product_adoptions + policies"]
    AdoptFlow --> CP
    AdoptFlow -->|withTenantCellTransaction| CellM[("pg-cell Miembro · RLS")]
    Leader -->|5. Radar de Impacto| MetricsSvc["CommunityLeadershipMetricsService<br/>Atribución estricta source_share_id"]
    MetricsSvc -->|Consulta agregada sin PII| CellM
```

---

## 2. Modelo de Datos y Migración (`packages/domain`)

### 2.1 Cambios en `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`

1. **`admin.organizations`:**
   - Eliminar `uniqueIndex("organizations_originator_unique")` para habilitar múltiples comunidades por líder (`SPEC-15-D01`).
   - Agregar columnas:
     - `slug`: `varchar(140)` `NOT NULL` con `uniqueIndex("organizations_slug_unique")`.
     - `description`: `text`.
     - `category`: `varchar(80)`.
     - `visibility`: `varchar(24)` `NOT NULL` default `'private_invite'` (`'private_invite' | 'request_to_join'`).
     - `sharePolicy`: `varchar(24)` `NOT NULL` default `'leaders_only'` (`'leaders_only' | 'collaborative'`).
     - `requireShareApproval`: `boolean` `NOT NULL` default `true`.
     - `inviteCode`: `varchar(32)` `NOT NULL` con `uniqueIndex("organizations_invite_code_unique")`.
     - `status`: `varchar(20)` `NOT NULL` default `'active'` (`'active' | 'suspended'`).
   - Backfill seguro en migración para organizaciones previas (`slug` derivado de `id`/`name` y `invite_code` generado determinísticamente).

2. **`admin.organization_members`:**
   - Eliminar `uniqueIndex("organization_members_one_active_per_client")` para habilitar multi-comunidad (`SPEC-15-D01`).
   - Crear `uniqueIndex("organization_members_org_client_active_unique").on(organizationId, clientId).where(sql\`status = 'active'\`)` e índice `(clientId, status)` para consultas rápidas de membresías del inquilino.

3. **`admin.community_leader_authorizations` [Nueva tabla]:**
   - `id`: `uuid` PK (`uuidv7()`).
   - `clientId`: `uuid` `NOT NULL` unique FK → `admin.clients.id` (`ON DELETE CASCADE`).
   - `status`: `varchar(24)` `NOT NULL` default `'pending'` (`'pending' | 'approved' | 'rejected' | 'revoked'`).
   - `maxOwnedCommunities`: `integer` nullable (`NULL` = ilimitado cuando `status = 'approved'`; default `3` al aprobar si no se especifica).
   - `proposedCommunityName`: `varchar(180)`.
   - `businessModel`: `text` (propuesta comercial / nicho enviado por el comercio).
   - `reviewNotes`: `text` (motivo o nota de plataforma al aprobar/rechazar/revocar).
   - `requestedByUserId`: `uuid` FK → `admin.users.id` (`ON DELETE SET NULL`).
   - `requestedAt`: `timestamptz` `NOT NULL` default `now()`.
   - `reviewedByUserId`: `uuid` FK → `admin.users.id` (`ON DELETE SET NULL`).
   - `reviewedAt`: `timestamptz`.
   - `...auditColumns()`.

4. **`admin.organization_invitations`:**
   - Agregar `targetClientId`: `uuid` nullable FK → `admin.clients.id` (`ON DELETE SET NULL`) y `role`: `varchar(20)` `NOT NULL` default `'member'` (`'member' | 'co_leader'`) para soportar invitaciones directas in-app a comercios existentes además de correo/enlace.

5. **`admin.product_shares` y `admin.product_share_versions`:**
   - En `productShares`:
     - `moderationStatus`: `varchar(24)` `NOT NULL` default `'approved'` (`'approved' | 'pending_review' | 'rejected'`).
     - `moderatedByUserId`: `uuid` nullable FK → `admin.users.id` (`ON DELETE SET NULL`).
     - `moderatedAt`: `timestamptz`.
     - `rejectionReason`: `text`.
   - En `productShareVersions`:
     - `changelog`: `text` (nota de versión opcional).

### 2.2 Contrato del Snapshot Versionado (`ProductSnapshot`)

```ts
export interface ShareMediaSnapshotItem {
  sourceMediaId: string;
  contentHash: string;
  storageKey: string;
  mediaKind: "image" | "video" | "audio" | "pdf";
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  isCover: boolean;
  altText: string | null;
  sortOrder: number;
}

export interface ShareComboComponentSnapshot {
  sourceComponentProductId: string;
  quantity: number;
  sortOrder: number;
  snapshot: Omit<ProductSnapshot, "comboComponents">;
}

export interface ProductSnapshot {
  id: string;
  name: string;
  description: string;
  kind: "physical" | "digital" | "service";
  compositionType: "simple" | "combo";
  condition: "new" | "refurbished" | "used";
  category: string | null;
  brand: string | null;
  sku: string | null;
  gtin: string | null;
  currency: string;
  wholesaleCostCents: number;
  suggestedPriceCents: number;
  minResalePriceCents: number | null;
  /** Retrocompatibilidad con tests previos */
  priceCents: number;
  referenceStockQuantity: number | null;
  botMasterPrompt: string;
  attributes: Array<{ name: string; values: string[]; requiredForOrder?: boolean }>;
  media: ShareMediaSnapshotItem[];
  mediaIds?: string[];
  comboComponents?: ShareComboComponentSnapshot[];
}
```

### 2.3 Aislamiento S3 al Clonar (`SPEC-00` + `admin.media_catalog`)

- `S3StorageService` incorpora `copyObject(sourceKey, destKey, contentType)`:
  - Ejecuta `PUT /{bucket}/{destKey}` con cabecera `x-amz-copy-source: /{bucket}/{sourceKey}` firmada con SigV4; si SeaweedFS retorna error no soportado (`400`/`501`), realiza fallback seguro `getObject(sourceKey)` → `putObject(destKey, buffer, contentType)`.
- Cada binario clonado hacia `adopterClientId` se copia en `tenants/${adopterClientId}/products/${cloneProductId}/${hash12}-${uuid}.${ext}` y se registra en `admin.media_catalog` con `storagePoolId = "tenant:${adopterClientId}"` (aprovechando el índice único existente `media_catalog_hash_pool_unique` sin romper deduplicación global ni el flujo de `uploadAndAttachBinaryMedia`).
- Al borrar medios en `/workspace/products`, `deleteProductMediaAndPromote` continúa verificando únicamente `cellClientMedia` del propio `clientId` y solo borra claves bajo `tenants/${clientId}/`, por lo que líder y miembros son 100% independientes.

### 2.4 Sembrado de Planes (`community_feed`) y Eventos de Notificación (`SPEC-14`)

- Migración SQL versionada:
  - Inserta `'community_feed'` en `admin.plan_features` (`feature_type = 'boolean'`, `{ es: "Comunidad de Comercios y Catálogo Compartido", en: "Merchant Community & Shared Catalog" }`).
  - Backfill idempotente en `admin.plan_feature_values`: para todos los planes con `status = 'active'` (o existentes), inserta `('community_feed', enabled = true)` con `ON CONFLICT DO NOTHING`.
  - Inserta nuevos eventos en `admin.email_events` y sus plantillas bilingües `es`/`en` en `admin.email_templates`:
    - `community.leader_status` (aprobación/rechazo/revocación de solicitud de líder, no configurable por inquilino).
    - `community.invited` (invitación directa a comunidad, configurable por inquilino).
    - `community.product_version_published` (nueva versión de producto clonado, configurable por inquilino).
  - Expone estos eventos en `TENANT_COMPETENCE_EVENT_KEYS` y `CANONICAL_EMAIL_EVENTS`.

### 2.5 Muro Social Enriquecido, Respuestas, Fijación y Retención (`SPEC-15-D11`..`D14`)

1. **`admin.feed_posts` (extensión):**
   - `body_format`: `varchar(16)` `NOT NULL` default `'plain'` (`'plain' | 'html'`).
   - `media_id`: `uuid` nullable FK → `admin.media_catalog.id` (`ON DELETE SET NULL`).
   - `video_embed_url`: `text` nullable (URL normalizada `https://www.youtube.com/embed/...` o `https://player.vimeo.com/video/...`).
   - `is_pinned`: `boolean` `NOT NULL` default `false`.
   - `pinned_at`: `timestamptz` nullable.
   - `pinned_by_user_id`: `uuid` nullable FK → `admin.users.id` (`ON DELETE SET NULL`).
   - Índice único parcial `feed_posts_one_pinned_per_org_unique` sobre `(organization_id) WHERE is_pinned = true`.
2. **`admin.feed_post_replies` [Nueva tabla]:**
   - `id`: `uuid` PK (`uuidv7()`).
   - `post_id`: `uuid` `NOT NULL` FK → `admin.feed_posts.id` (`ON DELETE CASCADE`).
   - `organization_id`: `uuid` `NOT NULL` FK → `admin.organizations.id` (`ON DELETE CASCADE`).
   - `author_client_id`: `uuid` `NOT NULL` FK → `admin.clients.id` (`ON DELETE RESTRICT`).
   - `author_user_id`: `uuid` `NOT NULL` FK → `admin.users.id` (`ON DELETE RESTRICT`).
   - `body`: `text` `NOT NULL` (texto + emojis Unicode, máx. 1500 caracteres).
   - `...auditColumns()`.
   - Índice `feed_post_replies_post_created_idx` sobre `(post_id, created_at)`.
3. **`admin.community_platform_settings` [Nueva tabla singleton]:**
   - `id`: `varchar(32)` PK default `'default'`.
   - `feed_retention_days`: `integer` nullable default `90` (`NULL` = sin expiración; `>= 1` = días de vigencia).
   - `last_retention_purge_at`: `timestamptz` nullable.
   - `last_retention_purged_count`: `integer` `NOT NULL` default `0`.
   - `updated_at`: `timestamptz` `NOT NULL` default `now()`.
   - `updated_by_user_id`: `uuid` nullable FK → `admin.users.id` (`ON DELETE SET NULL`).
   - Seed inicial `'default'` con `feed_retention_days = 90` en migración `0045_spec15_wall_rich_media_replies_pin_retention.sql`.
4. **Flujo S3 + Cuota `storage_bytes` (`SPEC-03`):**
   - Al cargar imagen (`POST /api/tenant/community/posts/media`): valida `JPEG`/`PNG`/`WebP` por magic bytes (máx. 5 MB), verifica cuota `storage_bytes` en la celda del inquilino (`withTenantCellTransaction`), sube a SeaweedFS bajo `tenants/${clientId}/community-posts/${uuid}.${ext}`, inserta en `admin.media_catalog` (`storagePoolId = "tenant:${clientId}"`), inserta `cell_client_media` e incrementa `cell_client_usage` (`dimension = 'storage_bytes'`).
   - Al eliminar publicación (manual o por retención): borra el post (`feed_post_replies` y `feed_moderation_events` caen por `ON DELETE CASCADE`), decrementa `cell_client_usage.used_value` para `media_id` en la celda del autor y elimina el objeto en SeaweedFS + `admin.media_catalog` si quedó sin referencias.

---

## 3. Servicios de Dominio (`packages/domain/src/services/`)

1. **`communities-governance.service.ts` (`DrizzleCommunitiesGovernanceRepository`):**
   - `getLeaderStatus(clientId)`, `requestLeaderAuthorization(...)`, `reviewLeaderAuthorization(...)` (para `/admin/communities`).
   - `listOrganizationsOverview(clientId)` (mis comunidades lideradas con registro `invitations[]` y `targetClientName` normalizando `expired` al vencer, mis membresías, invitaciones pendientes vigentes del receptor, solicitudes enviadas y directorio público `visibility = 'request_to_join'`).
   - `createOrganization(...)` (verifica autorización de líder y cupo `maxOwnedCommunities`, genera `slug` e `inviteCode` únicos).
   - `updateOrganizationSettings(...)` (solo `originator`: nombre, descripción, categoría, visibilidad, `sharePolicy`, `requireShareApproval`, `moderationMode`, regenerar `inviteCode`).
   - `inviteTenant(...)` (acepta correo electrónico o slug de comercio existente; expira invitaciones vencidas previas; si ya existe una invitación `pending` vigente `expiresAt > now` para la misma comunidad/destinatario mantiene la vigente con `reusedExisting: true` sin duplicar; si no existe, crea invitación + notificación `SPEC-14`). Índices únicos parciales SQL en `admin.organization_invitations` (`WHERE status = 'pending'`) en migración `0046`.
   - `revokeInvitation(...)` (solo `originator`: marca `status = 'revoked'` en invitaciones pendientes) y `resendInvitationNotification(...)` (solo `originator`: valida vigencia/estado y reenvía notificación `community.invited` con `idempotencyKey` propia de reenvío).
   - `respondInvitation(...)`, `requestJoin(...)`, `decideJoinRequest(...)` (estrictamente solo `originator`), `promoteMemberToCoLeader(...)`, `acceptPromotion(...)`, `removeOrSuspendMember(...)`, `leaveOrganization(...)`.
2. **`product-cloning.service.ts` (`DrizzleProductCloningRepository`):**
   - `listLeaderCandidateProducts(clientId, orgId)`: lista productos propios (`sourceShareId IS NULL`) del comercio con indicador de si ya están compartidos en `orgId` y si tienen cambios pendientes respecto al snapshot vigente (`hasPendingChanges`, `pendingChangedAttributes`).
   - `publishProductShare(...)`: valida rol (`leaders_only` vs `collaborative`), valida `sourceProduct.sourceShareId === null` (`CANNOT_RESHARE_CLONED_PRODUCT`), construye snapshot completo desde la celda origen (`cell_products`, `cell_product_media`, `cell_product_bundle_items` + componentes), determina `moderationStatus`.
   - `updateShareVersionFromSourceProduct(...)`: compara producto vivo en celda origen vs último snapshot, calcula `changedAttributes`, crea `vN+1` con `changelog`, ejecuta `auto_sync` únicamente para adopciones con políticas activas en esos atributos (excluyendo `priceCents` y `stockQuantity` propios) y dispara notificación `community.product_version_published` (`SPEC-14`).
   - `moderateShare(...)`: aprueba/rechaza productos propuestos en modo colaborativo (`originator` o `co_leader`).
   - `getCommunityFeedCatalog(...)`: feed paginado, filtrable y ordenable (`SPEC-17`) con estado de adopción del comercio viewer (`alreadyAdopted`, `adoptionId`, `adoptedVersion`, `hasUpdateAvailable`), métricas de margen sugerido y vista previa del Kit Comercial AI.
   - `computeAdoptionDiff(adoptionId, clientId)`: calcula diff campo a campo entre `adoptedVersion` y `currentVersion` (con changelogs intermedios).
   - `checkAdoptionEligibility(shareId, adopterClientId, includeMediaMode)` + `adoptProduct(...)`: valida `CANNOT_ADOPT_OWN_SHARE` y evalúa **todas** las dimensiones del plan (`products`, `storage_bytes`, `images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`) acorde al `includeMediaMode` elegido. Si supera algún límite, retorna fallo `422` con `violations[]` explícitos indicando exactamente qué variable impide incorporar el producto al catálogo sin crear registros parciales; si cumple, clona atómicamente en `pg-cell-XX`, copia medios bajo `tenants/{adopterClientId}/...` en SeaweedFS, registra `product_adoptions` y `clone_sync_policies` (`autoSync = false`).
   - `syncAdoptedProduct(...)`, `updateSyncPolicies(...)`, `unlinkAdoption(...)` (desvincula conservando el producto y su historia en catálogo).
3. **`community-feed.service.ts` (`DrizzleCommunityFeedRepository`):**
   - Muro de novedades (`createPost` con `bodyFormat = 'html' | 'plain'`, sanitización estricta `sanitizeCommunityPostHtml` con auto-enlazado de URLs crudas, `resolveSafeVideoEmbedUrl`, `mediaId`, `updatePost` exclusivo del autor con ajuste de imagen/cuota y re-validación de moderación `pre`, `moderatePost`, `listFeedPosts` / `getTenantWallPosts` ordenando `is_pinned DESC, COALESCE(published_at, created_at) DESC`).
   - Medios del muro (`uploadWallPostImage`, `releaseWallMediaIfUnattached`, `getAuthorizedWallMediaBinary`) conectados a `S3StorageService` y cuota `storage_bytes` en celda del autor.
   - Fijación y borrado (`pinPost` / `unpinPost` exclusivos para moderadores reemplanzando atómicamente cualquier pin previo en la organización; `deletePost` por el autor liberando respuestas y cuota S3).
   - Respuestas (`createReply` para `tenant_owner` y `tenant_agent` miembros activos, con soporte Unicode/emojis).
   - Retención SaaS (`getRetentionSettings`, `updateRetentionSettings`, `purgeExpiredPosts` con liberación idempotente de medios y `storage_bytes`).
   - Gestión de `client_sharing_profiles` (`getSharingProfile`, `upsertSharingProfile`).
4. **`community-leadership-metrics.service.ts` (`DrizzleLeadershipMetricsRepository` + `CellDatabasePoolManager`):**
   - `getCommunityAttributedMetrics(orgId, requestingClientId, userRole, periodType)`: calcula exclusivamente adopciones activas, clones desactualizados vs al día, unidades vendidas y revenue en `cell_order_items` + `cell_orders` de las celdas adoptantes filtrando por `product_id IN cloneProductIdsOfOrg`.
5. **Integración con Planes (`admin-dashboard.service.ts` + `PlanModalDialog.tsx`):**
   - `fetchAdminPlanDetails`, `createAdminPlan` y `updateAdminPlan` leen y persisten `communityFeedEnabled` en `admin.plan_feature_values` (`feature_key = 'community_feed'`).

---

## 4. APIs REST (`apps/admin/app/api/`)

### 4.1 Portal del Inquilino (`/api/tenant/community/**` — todas envueltas en `handle()` RFC 9457)
- `GET /api/tenant/community/overview`: Estado de capacidad `community_feed`, autorización de líder, resumen de comunidades, invitaciones pendientes, conteo de actualizaciones disponibles en clones.
- `POST /api/tenant/community/leader-request`: Enviar solicitud para crear comunidades.
- `GET / POST /api/tenant/community/organizations`: Listar mis comunidades + directorio público (`request_to_join`) / Crear comunidad (si líder autorizado).
- `PATCH /api/tenant/community/organizations/[orgId]`: Editar configuración de comunidad (`originator`).
- `POST /api/tenant/community/organizations/join-by-code`: Unirse con `inviteCode`.
- `POST /api/tenant/community/organizations/[orgId]/invite`: Invitar comercio por email o slug (opcionalmente como `member` o `co_leader`), manteniendo vigente cualquier invitación pendiente no caducada.
- `POST /api/tenant/community/invitations/[id]/resend`: Reenviar notificación (`community.invited`) de una invitación pendiente vigente (`originator`).
- `DELETE /api/tenant/community/invitations/[id]`: Cancelar/revocar (`revoked`) una invitación pendiente (`originator`).
- `POST /api/tenant/community/organizations/[orgId]/request-join`: Solicitar ingreso desde el directorio.
- `POST /api/tenant/community/invitations/[id]/respond`: Aceptar / rechazar invitación.
- `POST /api/tenant/community/requests/[id]/review`: Aprobar / rechazar solicitud de ingreso (`originator`).
- `POST /api/tenant/community/organizations/[orgId]/members/[clientId]/promote`: Promover a `co_leader` (`originator`) y `POST /api/tenant/community/promotions/[id]/respond` para aceptación del promovido.
- `POST /api/tenant/community/organizations/[orgId]/leave`: Desvinculación voluntaria conservando clones.
- `GET / PUT /api/tenant/community/sharing-profile`: Consultar y actualizar perfil de privacidad del comercio.
- `GET / POST /api/tenant/community/posts`, `PATCH / DELETE /api/tenant/community/posts/[id]`, `POST /api/tenant/community/posts/[id]/moderate`, `POST / DELETE /api/tenant/community/posts/[id]/pin` y `POST /api/tenant/community/posts/[id]/replies`: Muro de novedades enriquecido, edición por autor, fijación única, eliminación y respuestas con emojis.
- `POST /api/tenant/community/posts/media`, `DELETE /api/tenant/community/posts/media/[mediaId]` y `GET /api/tenant/community/posts/media/[mediaId]`: Carga autenticada con cuota `storage_bytes`, limpieza si se descarta borrador y entrega segura desde SeaweedFS a miembros activos de la comunidad.
- `GET /api/tenant/community/feed`: Catálogo compartido paginado, filtrable y ordenable (`SPEC-17`).
- `GET / POST /api/tenant/community/shares`: Candidatos propios + historial publicado / Publicar producto simple o combo.
- `POST /api/tenant/community/shares/[shareId]/version` y `POST .../moderate`: Publicar nueva versión `vN+1` / Moderar share colaborativo.
- `GET / POST /api/tenant/community/shares/[shareId]/adopt`: Pre-validar elegibilidad contra límites del plan del adoptante (`products`, `storage_bytes`, multimedia por producto) / Clonar producto simple o combo hacia la celda del miembro devolviendo `422` con detalle explícito por variable ante cualquier exceso de cupo.
- `GET /api/tenant/community/adoptions`: Listado paginado de clones del comercio con indicadores de actualización.
- `GET /api/tenant/community/adoptions/[adoptionId]/diff`: Diff detallado `adoptedVersion → currentVersion`.
- `POST /api/tenant/community/adoptions/[adoptionId]/sync`, `PATCH .../policies`, `DELETE .../link`: Sincronizar atributos seleccionados, actualizar políticas auto-sync o desvincular.
- `GET /api/tenant/community/leadership-metrics`: Métricas con atribución estricta para `originator` / `co_leader`.

### 4.2 Consola Plataforma (`/api/admin/communities/**`)
- `GET /api/admin/communities`: Solicitudes de líder pendientes/históricas, listado de comercios con cupo de líder, directorio completo de comunidades SaaS y configuración vigente de retención (`feedRetentionDays`, última purga).
- `POST /api/admin/communities`: Aprobar/rechazar solicitud, otorgar/modificar/revocar autorización directa de líder a un `clientId`, suspender/reactivar una comunidad, actualizar `feedRetentionDays` (`update_retention_settings`) o disparar la purga de publicaciones expiradas (`run_retention_purge`).

---

## 5. Diseño UI/UX (`apps/admin`)

- **`/workspace/community`:**
  - Contenedor raíz `w-full space-y-6 p-4 md:px-8 md:py-6`, header canónico (`--dsn-accent` y `--dsn-surface`), 100% i18n `es`/`en`, Title Case sin `uppercase`, Mobile First sin códigos de spec visibles:
  1. **Catálogo Compartido (Explorar y Clonar):** Filtros por comunidad, categoría, búsqueda, ordenamiento; tarjetas/tabla con miniatura, badge «Ya Clonado» / «Combo», costo mayorista, precio sugerido, stock referencial, vista previa del **Kit Comercial AI** (Prompt Maestro + atributos + multimedia + componentes) y **Modal de Clonación Rápida** con simulador de margen en tiempo real, stock inicial y selector de medios compatibles con su plan.
  2. **Mis Productos Clonados:** Tabla estándar con estado de versión (`Sincronizado v1`, `Actualización Disponible v2`, `Desvinculado`), botón **«Revisar Cambios»** (abre modal de **Diff Visual campo a campo** + changelog para aplicar selectivamente sin riesgo sobre precio/stock), configuración de auto-sync por atributo y desvinculación vía `ConfirmationModal`.
  3. **Muro De Novedades:** Compositor visual WYSIWYG limpio (negrita, cursiva, subrayado, título, listas, alineaciones izq/centro/der, enlaces con texto opcional o URL cruda auto-enlazada preservando la selección, video YouTube/Vimeo, «Mejorar con AI» y carga de 1 imagen destacada en contenedor proporcionado `object-contain` con visor lightbox), badge y orden prioritario para publicación fijada (con acción fijar/desfijar para `originator`/`co_leader`), botones de editar y eliminar publicación (`ConfirmationModal`) para el autor, hilo de respuestas con texto y selector de emojis, cola de moderación visible para `originator` y `co_leader`, y panel de **Privacidad En Comunidad**.
  4. **Mis Comunidades Y Directorio:** Comunidades activas, invitación rápida por correo/slug y botón de copiar enlace/código de invitación, registro de **Invitaciones Enviadas** del líder (`originator`) con estado (`Pendiente`/`Aceptada`/`Rechazada`/`Cancelada`/`Expirada`), fechas y acciones para **Reenviar Notificación** o **Cancelar Invitación** (`ConfirmationModal`), directorio descubrible para solicitar ingreso, gestión de miembros y promociones a co-líder.
  5. **Liderazgo Y Radar De Impacto:** Estado de autorización de Líder (o CTA «Solicitar Crear Comunidad»), creación/configuración de comunidad, selector de productos propios con detector **«Cambios Pendientes Por Publicar»** y tablero de métricas atribuidas (adopciones activas, unidades vendidas, revenue atribuido, top productos y top adoptantes).
- **`/workspace/products`:** Badge sutil «Importado De Comunidad» (y aviso si hay nueva versión disponible en `/workspace/community`) + deshabilitación informativa de re-compartición en cadena.
- **`/admin/communities` y `/admin/plans`:** Gestión de solicitudes/cuotas de Líder, configuración de retención de publicaciones del muro + botón de purga manual, y toggle «Comunidad De Comercios» en el editor de planes.

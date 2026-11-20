# SPEC-15 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Esquema Drizzle, migración versionada y seeds (`packages/domain`)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`, `packages/domain/src/services/notifications-and-leads.service.ts`, `packages/domain/src/services/notification-dispatcher.service.ts`, `packages/domain/src/services/admin-dashboard.service.ts`, nueva migración SQL `packages/domain/drizzle/0043_spec15_communities_and_cloning.sql` (y snapshot/journal Drizzle).
  - **Detalle:**
    - Habilitar multi-comunidad total removiendo restricciones únicas de 1 comunidad por originador/miembro y agregando índice único `(organization_id, client_id) WHERE status = 'active'`.
    - Extender `admin.organizations` (`slug`, `description`, `category`, `visibility`, `share_policy`, `require_share_approval`, `invite_code`, `status`), `admin.organization_invitations` (`target_client_id`, `role`), `admin.product_shares` (`moderation_status`, `moderated_by_user_id`, `moderated_at`, `rejection_reason`), `admin.product_share_versions` (`changelog`).
    - Crear tabla `admin.community_leader_authorizations` con `COMMENT ON TABLE`, `COMMENT ON COLUMN` y `GRANT` adecuados (`AGENTS.md §4.5`).
    - Sembrar `community_feed` en `admin.plan_features` con `enabled = true` para los planes activos existentes y agregar nuevos eventos de notificación comunitaria (`community.leader_status`, `community.invited`, `community.product_version_published`) con plantillas bilingües `es`/`en`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [x] **T-02 · S3 copyObject, repositorios Drizzle reales y servicios de dominio completos (`packages/domain`)**
  - **Archivos:** `packages/domain/src/services/s3-storage.service.ts`, `packages/domain/src/services/communities-governance.service.ts`, `packages/domain/src/services/product-cloning.service.ts`, `packages/domain/src/services/community-feed.service.ts`, `packages/domain/src/services/community-leadership-metrics.service.ts`, `packages/domain/src/services/admin-dashboard.service.ts`, `packages/domain/src/services/tenant-products-and-media.service.ts` y pruebas unitarias correspondientes.
  - **Detalle:**
    - Implementar `S3StorageService.copyObject` con fallback `getObject` → `putObject`.
    - Implementar repositorios Drizzle reales y factories singleton (`getCommunitiesGovernanceService`, `getProductCloningService`, `getCommunityFeedService`, `getCommunityLeadershipMetricsService`) exportados en `packages/domain/src/index.ts`.
    - Soportar compartición/clonación de productos **simples y combos** con validación atómica de cuotas (`SPEC-03`), copia S3 independiente bajo `tenants/{adopterClientId}/...` (`SPEC-00`), detección de cambios pendientes, diff `vA → vB`, sync selectivo protegiendo precio/stock propio, muro con moderación `pre`/`post`/`none`, privacidad `client_sharing_profiles` y métricas con atribución estricta vía `CellDatabasePoolManager`.
    - Cablear `community_feed` en `createAdminPlan`, `updateAdminPlan` y `fetchAdminPlanDetails`.
    - Conectar `NotificationDispatcherService` (`SPEC-14`) en los eventos clave de comunidad.
  - **Verificación:** `pnpm --filter @mocter/domain test`.

- [x] **T-03 · Route Handlers REST `/api/tenant/community/**` y `/api/admin/communities/**` (`apps/admin`)**
  - **Archivos:** `apps/admin/app/api/tenant/community/**`, `apps/admin/app/api/admin/communities/**`, `apps/admin/app/api/admin/plans/route.ts`, y suite de pruebas `apps/admin/app/api/tenant/spec15-community-routes.test.ts`.
  - **Detalle:**
    - Implementar todos los endpoints definidos en `design.md §4` envueltos en `handle()` RFC 9457, validación Zod estricta, control de sesión (`resolveTenantSession` / sesión plataforma), gating por capacidad `community_feed` y RBAC por rol de comercio (`tenant_owner` vs `tenant_agent`) y rol de comunidad (`originator`, `co_leader`, `member`).
    - Agregar logs estructurados Pino y disparo no bloqueante de notificaciones vía `after()`.
  - **Verificación:** `pnpm --filter @mocter/admin test spec15-community-routes`.

- [x] **T-04 · Diccionarios i18n (`es`/`en`), Editor de Planes, Consola `/admin/communities` y Workspace `/workspace/community` (`apps/admin`)**
  - **Archivos:** `apps/admin/lib/i18n.ts`, `apps/admin/app/admin/plans/plan-modal-dialog.tsx`, `apps/admin/components/admin-shell.tsx`, `apps/admin/app/admin/communities/**` [Nuevos], `apps/admin/app/workspace/community/**`, `apps/admin/app/workspace/products/**`, pruebas de UI `workspace-views.test.tsx` e `i18n-parity.test.ts` (si existe).
  - **Detalle:**
    - Añadir paridad 100% `es`/`en` en `apps/admin/lib/i18n.ts` para todo el módulo de comunidades (tenant + admin).
    - Exponer el interruptor `community_feed` en la pestaña «Capacidades Opcionales» de `PlanModalDialog.tsx`.
    - Construir `/admin/communities` en `AdminShell.tsx` para revisión de solicitudes de líder, otorgamiento/revocación de cupo y supervisión de comunidades.
    - Reemplazar el placeholder de `/workspace/community` con la experiencia completa Mobile First en Title Case, `--dsn-*`, layout `w-full space-y-6 p-4 md:px-8 md:py-6`, tablas estándar y `ConfirmationModal` (`--dsn-*`), incluyendo simulador de margen al clonar y visor de Diff `vN → vN+1`.
    - Mostrar indicador discreto de producto importado / actualización disponible en `/workspace/products`.
  - **Verificación:** `pnpm --filter @mocter/admin test`.

- [x] **T-05 · Verificación integral y protocolo `AGENTS.md §4.18`**
  - **Comandos:**
    - `pnpm --filter @mocter/domain exec drizzle-kit check`
    - `pnpm lint`
    - `pnpm test`
    - Build (`pnpm --filter @mocter/admin build` o compilación), aplicar migración en PostgreSQL si está activo en desarrollo, reiniciar `mocter-core-admin-portal-1` y verificar HTTP 200 en `/workspace/community` y `/admin/communities` sin errores en logs.

- [x] **T-06 · Esquema Drizzle, migración `0045` y sanitización HTML/Video (`packages/domain`)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`, `packages/domain/drizzle/0045_spec15_wall_rich_media_replies_pin_retention.sql` (+ snapshot/journal Drizzle), `packages/domain/src/utils/community-html.ts` [Nuevo], `packages/domain/src/services/ai-assist-catalog.seed.ts`.
  - **Detalle:**
    - Extender `admin.feed_posts` (`body_format`, `media_id`, `video_embed_url`, `is_pinned`, `pinned_at`, `pinned_by_user_id` + índice único parcial `(organization_id) WHERE is_pinned = true`).
    - Crear `admin.feed_post_replies` (`ON DELETE CASCADE` desde `feed_posts`) y `admin.community_platform_settings` (seed `'default'` con `feed_retention_days = 90`) con `COMMENT ON TABLE` / `COMMENT ON COLUMN` (`AGENTS.md §4.5`).
    - Implementar `sanitizeCommunityPostHtml` y `resolveSafeVideoEmbedUrl` (YouTube/Vimeo whitelist), más prompt maestro `community.wall_post` para «Mejorar con AI» (`AGENTS.md §4.7`).
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [x] **T-07 · Servicios de dominio para medios con cuota `storage_bytes`, pin, respuestas y retención (`packages/domain`)**
  - **Archivos:** `packages/domain/src/services/community-feed.service.ts`, `packages/domain/src/services/communities-governance.service.ts`, `packages/domain/src/services/community-feed.service.test.ts` (o suite unitaria correspondiente).
  - **Detalle:**
    - Carga/descarga/liberación de 1 imagen destacada en SeaweedFS + `admin.media_catalog` contabilizando y descontando `storage_bytes` en `cell_client_media` / `cell_client_usage` del inquilino autor.
    - Ordenamiento `is_pinned DESC, COALESCE(published_at, created_at) DESC`, fijación/desfijación atómica de 1 solo post por comunidad, respuestas con texto/emojis, eliminación manual por autor y purga idempotente por `feed_retention_days` con liberación de cuota y S3.
    - Exponer lectura/actualización de retención y resumen en `CommunitiesGovernanceService.getAdminOverview` / `updateRetentionSettings` / `runRetentionPurge`.
  - **Verificación:** `pnpm --filter @mocter/domain test`.

- [x] **T-08 · Route Handlers REST del muro enriquecido, medios, pin, respuestas y retención (`apps/admin`)**
  - **Archivos:** `apps/admin/app/api/tenant/community/posts/route.ts`, `apps/admin/app/api/tenant/community/posts/[id]/route.ts`, `.../pin/route.ts`, `.../replies/route.ts`, `.../media/route.ts`, `.../media/[mediaId]/route.ts`, `apps/admin/app/api/admin/communities/route.ts`, pruebas `spec15-community-routes.test.ts` y `apps/admin/app/api/admin/communities/route.test.ts`.
  - **Detalle:** Validar Zod, RBAC (`tenant_owner` para publicar/eliminar; `originator`/`co_leader` para fijar/moderar; `tenant_owner` y `tenant_agent` miembros activos para responder y ver media; `platform_admin` para retención y purga) con `handle()` RFC 9457.
  - **Verificación:** `pnpm --filter @mocter/admin test`.

- [x] **T-09 · UI Social del Muro (`CommunityPostEditor`, tarjetas, lightbox, pin, respuestas + emojis) y Retención SaaS (`/admin/communities`)**
  - **Archivos:** `apps/admin/components/community-post-editor.tsx` [Nuevo], `apps/admin/app/workspace/community/community-wall-tab.tsx`, `apps/admin/app/admin/communities/communities-admin-view.tsx`, `apps/admin/lib/i18n.ts`, pruebas de UI.
  - **Detalle:**
    - Editor WYSIWYG limpio (sin HTML crudo) con Negrita, Cursiva, Subrayado, Título, Listas, Alineación (izq/centro/der), Enlaces, Video por link, «Mejorar con AI» y carga drag-and-drop de 1 imagen destacada.
    - Tarjetas tipo red social con contenido sanitizado, video embed seguro, imagen con lightbox, badge de publicación fijada, acciones fijar/desfijar y eliminar (`ConfirmationModal`), e hilo de respuestas con selector rápido de emojis.
    - Sección en `/admin/communities` para parametrizar `feedRetentionDays` y ejecutar purga manual.
  - **Verificación:** `pnpm --filter @mocter/admin test`, `eslint` y `tsc --noEmit`.

- [x] **T-10 · Migración en caliente, builds y protocolo `AGENTS.md §4.18`**
  - **Detalle:** Aplicar migración `0045` en PostgreSQL local, compilar `@mocter/admin` y `@mocter/web`, reiniciar `admin-portal` y `web-portal`, y verificar HTTP 200 + logs limpios.

- [x] **T-11 · Refinamiento del muro: contención de imagen, edición de publicación y enlaces duales (`SPEC-15-D11`, `D14`)**
  - **Archivos:** `packages/domain/src/utils/community-html.ts`, `packages/domain/src/services/community-feed.service.ts`, `apps/admin/app/api/tenant/community/posts/[id]/route.ts`, `apps/admin/components/community-post-editor.tsx`, `apps/admin/app/workspace/community/community-wall-tab.tsx`, `apps/admin/lib/i18n/{es,en}.json` y pruebas.
  - **Detalle:**
    - Acotar el tamaño visual de las imágenes con `object-contain` (sin recortes ni desbordamientos) en tarjetas del muro y vista previa del editor.
    - Habilitar `PATCH /api/tenant/community/posts/[id]` y diálogo de edición para el autor (texto enriquecido, enlaces, video e imagen con liberación de `storage_bytes` al reemplazar/retirar).
    - Corregir inserción de enlaces preservando la selección del editor (texto vinculado opcional o URL cruda) y auto-enlazar URLs `http(s)://` crudas al sanitizar.
  - **Verificación:** `pnpm --filter @mocter/domain test`, `pnpm --filter @mocter/admin test`, `eslint`, `tsc --noEmit`, builds y protocolo `AGENTS.md §4.18`.

- [x] **T-12 · Unicidad de invitaciones vigentes, expiración automática y registro del líder (`RN-SPEC-15-13`)**
  - **Archivos:** `packages/domain/src/db/schemas/admin/communities-and-cloning.ts`, migración SQL `0046_spec15_unique_pending_invitations.sql`, `packages/domain/src/services/communities-governance.service.ts`, `apps/admin/app/api/tenant/community/invitations/[id]/route.ts`, `apps/admin/app/api/tenant/community/invitations/[id]/resend/route.ts`, `apps/admin/app/workspace/community/community-network-tab.tsx`, `apps/admin/lib/i18n/{es,en}.json` y pruebas.
  - **Detalle:**
    - Expirar invitaciones pendientes vencidas (`expiresAt <= now`) y conservar la invitación pendiente vigente sin duplicar cuando el líder vuelve a invitar al mismo comercio/email en la misma comunidad.
    - Agregar migración `0046` para limpiar duplicados pendientes previos y blindar PostgreSQL mediante índices únicos parciales (`WHERE status = 'pending'`).
    - Exponer al líder (`originator`) el registro **Invitaciones Enviadas** (con estado y vencimiento) y acciones **Reenviar Notificación** (`POST .../resend`) y **Cancelar Invitación** (`DELETE .../invitations/[id]` vía `ConfirmationModal`).
  - **Verificación:** `drizzle-kit check`, migración `0046` aplicada en local, pruebas de dominio y API/UI, `eslint`, `tsc --noEmit`, builds y protocolo `AGENTS.md §4.18`.

- [x] **T-13 · Cierre automático de modal de clonación y validación explícita de capacidades del plan (`RN-SPEC-15-04`)**
  - **Archivos:** `packages/domain/src/services/product-cloning-store.ts`, `packages/domain/src/services/product-cloning.service.ts`, `apps/admin/app/api/tenant/community/_shared.ts`, `apps/admin/app/api/tenant/community/shares/[shareId]/adopt/route.ts`, `apps/admin/app/workspace/community/community-feed-tab.tsx`, `apps/admin/lib/i18n/{es,en}.json` y pruebas.
  - **Detalle:**
    - Cerrar automáticamente el modal «Clonar Producto a Tu Catálogo» inmediatamente al completar una clonación exitosa y mostrar errores inline dentro del modal cuando falle (nunca ocultos detrás del backdrop).
    - Evaluar explícitamente `products`, `storage_bytes`, `images_per_product`, `videos_per_product`, `audios_per_product` y `pdfs_per_product` en `GET / POST /api/tenant/community/shares/[shareId]/adopt` acorde a `includeMediaMode`, bloqueando antes de crear registros si supera cualquier límite e informando visualmente qué variable exacta del plan impide incorporar el producto.
  - **Verificación:** pruebas unitarias de dominio y API/UI, `eslint`, `tsc --noEmit`, builds limpios y verificación en caliente (`AGENTS.md §4.18`).

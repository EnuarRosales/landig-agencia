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

# SPEC-03 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender `PLAN_DIMENSION_KEYS` con `audios_per_product` y generar migración + backfill**
  - **Archivos:** `packages/domain/src/db/schemas/admin/plan-catalogs.ts`, `packages/domain/drizzle/*` [Nueva migración].
  - **Detalle:** Agregar `"audios_per_product"` al catálogo de dimensiones, documentar con `.comment()` / TSDoc y crear migración SQL que asegure fila en `admin.plan_dimensions` y registro backfill en `admin.plan_limits` para planes existentes.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y `db:migrate` en local sin errores.

- [ ] **T-02 · Actualizar validadores y API `/api/admin/plans` + Modal UI `/admin/plans`**
  - **Archivos:** `packages/domain/src/services/admin-plans.service.ts` (o servicio de planes usado por `/api/admin/plans`), `packages/domain/src/services/admin-plans.service.test.ts`, `apps/admin/app/api/admin/plans/route.ts`, `apps/admin/app/admin/plans/plan-modal-dialog.tsx`.
  - **Detalle:** Exigir `audios_per_product` en creación/edición de planes, hidratarlo en edición y agregar el campo en Title Case «Pistas De Audio Por Producto» dentro de la pestaña de catálogo en `plan-modal-dialog.tsx`.
  - **Verificación:** `pnpm --filter @mocter/domain test admin-plans` y `apps/admin/app/api/admin/plans/route.test.ts`.

- [ ] **T-03 · Corregir bugs de `Date` en SQL y `limitMode` en `TenantCapabilityGateService` y `TenantProductsAndMediaService`**
  - **Archivos:** `packages/domain/src/services/tenant-capability-gate.service.ts`, `packages/domain/src/services/tenant-capability-gate.service.test.ts`, `packages/domain/src/services/tenant-products-and-media.service.ts`, `packages/domain/src/services/tenant-products-and-media.service.test.ts`.
  - **Detalle:** Sustituir `new Date()` dentro de `sql\`...\`` por predicados Drizzle nativos (`lte`, `gt`, `isNull`); corregir `limitRow.limitMode` → `limitRow.mode`; filtrar `countProductMediaByKind` por `kind` exacto e incorporar `maxAudiosPerProduct`.
  - **Verificación:** Pruebas unitarias con casos de overrides vigentes, overrides vencidos y conteo independiente por cada tipo (`image`, `video`, `audio`, `pdf`).

- [ ] **T-04 · Unificar `TenantWorkspaceService.getWorkspaceBilling()` con capacidades reales y uso en celda**
  - **Archivos:** `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/services/tenant-workspace.service.test.ts`, `apps/admin/app/api/tenant/billing/route.ts`.
  - **Detalle:** Consultar consumo real en `pg-cell-XX` (`products`, `contacts`, `tenant_users`, `storage_used_bytes`) y fusionar con `TenantCapabilityGateService` para exponer todas las cuotas numéricas y capacidades Chatwoot reales.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-workspace`.

- [ ] **T-05 · Exponer resumen de cuotas de catálogo en endpoint de Onboarding**
  - **Archivos:** `packages/domain/src/services/tenant-onboarding.service.ts`, `apps/admin/app/api/tenant/onboarding/route.ts`, `apps/admin/app/api/tenant/onboarding/route.test.ts`.
  - **Detalle:** Incluir `catalogLimits` (`products`, `images_per_product`, `videos_per_product`, `audios_per_product`, `pdfs_per_product`) por plan seleccionado para renderizar el banner informativo en Paso 3 (`ONB-09`).
  - **Verificación:** `pnpm test onboarding`.

- [ ] **T-06 · Rediseñar vista de límites y capacidades en `/workspace/billing` + banner compartido `<CatalogQuotaBanner />`**
  - **Archivos:** `apps/admin/app/workspace/billing/billing-view.tsx`, `apps/admin/components/catalog-quota-banner.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Mostrar barras de consumo real vs tope, límites por producto (incluyendo audios) y matriz humanizada de capacidades Chatwoot. Prohibido mostrar códigos de especificación o nombres de tabla. Labels en Title Case, diseño Mobile First.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-07 · Verificación integral y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `pnpm --filter @mocter/domain exec drizzle-kit check`, build/restart de servicios Docker afectados y comprobación HTTP 200 en `/admin/plans` y `/workspace/billing`.


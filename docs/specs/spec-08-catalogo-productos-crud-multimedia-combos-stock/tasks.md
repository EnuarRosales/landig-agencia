# SPEC-08 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender esquema de celda para productos, combos, `is_cover` y stock**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`, migración de esquema de celda + script en `cell-migration.service.ts`.
  - **Detalle:** Agregar `costPriceCents`, `compositionType`, `botMasterPrompt` (`TEXT`), `stockQuantity`, `minStockThreshold`, `lowStockAlertSentAt`, `deletedAt`, tabla `cellProductBundleItems` e `isCover` en `cellProductMedia` con índice único parcial.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y test de migración de celda.

- [ ] **T-02 · Implementar CRUD completo, combos, cover y evaluador de stock mínimo en `TenantProductsAndMediaService`**
  - **Archivos:** `packages/domain/src/services/tenant-products-and-media.service.ts`, `packages/domain/src/services/tenant-products-and-media.service.test.ts`.
  - **Detalle:** Soportar ficha detalle (`getProductDetail`), validación de cuotas por tipo incluyendo `audios_per_product` (`SPEC-03`), combos sin ciclos ni borrado de componente en uso, promoción automática de portada (`is_cover`) y alerta única por correo al alcanzar `stock <= min_stock_threshold`.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-products-and-media`.

- [ ] **T-03 · Completar APIs `/api/tenant/products*` incluyendo `GET` detalle, `PATCH status` y gestión de portada**
  - **Archivos:** `apps/admin/app/api/tenant/products/route.ts`, `apps/admin/app/api/tenant/products/[id]/route.ts`, `apps/admin/app/api/tenant/products/[id]/status/route.ts` [Nuevo], `apps/admin/app/api/tenant/products/[id]/media/[mediaId]/cover/route.ts` [Nuevo], `apps/admin/app/api/tenant/products/[id]/media/[mediaId]/route.ts` [Nuevo], tests en `tenant-routes.test.ts`.
  - **Detalle:** Envolver en `handle()` RFC 9457 (eliminar filtración de `detail: msg`), validar con Zod (prompt hasta 32k chars, atributos, combos), exigir autenticación y aislamiento estricto por `clientId`.
  - **Verificación:** Pruebas de integración de rutas HTTP (`200`, `400`, `404`, `409`, `422`).

- [ ] **T-04 · Construir UI completa de Productos (`/workspace/products`)**
  - **Archivos:** `apps/admin/app/workspace/products/products-view.tsx`, `product-detail-modal.tsx` [Nuevo], `product-form-modal.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Tabla paginada/ordenable/filtrable Mobile First, modal Ver completo, formulario Crear/Editar con 5 secciones (Precios/Utilidad, Stock Físico, Atributos Dinámicos/Combo, Multimedia con selector de Foto Principal, Prompt Maestro con guía + AI real), y modales `--dsn-*` para Inactivar/Activar/Eliminar.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, prueba de carga de imagen/audio/PDF real en `/workspace/products`.


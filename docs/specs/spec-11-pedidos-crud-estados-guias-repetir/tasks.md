# SPEC-11 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Actualizar `orders.ts` a 12 estados homologados y crear migración SQL de celda**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/orders.ts`, migración de esquema de celdas (`drizzle-cell`).
  - **Detalle:** Declarar los 12 estados, conservar `prospectId` (FK opcional a `cell_contacts` + alias `contactId`), agregar `contactAddressId`, `stockDeducted`, `guideGeneratedAt`, `cancellationReason`, `issueNotes`, `repeatedFromOrderId`, `externalErpSystem`, `externalErpReference`, `selectedAttributes` y `unitCostCents`. Actualizar índice `orders_cw_conversation_active_unique` y migrar datos `'registered' -> 'pending_confirmation'` y `'shipped' -> 'dispatched'` con comentarios SQL y FORCE RLS.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check --config=drizzle.cell.config.ts`.

- [x] **T-02 · Implementar máquina de 12 estados, stock idempotente, `repeatOrder`, `OrderGuideRendererService` y `TenantOrdersService`**
  - **Archivos:** `packages/domain/src/services/orders.service.ts`, `packages/domain/src/services/tenant-orders.service.ts` [Nuevo], `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/repositories/drizzle-orders.repository.ts`, `packages/domain/src/services/order-guide-renderer.service.ts` [Nuevo], `packages/domain/src/services/orders.service.test.ts`.
  - **Detalle:** Grafo flexible operativo de 12 estados, bloqueo de edición post-despacho, descuento/restitución atómica con `SELECT ... FOR UPDATE` (estricto `in_stock`, acotado `preorder`/`backorder`, combos y deltas en `PUT`), alerta mínima `SPEC-08`, RBAC `tenant_owner` en cancelación pagada, hook de plantillas `SPEC-10`, clonación con precios vigentes en `repeatOrder`, renderizador HTML + PDF binario puro con QR ISO 18004, y unificación de `TenantWorkspaceService` hacia `OrdersService`.
  - **Verificación:** `pnpm --filter @mocter/domain test orders`.

- [x] **T-03 · Completar endpoints `/api/tenant/orders*` (`GET`, `PUT`, `PATCH`, `repeat`, `guide`)**
  - **Archivos:** `apps/admin/app/api/tenant/orders/route.ts`, `apps/admin/app/api/tenant/orders/[id]/route.ts`, `apps/admin/app/api/tenant/orders/[id]/repeat/route.ts` [Nuevo], `apps/admin/app/api/tenant/orders/[id]/guide/route.ts` [Nuevo].
  - **Detalle:** Envolver en `handle()` RFC 9457 (eliminar `detail: msg`), validar con Zod y garantizar aislamiento estricto por `clientId`.
  - **Verificación:** Pruebas de integración HTTP (`tenant-routes.test.ts`).

- [x] **T-04 · Construir UI completa de Pedidos (`/workspace/orders`)**
  - **Archivos:** `apps/admin/app/workspace/orders/orders-view.tsx`, `order-detail-modal.tsx` [Nuevo], `order-form-modal.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Tabla paginada/filtrable Mobile First con los 12 estados traducidos, modal Ver completo con timeline, formulario Crear/Editar conectado a CRM direcciones + atributos + canales de pago, botón Repetir Pedido, vista/descarga de Guía Imprimible y modales `--dsn-*` para cambios de estado/cancelación.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `corepack pnpm --filter @mocter/domain test`, `corepack pnpm --filter @mocter/admin test`, `drizzle-kit check --config=drizzle.cell.config.ts`, `drizzle-kit check`, reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP 200 en `/api/health`, `/es/login?return_to=%2Fworkspace%2Forders` y `/es`.


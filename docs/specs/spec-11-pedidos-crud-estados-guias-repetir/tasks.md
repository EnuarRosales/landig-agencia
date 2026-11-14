# SPEC-11 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Actualizar `orders.ts` a 12 estados homologados y crear migración SQL de celda**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/orders.ts`, migración de esquema de celdas.
  - **Detalle:** Declarar los 12 estados, agregar `contactAddressId`, `paymentChannelId`, `stockDeducted`, `guideGeneratedAt`, `repeatedFromOrderId`, `selectedAttributes` y `unitCostCents`. Incluir migración de datos `'registered' -> 'pending_confirmation'` y `'shipped' -> 'dispatched'`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar máquina de 12 estados, stock idempotente, `repeatOrder` y `OrderGuideRendererService`**
  - **Archivos:** `packages/domain/src/services/orders.service.ts`, `packages/domain/src/services/orders.service.test.ts`, `packages/domain/src/services/order-guide-renderer.service.ts` [Nuevo].
  - **Detalle:** Transiciones controladas, bloqueo de edición post-despacho, descuento/restitución atómica de stock con disparo de alerta mínima (`SPEC-08`), clonación con precios vigentes en `repeatOrder` y renderizador de guías `10x15` / `Carta`.
  - **Verificación:** `pnpm --filter @mocter/domain test orders`.

- [ ] **T-03 · Completar endpoints `/api/tenant/orders*` (`GET`, `PUT`, `PATCH`, `repeat`, `guide`)**
  - **Archivos:** `apps/admin/app/api/tenant/orders/route.ts`, `apps/admin/app/api/tenant/orders/[id]/route.ts`, `apps/admin/app/api/tenant/orders/[id]/repeat/route.ts` [Nuevo], `apps/admin/app/api/tenant/orders/[id]/guide/route.ts` [Nuevo].
  - **Detalle:** Envolver en `handle()` RFC 9457 (eliminar `detail: msg`), validar con Zod y garantizar aislamiento estricto por `clientId`.
  - **Verificación:** Pruebas de integración HTTP (`tenant-routes.test.ts`).

- [ ] **T-04 · Construir UI completa de Pedidos (`/workspace/orders`)**
  - **Archivos:** `apps/admin/app/workspace/orders/orders-view.tsx`, `order-detail-modal.tsx` [Nuevo], `order-form-modal.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Tabla paginada/filtrable Mobile First con los 12 estados traducidos, modal Ver completo con timeline, formulario Crear/Editar conectado a CRM direcciones + atributos + canales de pago, botón Repetir Pedido, vista/descarga de Guía Imprimible y modales `--dsn-*` para cambios de estado/cancelación.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/orders`.


# SPEC-18 · Plan de Tareas · Central de Promociones y Descuentos Comerciales Automáticos

- [x] **T-00 · Desacople del atributo estático «Precio Promocional (Opcional)» en `SPEC-08` y regla transversal `AGENTS.md §4.19`**
  - Retirar el input manual estático «Precio Promocional (Opcional)» de `apps/admin/app/workspace/products/product-form-modal.tsx`, conservando `sale_price_cents` en BD por compatibilidad.
  - Corregir en `apps/admin/app/workspace/products/products-view.tsx` el espaciado perimetral (`w-full space-y-6 p-4 md:px-8 md:py-6`), los estilos canónicos de los botones «Actualizar» y «Registrar Nuevo Producto» (`--dsn-accent` / `--dsn-surface`) y el cierre automático del modal al guardar (`handleFormSaved`).
  - Crear la regla permanente `.agents/rules/rules-for-backoffice-layout-and-ui-styles.md` y registrarla en `.agents/AGENTS.md` (§4.19).
  - **Verificación:** `vitest` en `apps/admin/app/workspace/workspace-views.test.tsx`, `next build` y chequeo HTTP 200 en contenedor `mocter-core-admin-portal-1`.

- [x] **T-01 · Esquema Drizzle y migraciones SQL de celda para `admin.promotions`, `admin.promotion_targets` y trazabilidad en pedidos (`D-05`, `D-08`, `D-09`)**
  - Crear `packages/domain/src/db/schemas/tenant/promotions.ts` con PK compuesta `(client_id, id)` (`uuidv7()`), FK compuestas `(client_id, promotion_id)` y `(client_id, product_id)`, `discount_value` en `BIGINT`, `auditColumns()`, soft delete (`deleted_at`, `deleted_by`), `CHECK` constraints e índices.
  - Extender `packages/domain/src/db/schemas/tenant/orders.ts` con `promotion_quota_deducted` en `admin.orders` y `promotion_id`, `promotion_name`, `original_unit_price_cents` en `admin.order_items`.
  - Generar migración SQL en `packages/domain/drizzle-cell/` + RLS (`app.current_client_id`), `GRANT` para `mocter_app` y `COMMENT ON TABLE/COLUMN` obligatorios (`AGENTS.md §4.5`).
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check --config=drizzle.cell.config.ts` y tests de esquema.

- [x] **T-02 · Motor `PromotionResolutionEngine`, servicio `TenantPromotionsService`, seed AI `promotion.description` e integraciones en `@mocter/domain`**
  - Implementar motor puro `PromotionResolutionEngine` (exclusión preventiva en `fixed_amount` cuando `priceCents <= discountValue` `D-06`, prioridad sin acumulación `Producto > Categoría > Todo el Catálogo`, cálculo de estado derivado y semáforo de margen).
  - Implementar `TenantPromotionsService` (CRUD con soft delete `D-08`, filtros/paginación, simulación de productos alcanzados/excluidos y métricas KPI).
  - Registrar `promotion.description` en `ai-assist-catalog.seed.ts` bajo metodología `IDEAL` (`D-09`).
  - Integrar la resolución automática de promociones activas en `TenantProductsAndMediaService.listCatalog` / `getProductDetail`, en `PromptComposer` (`BOT-002` con regla de no acumulación frente a `tiers` `D-07`) y en `OrdersService` / `DrizzleOrdersRepository` (snapshot en `order_items` y consumo/restitución idempotente de cupo `D-05`).
  - **Verificación:** `pnpm --filter @mocter/domain test` con pruebas unitarias de colisión, exclusión `fixed_amount`, vigencia horaria, no acumulación con `tiers`, soft delete y agotamiento/restitución de cupo.

- [x] **T-03 · Route Handlers HTTP `/api/tenant/promotions/*` en `apps/admin`**
  - Crear `GET`/`POST /api/tenant/promotions`, `GET`/`PUT`/`DELETE /api/tenant/promotions/[id]` y `PATCH /api/tenant/promotions/[id]/status` con validación Zod, `handle()` RFC 9457, logging estructurado (`AGENTS.md §4.13`) y RBAC (`DELETE` soft-delete exclusivo para `tenant_owner`).
  - **Verificación:** Suite Vitest de rutas `/api/tenant/promotions`.

- [x] **T-04 · Interfaz `/workspace/promotions`, navegación lateral e indicadores directos en `/workspace/products`**
  - Agregar el ítem «Promociones y Ofertas» (`/workspace/promotions`) en `TenantWorkspaceShell` debajo de «Productos y Catálogo» y sus claves i18n `es`/`en` en Title Case (`AGENTS.md §4.6, §4.8, §4.15`).
  - Construir `PromotionsView` y `PromotionFormModal` con los componentes vigentes de `apps/admin` (`WorkspaceDataTable`, `ConfirmationModal`, `AiEnhanceTextarea` con `promotion.description`), respetando `AGENTS.md §4.19` (`w-full space-y-6 p-4 md:px-8 md:py-6`, botones canónicos, cierre automático al guardar, semáforo de rentabilidad y alerta de productos excluidos `D-06`).
  - Mostrar el badge de campaña activa, precio regular tachado, `% OFF`, vigencia y margen recalculado en cada fila de `/workspace/products`.
  - **Verificación:** `vitest` de vistas, `next build` y protocolo `AGENTS.md §4.18` (recompilación, reinicio de contenedores afectados y verificación HTTP 200).

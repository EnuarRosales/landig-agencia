# SPEC-18 · Plan de Tareas · Central de Promociones y Descuentos Comerciales Automáticos

- [x] **T-00 · Desacople del atributo estático «Precio Promocional (Opcional)» en `SPEC-08` y regla transversal `AGENTS.md §4.19`**
  - Retirar el input manual estático «Precio Promocional (Opcional)» de `apps/admin/app/workspace/products/product-form-modal.tsx`, conservando `sale_price_cents` en BD por compatibilidad.
  - Corregir en `apps/admin/app/workspace/products/products-view.tsx` el espaciado perimetral (`w-full space-y-6 p-4 md:px-8 md:py-6`), los estilos canónicos de los botones «Actualizar» y «Registrar Nuevo Producto» (`--dsn-accent` / `--dsn-surface`) y el cierre automático del modal al guardar (`handleFormSaved`).
  - Crear la regla permanente `.agents/rules/rules-for-backoffice-layout-and-ui-styles.md` y registrarla en `.agents/AGENTS.md` (§4.19).
  - **Verificación:** `vitest` en `apps/admin/app/workspace/workspace-views.test.tsx`, `next build` y chequeo HTTP 200 en contenedor `mocter-core-admin-portal-1`.

- [ ] **T-01 · Esquema Drizzle y migraciones SQL de celda para `admin.promotions` y `admin.promotion_targets`**
  - Crear `packages/domain/src/db/schemas/tenant/promotions.ts` con comentarios SQL obligatorios, `CHECK` constraints e índices.
  - Generar migración SQL en `packages/domain/drizzle-cell/` + RLS (`app.current_client_id`) y `GRANT` para `mocter_app`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check --config=drizzle.cell.config.ts` y tests de esquema.

- [ ] **T-02 · Motor `PromotionResolutionEngine` y servicio `TenantPromotionsService` en `@mocter/domain`**
  - Implementar CRUD de promociones, cálculo de estado derivado (`active`, `scheduled`, `paused`, `expired`, `depleted`), semáforo de margen contra `cost_price_cents` y regla de prioridad sin acumulación (`Producto > Categoría > Todo el Catálogo`).
  - Integrar la resolución automática de promociones activas en `TenantProductsAndMediaService.listCatalog` / `getProductDetail`, en el contexto del Bot AI (`BOT-002`) y en el descuento de cupo de pedidos (`SPEC-11`).
  - **Verificación:** `pnpm --filter @mocter/domain test` con pruebas unitarias de colisión, vigencia horaria y agotamiento de cupo.

- [ ] **T-03 · Route Handlers HTTP `/api/tenant/promotions/*` en `apps/admin`**
  - Crear `GET`/`POST /api/tenant/promotions`, `GET`/`PUT`/`DELETE /api/tenant/promotions/[id]` y `PATCH /api/tenant/promotions/[id]/status` con validación Zod, `handle()` RFC 9457 y RBAC (`DELETE` exclusivo para `tenant_owner`).
  - **Verificación:** Suite Vitest de rutas `/api/tenant/promotions`.

- [ ] **T-04 · Interfaz `/workspace/promotions`, navegación lateral e indicadores directos en `/workspace/products`**
  - Agregar el ítem «Promociones y Ofertas» (`/workspace/promotions`) en `TenantWorkspaceShell` debajo de «Productos y Catálogo» y sus claves i18n `es`/`en` en Title Case.
  - Construir `PromotionsView` y `PromotionFormModal` respetando `AGENTS.md §4.19` (`w-full space-y-6 p-4 md:px-8 md:py-6`, botones canónicos, cierre automático al guardar y `ConfirmationModal`).
  - Mostrar el badge de campaña activa, `% OFF` y vigencia en cada fila de `/workspace/products`.
  - **Verificación:** `vitest` de vistas, `next build` y protocolo `AGENTS.md §4.18`.

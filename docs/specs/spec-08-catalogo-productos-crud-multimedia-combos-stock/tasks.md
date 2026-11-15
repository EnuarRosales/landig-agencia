# SPEC-08 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender esquema de celda para productos, combos, `is_cover` y stock**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`, nueva migración en `packages/domain/drizzle-cell/` + archivo RLS/grants/comentarios + `packages/domain/drizzle-cell/meta/_journal.json`, actualización en `tenant-onboarding.service.ts` (`status: "active"`).
  - **Detalle:** Coalescer `costPriceCents` (`NOT NULL DEFAULT 0`), agregar `compositionType`, `botMasterPrompt` (`TEXT NOT NULL DEFAULT ''` copiando `prompt` previo), `stockQuantity`, `minStockThreshold`, `lowStockAlertSentAt`, migrar `status` CHECK a `('active','inactive','draft')` (`published→active`, `archived→inactive`), normalizar default de `attributes` a `'[]'::jsonb`, crear tabla `cellProductBundleItems` con FKs compuestas hacia `admin.products(client_id, id)` y agregar `mediaKind` + `isCover` en `cellProductMedia` con CHECK e índice único parcial `WHERE is_cover = true`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check --config=drizzle.cell.config.ts` y test de migración de celda.

- [x] **T-02 · Consolidar autoridad única, combos, multimedia, cover, magic bytes y stock mínimo en `@mocter/domain`**
  - **Archivos:** `packages/domain/src/services/tenant-products-and-media.service.ts`, `packages/domain/src/services/tenant-workspace.service.ts` (wrappers compatibles), `packages/domain/src/utils/media-magic-bytes.ts`, `packages/domain/src/services/notifications-and-leads.service.ts`, `packages/domain/src/services/ai-assist-catalog.seed.ts`, pruebas unitarias en `packages/domain/src/services/`.
  - **Detalle:** Implementar `listProducts` (`SPEC-17` paginado/filtrado), `getProductDetail` (stock dinámico en combos con advertencia de hijos inactivos, rentabilidad y medios agrupados), `createProduct`/`updateProduct`/`updateProductStatus`/`softDeleteProduct`, subida/ingestión multimodal (`PNG/JPEG/WebP/AVIF`, `MP4/WebM/MOV`, `MP3/OGG/WAV/M4A`, `PDF`, rechazando `SVG/GIF`) con cuotas `*_per_product` + `storage_bytes` + deduplicación hash, `setProductMediaCover`, `deleteProductMedia` con limpieza S3 y promoción de portada, registro de `tenant.inventory.low_stock` (`es`/`en`) + evaluador antispam `low_stock_alert_sent_at`, y ajuste `maxLength: 4000` en `product.bot_master_prompt`.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-products-and-media` y pruebas de dominio impactadas.

- [x] **T-03 · Implementar APIs `/api/tenant/products*` y proxy privado `/api/tenant/media/*` con RFC 9457**
  - **Archivos:** `apps/admin/app/api/tenant/products/route.ts`, `apps/admin/app/api/tenant/products/[id]/route.ts`, `apps/admin/app/api/tenant/products/[id]/status/route.ts` [Nuevo], `apps/admin/app/api/tenant/products/[id]/media/[mediaId]/cover/route.ts` [Nuevo], `apps/admin/app/api/tenant/products/[id]/media/[mediaId]/route.ts` [Nuevo], `apps/admin/app/api/tenant/media/upload/route.ts`, `apps/admin/app/api/tenant/media/[mediaId]/route.ts` [Nuevo], tests en `tenant-routes.test.ts`.
  - **Detalle:** Envolver rutas en `handle()` RFC 9457, validar con Zod (`botMasterPrompt <= 32,000`, atributos, combos, alias de status), aplicar RBAC (`403` si `tenant_agent` intenta `DELETE`), servir proxy autenticado HTTP `Range` (`206`) desde `S3StorageService` para video/audio/PDF, ejecutar alerta de stock bajo en `after()` y emitir logs JSON con `appLogger`.
  - **Verificación:** Pruebas de integración de rutas HTTP (`200`, `201`, `206`, `400`, `403`, `404`, `409`, `422`).

- [x] **T-04 · Construir UI completa de Productos (`/workspace/products`)**
  - **Archivos:** `apps/admin/app/workspace/products/page.tsx`, `apps/admin/app/workspace/products/products-view.tsx`, `product-detail-modal.tsx` [Nuevo], `product-form-modal.tsx` [Nuevo], `product-ui-helpers.ts` [Nuevo], `apps/admin/lib/i18n.ts`, `apps/admin/app/workspace/workspace-views.test.tsx`.
  - **Detalle:** Tabla paginada/ordenable/filtrable Mobile First con `<CatalogQuotaBanner />`, modal Ver completo (`imgproxy` portada, reproductores HTML5 `<video>`/`<audio>`, descarga PDF, combo y márgenes), modal Crear/Editar con 5 pestañas (Precios/Utilidad + pre-cálculo de costo en combos, Stock Físico, Atributos Dinámicos/Combo, Multimedia multimodal con selector de Foto Principal, Prompt Maestro hasta 32k con estructura recomendada + `<AiEnhanceTextarea />`), RBAC (`tenant_agent` sin botón Eliminar) y modales `--dsn-*` (`ConfirmationModal`) en Title Case bilingüe `es`/`en`.
  - **Verificación:** `pnpm --filter @mocter/admin test workspace-views` y pruebas i18n.

- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint` (con 0 errores en archivos SPEC-08; 53 errores preexistentes en archivos heredados ajenos), `pnpm test` (`@mocter/domain`, `@mocter/admin`, `@mocter/web`), `pnpm --filter @mocter/domain exec drizzle-kit check` (+ `--config=drizzle.cell.config.ts`), `next build` de `@mocter/admin`, aplicación de migraciones `0013` y `0014` en `mocter-cell-01-pg-cell-1`, reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, verificación HTTP `200` y logs sin excepciones en caliente.


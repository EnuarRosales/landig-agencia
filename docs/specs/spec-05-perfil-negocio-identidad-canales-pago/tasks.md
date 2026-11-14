# SPEC-05 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender `admin.clients` (`commercial_email`), crear tabla de celda `tenant_payment_channels` y añadir `payment_channel_id` en `admin.orders`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/clients.ts`, `packages/domain/src/db/schemas/tenant/orders.ts`, migraciones SQL control (`packages/domain/drizzle/`) + celda (`packages/domain/drizzle-cell/`).
  - **Detalle:** Agregar `commercial_email` a `clients`, crear tabla `admin.tenant_payment_channels` en celda con índices, comentarios SQL y aislamiento RLS `app.current_client_id`, y agregar `payment_channel_id UUID` nullable a `admin.orders`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y validación de migración de celda.

- [x] **T-02 · Implementar `TenantProfileService` y `TenantPaymentChannelsService`**
  - **Archivos:** `packages/domain/src/services/tenant-profile.service.ts` [Nuevo], `packages/domain/src/services/tenant-profile.service.test.ts` [Nuevo], `packages/domain/src/services/tenant-payment-channels.service.ts` [Nuevo], `packages/domain/src/services/tenant-payment-channels.service.test.ts` [Nuevo], `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/index.ts`.
  - **Detalle:** CRUD seguro de perfil comercial (slug solo lectura), carga/eliminación de logo raster (`PNG`/`JPG`/`WEBP` <= 5 MiB, sin SVG) vía `SPEC-00` exenta de cuota `storage_bytes`, resolución de `logoUrl` en contexto de sesión, sincronización de `locale` y protección contra borrado de canales usados en pedidos históricos (`payment_channel_id` o `payment_method`).
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-profile tenant-payment-channels`.

- [x] **T-03 · Crear endpoints `/api/tenant/profile`, `/api/tenant/profile/logo` y `/api/tenant/payment-channels*`**
  - **Archivos:** `apps/admin/app/api/tenant/profile/route.ts` [Nuevo], `apps/admin/app/api/tenant/profile/logo/route.ts` [Nuevo], `apps/admin/app/api/tenant/payment-channels/route.ts` [Nuevo], `apps/admin/app/api/tenant/payment-channels/[id]/route.ts` [Nuevo], pruebas de ruta en `apps/admin/app/api/tenant/tenant-routes.test.ts` (o `spec05-routes.test.ts`).
  - **Detalle:** Envolver en `handle()` RFC 9457, validar con Zod, permitir lectura operativa a `tenant_agent`, exigir `tenant_owner`/`tenancy_owner` en escritura (`403` a `tenant_agent`), emitir cookie `mocter_locale` si cambia idioma y registrar auditoría con `after()`.
  - **Verificación:** Pruebas de integración de rutas HTTP (`200`, `400`, `403`, `409`).

- [x] **T-04 · Construir página `/workspace/profile` y conectarla al shell del comercio**
  - **Archivos:** `apps/admin/app/workspace/profile/page.tsx` [Nuevo], `apps/admin/app/workspace/profile/profile-view.tsx` [Nuevo], `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/components/portal-shell-router.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Vista Mobile First con carga/eliminación de logo comercial, `slug` solo lectura, correo comercial, web, teléfono, idioma (`locale` con refresh inmediato), redes sociales y CRUD de canales de pago con modales `--dsn-*` (cero `window.confirm`, labels en Title Case, cero códigos de spec). Ítem de navegación visible solo para `tenant_owner`; acceso directo de `tenant_agent` en modo solo lectura.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/profile`.


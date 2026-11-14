# SPEC-05 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender `admin.clients` (`commercial_email`) y crear tabla de celda `tenant_payment_channels`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/clients.ts`, `packages/domain/src/db/schemas/tenant/orders.ts`, migraciones SQL control + celda.
  - **Detalle:** Agregar `commercial_email` a `clients` y tabla `tenant_payment_channels` con índices, comentarios SQL y aislamiento RLS `app.current_client_id`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y validación de migración de celda.

- [ ] **T-02 · Implementar `TenantProfileService` y `TenantPaymentChannelsService`**
  - **Archivos:** `packages/domain/src/services/tenant-profile.service.ts` [Nuevo], `packages/domain/src/services/tenant-profile.service.test.ts` [Nuevo], `packages/domain/src/services/tenant-payment-channels.service.ts` [Nuevo], `packages/domain/src/services/tenant-payment-channels.service.test.ts` [Nuevo].
  - **Detalle:** CRUD seguro de perfil comercial, resolución de logo vía `SPEC-00` para cualquier plan (independiente de `custom_branding`), sincronización de `locale`, y protección contra borrado de canales usados en pedidos históricos.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-profile tenant-payment-channels`.

- [ ] **T-03 · Crear endpoints `/api/tenant/profile` y `/api/tenant/payment-channels*`**
  - **Archivos:** `apps/admin/app/api/tenant/profile/route.ts` [Nuevo], `apps/admin/app/api/tenant/payment-channels/route.ts` [Nuevo], `apps/admin/app/api/tenant/payment-channels/[id]/route.ts` [Nuevo], pruebas de ruta en `apps/admin/app/api/tenant/tenant-routes.test.ts`.
  - **Detalle:** Envolver en `handle()` RFC 9457, validar con Zod, exigir `tenancy_owner` en escritura (`403` a `tenant_agent`), registrar auditoría con `after()`.
  - **Verificación:** Pruebas de integración de rutas HTTP (`200`, `400`, `403`, `409`).

- [ ] **T-04 · Construir página `/workspace/profile` y conectarla al shell del comercio**
  - **Archivos:** `apps/admin/app/workspace/profile/page.tsx` [Nuevo], `apps/admin/app/workspace/profile/profile-view.tsx` [Nuevo], `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Vista Mobile First con carga/eliminación de logo comercial, edición de correo comercial, web, teléfono, idioma (`locale`), redes sociales y CRUD de canales de pago con modales `--dsn-*` (cero `window.confirm`, labels en Title Case, cero códigos de spec).
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/profile`.


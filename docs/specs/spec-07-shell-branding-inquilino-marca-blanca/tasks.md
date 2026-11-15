# SPEC-07 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Completar repositorio Drizzle de `WhiteLabelService`, catálogo de Planes y contexto de sesión**
  - **Archivos:** `packages/domain/src/services/white-label.service.ts`, `packages/domain/src/services/white-label.service.test.ts`, `packages/domain/src/services/tenant-capability-gate.service.ts`, `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/services/admin-dashboard.service.ts`, `apps/admin/app/admin/plans/plan-modal-dialog.tsx`.
  - **Detalle:** Conectar `DrizzleWhiteLabelRepository` con `admin.client_brandings`, `admin.client_feature_overrides` y `admin.plan_feature_values` (`white_label`: `none` | `paleta` | `completa`), sincronizar `custom_branding` en `TenantCapabilityGateService`, habilitar selector `white_label` en Planes SaaS, añadir validación FQDN/unicidad de `customDomain` y exponer `logoUrl`, `branding` y `brandingTokens` seguros (`--dsn-accent*`) en contexto autenticado.
  - **Verificación:** `pnpm --filter @mocter/domain test white-label session-context`.

- [x] **T-02 · Crear endpoints `/api/tenant/branding` (`GET`, `PUT`, `DELETE`) y `/api/tenant/branding/asset` (`POST`)**
  - **Archivos:** `apps/admin/app/api/tenant/branding/route.ts` [Nuevo], `apps/admin/app/api/tenant/branding/asset/route.ts` [Nuevo], pruebas en `apps/admin/app/api/tenant/spec07-routes.test.ts`.
  - **Detalle:** Validación Zod sobre `BrandingPaletteTokens`, RBAC `tenant_owner`, contraste WCAG 2.2 AA server-side, subida binaria de Favicon/Logo a SeaweedFS/imgproxy sincronizando `clients.logo_media_id`, restauración por `DELETE`, `handle()` RFC 9457 y auditoría Pino + `after()`.
  - **Verificación:** Pruebas de integración HTTP (`200`, `400`, `403`, `409`, `422`).

- [x] **T-03 · Actualizar `TenantWorkspaceShell` (`TAB-01`)**
  - **Archivos:** `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Mostrar logo comercial (con `onError` fallback seguro) + nombre comercial completo sin `truncate max-w-[120px]`/`130px` + indicador verde «Conectado» debajo del nombre; mantener visibilidad gated en barra lateral para nivel `'none'` (`D-SPEC-07-04`).
  - **Verificación:** Inspección visual móvil/desktop + `apps/admin/components/tenant-workspace-shell.test.tsx`.

- [x] **T-04 · Construir UI completa de `/workspace/branding` (`GEN-05`) e inyección CSS en layout**
  - **Archivos:** `apps/admin/app/workspace/branding/page.tsx`, `apps/admin/app/workspace/branding/branding-view.tsx` [Nuevo], `apps/admin/app/workspace/layout.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Vista informativa/upsell en `'none'` con enlaces a `/workspace/profile` y `/workspace/billing`; editor de paleta con calculadora de contraste WCAG AA en vivo en `'paleta'`/`'completa'`, subida directa de Favicon/Logo y campos Enterprise condicionales (`customDomain`, `customFont`, `removeMocterBranding`), panel de vista previa con paleta completa e inyección de `--dsn-accent*` respetando Claro/Oscuro en `layout.tsx`, más modal `--dsn-*` para restaurar valores por defecto.
  - **Verificación:** Pruebas de componente RTL + validación contraste.

- [x] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace` y `/workspace/branding`.

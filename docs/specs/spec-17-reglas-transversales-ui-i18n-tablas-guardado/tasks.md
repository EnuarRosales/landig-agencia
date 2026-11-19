# SPEC-17 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Añadir `preferred_locale` en `cell_users`, helper de paginación, facturas en billing y cascada i18n en `session-context.service.ts`**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/users.ts`, `packages/domain/drizzle-cell/*`, `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/utils/pagination.ts` [Nuevo], `packages/domain/src/index.ts`.
  - **Detalle:** Implementar columna nullable `preferred_locale` en `cell_users` con migración celular, resolución `user.preferredLocale -> cookie -> client.locale -> browser -> 'es'` en `resolveAuthenticatedPortalContext` exponiendo `activeLocale`, helper compartido `parsePaginationQuery`/`buildPaginatedResult` (`limit <= 50`), y exposición de historial de facturas en `WorkspaceBillingDto`.
  - **Verificación:** `pnpm --filter @mocter/domain test session-context pagination`. (`4 files / 48 tests passed`, `tsc --noEmit` OK, `db:check` & `db:check:cell` OK)

- [x] **T-02 · Crear endpoint `PATCH /api/tenant/locale`, modularizar diccionarios `es.json` / `en.json`, actualizar `TenantWorkspaceShell` y alinear `limit <= 50`**
  - **Archivos:** `apps/admin/app/api/tenant/locale/route.ts` [Nuevo], `apps/admin/lib/i18n.ts`, `apps/admin/lib/i18n/es.json` y `en.json` [Nuevos], `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/components/portal-shell-router.tsx`, `apps/admin/app/workspace/**/page.tsx`, `apps/admin/app/workspace/workspace-dashboard-view.tsx`, `apps/admin/app/workspace/reports/page.tsx`, endpoints `GET /api/tenant/{products,referrals,community/posts}`.
  - **Detalle:** Endpoint `PATCH /api/tenant/locale` validado con Zod + `handle()` actualizando `cell_users.preferred_locale` y cookie `mocter_locale`, selector `ES | EN` en shell con `router.refresh()`, extracción de todos los literales hardcoded restantes hacia diccionarios bilingües y estandarización `limit <= 50` (ajustando `product-form-modal.tsx` a `limit=50`).
  - **Verificación:** Prueba de paridad `es`/`en` y tests HTTP en verde.

- [x] **T-03 · Construir `<WorkspaceDataTable />`, `<FormSaveBar />` y `useUnsavedChangesGuard` + adopción transversal**
  - **Archivos:** `apps/admin/components/ui/workspace-data-table.tsx` [Nuevo], `apps/admin/components/ui/form-save-bar.tsx` [Nuevo], `apps/admin/lib/use-unsaved-changes-guard.ts` [Nuevo], vistas en `apps/admin/app/workspace/{products,contacts,orders,team,billing,bot,profile,branding,ai,notifications,community,referrals}`.
  - **Detalle:** Adoptar tabla estándar dual con paginación (10/20/50), ordenamiento, búsqueda debounced 300ms, filtros y tarjetas móviles en todos los listados (incluyendo tabla de Facturas en `billing-view.tsx` y tablas de Comunidades/Referidos), y barra dual superior/sticky inferior + guard de salida/descarte con modal `--dsn-*` en `/workspace/bot`, `/workspace/profile`, `/workspace/branding`, `/workspace/ai` y cierre de `product-form-modal.tsx`.
  - **Verificación:** Pruebas de componente RTL + `workspace-views.test.tsx`. (`tsc --noEmit` OK, ESLint 0 errors, 10 files / 66 tests passed)

- [x] **T-04 · Crear test automatizado de auditoría UI/i18n/A11y y ejecutar protocolo `AGENTS.md §4.18`**
  - **Archivos:** `apps/admin/lib/i18n-audit.test.ts` [Nuevo].
  - **Comandos:** `pnpm --filter @mocter/domain lint`, `pnpm --filter @mocter/domain test --no-file-parallelism` (96/97 passed, 1063 passed, 10 skipped preexistentes), `db:check` & `db:check:cell` OK, `eslint` (0 errores en archivos SPEC-17), `NEXT_PUBLIC_ADMIN_URL`/`NEXT_PUBLIC_CHATWOOT_URL` + `pnpm --filter @mocter/admin test` (84/84 files, 392 passed), `pnpm --filter @mocter/admin build` OK, migración celular aplicada en `mocter-cell-01-pg-cell-1` (25 migraciones, `admin.users.preferred_locale`), reinicio Docker y HTTP 200 validado en vivo (`es`/`en`).


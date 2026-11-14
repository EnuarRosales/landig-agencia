# SPEC-17 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Añadir `preferred_locale` en `cell_users`, helper de paginación y cascada i18n en `session-context.service.ts`**
  - **Archivos:** `packages/domain/src/db/schemas/tenant/users.ts`, `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/utils/pagination.ts` [Nuevo], migración SQL de celda.
  - **Detalle:** Implementar resolución `user.preferredLocale -> client.locale -> browser -> 'es'` y helper compartido de paginación.
  - **Verificación:** `pnpm --filter @mocter/domain test session-context pagination`.

- [ ] **T-02 · Crear endpoint `PATCH /api/tenant/locale` y completar diccionarios `es.json` / `en.json`**
  - **Archivos:** `apps/admin/app/api/tenant/locale/route.ts` [Nuevo], `apps/admin/src/i18n/es.json` y `en.json`, `apps/admin/components/tenant-workspace-shell.tsx`.
  - **Detalle:** Endpoint validado con Zod + `handle()`, selector `ES | EN` en shell y extracción de todos los literales hardcoded en vistas del workspace hacia diccionarios bilingües.
  - **Verificación:** Prueba de paridad `es`/`en` en verde.

- [ ] **T-03 · Construir `<WorkspaceDataTable />` y `<FormSaveBar />` + adopción transversal**
  - **Archivos:** `apps/admin/components/ui/workspace-data-table.tsx` [Nuevo], `apps/admin/components/ui/form-save-bar.tsx` [Nuevo], vistas en `apps/admin/app/workspace/{products,contacts,orders,team,billing,bot,profile,branding,notifications,community,referrals}`.
  - **Detalle:** Adoptar tabla estándar con paginación/orden/filtros/móvil en todos los listados y barra dual superior/inferior en `/workspace/bot` y configuraciones largas con modal `--dsn-*` para cambios sin guardar.
  - **Verificación:** Pruebas de componente RTL + `workspace-views.test.tsx`.

- [ ] **T-04 · Crear test automatizado de auditoría UI/i18n/A11y y ejecutar protocolo `AGENTS.md §4.18`**
  - **Archivos:** `apps/admin/src/i18n/i18n-audit.test.ts` [Nuevo].
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 cambiando idioma entre `es` y `en`.


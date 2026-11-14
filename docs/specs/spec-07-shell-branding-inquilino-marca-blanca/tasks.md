# SPEC-07 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Completar repositorio Drizzle de `WhiteLabelService` y contexto de sesión**
  - **Archivos:** `packages/domain/src/services/white-label.service.ts`, `packages/domain/src/services/white-label.service.test.ts`, `packages/domain/src/services/session-context.service.ts`.
  - **Detalle:** Conectar `IWhiteLabelRepository` con `admin.client_brandings` y `TenantCapabilityGateService` (`none` | `paleta` | `completa`), añadir validación FQDN/unicidad de `customDomain` y exponer `logoUrl` + `brandingTokens` en contexto autenticado.
  - **Verificación:** `pnpm --filter @mocter/domain test white-label session-context`.

- [ ] **T-02 · Crear endpoint `/api/tenant/branding` (`GET`, `PUT`, `DELETE`)**
  - **Archivos:** `apps/admin/app/api/tenant/branding/route.ts` [Nuevo], pruebas en `apps/admin/app/api/tenant/tenant-routes.test.ts`.
  - **Detalle:** Validación Zod, RBAC `tenancy_owner`, contraste WCAG 2.2 AA server-side, restauración por `DELETE`, `handle()` RFC 9457 y auditoría Pino + `after()`.
  - **Verificación:** Pruebas de integración HTTP (`200`, `400`, `403`, `409`, `422`).

- [ ] **T-03 · Actualizar `TenantWorkspaceShell` (`TAB-01`)**
  - **Archivos:** `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Mostrar logo comercial (o default) + nombre comercial completo sin `truncate max-w-[120px]` + indicador verde «Conectado» debajo del nombre; eliminar toda traza visual de `pg-cell-01`.
  - **Verificación:** Inspección visual móvil/desktop + `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-04 · Construir UI completa de `/workspace/branding` (`GEN-05`) e inyección CSS en layout**
  - **Archivos:** `apps/admin/app/workspace/branding/page.tsx`, `apps/admin/app/workspace/branding/branding-view.tsx` [Nuevo], `apps/admin/app/workspace/layout.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Editor de paleta con calculadora de contraste WCAG AA en vivo, campos Enterprise condicionales (`customDomain`, `customFont`, `faviconUrl`, `removeMocterBranding`), vista previa interactiva y modal `--dsn-*` para restaurar valores por defecto.
  - **Verificación:** Pruebas de componente RTL + validación contraste.

- [ ] **T-05 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace` y `/workspace/branding`.


# TNT-001 · Tareas · Estabilización del Entorno Operativo del Inquilino, Onboarding Unificado y Backoffice Celular

| Atributo | Valor |
|---|---|
| ID | TNT-001 |
| Versión | 1.0 |
| Estado | Aprobada · En ejecución |
| Fecha | 2026-11-08 |
| Documentos | [`requirements.md`](requirements.md) · [`design.md`](design.md) · `tasks.md` (este) |
| Correspondencia | Equivalente a `ADM-001` Fase 8 (`T-39` a `T-43`) y `AUTH-001` (`T-40`) |

> Regla: ejecutar en orden. Marcar `[x]` solo cuando la verificación pase.

## Fase 1 · Pool Celular (`pg-cell-XX`), Aislamiento RLS y Promoción de Identidad

- [x] **TNT-T-01 · Implementar `CellDatabasePoolManager`, provisión celular en alta manual y reconciliación en `pg-cell-XX` (`ADM-001 T-39` / `AUTH-001 T-40`)**
  - Crear `packages/domain/src/db/cell-client.ts` con `getCellDb(cellId)` y `withTenantCellTransaction(clientId, callback)` descifrando `cell_secrets_ciphertext`, resolviendo el endpoint de PgBouncer (`resolveLocalProbeTarget`) y fijando `SELECT set_config('app.current_client_id', clientId, true)`.
  - Conectar `DrizzleCellAuthRepository` a `getCellDb(cellId)`.
  - Implementar `provisionTenantInCellDataPlane` y `reconcileProvisionedTenantsInCells` en `packages/domain/src/services/admin-dashboard.service.ts`; crear altas manuales en estado `lifecycle_status = 'alta'`; persistir la contraseña de `/password/setup` en `pg-cell-XX` (`AuthService.resetPassword`) y mostrar `tenant_owner` + celda en `/admin/users` (`fetchRbacOverview`).
  - Verificación: `Synergia Market` (`synergiamarket25@gmail.com`) queda reconciliado en `pg-cell-01` bajo RLS, `identity_location` apunta a `cell-01` y `/admin/users` muestra `tenant_owner`.
  - Evidencia: 2026-11-08 — Creado `packages/domain/src/db/cell-client.ts` con `CellDatabasePoolManager` dinámico (AES-256-GCM, pool transaction mode y `FORCE RLS` vía `withTenantCellTransaction`), suite unitaria en `cell-client.test.ts` pasando 100%. Reconciliado `Synergia Market` (`synergiamarket25@gmail.com`) con `identity_location = 6ae5619b-7ca3-4764-baae-1b8950a8e534` (`cell-01`) y rol `tenant_owner` en `fetchRbacOverview`. Pruebas E2E Escenario A (`scenario-a-cell-isolation.mjs`) 100% pasando (18/18 tests).
  - TNT-RF-01.1 a TNT-RF-01.6, TNT-D-02, TNT-D-03.

## Fase 2 · Contexto Autoritativo de Sesión y Separación de Árboles `.tsx`

- [x] **TNT-T-02 · Implementar `resolveAuthenticatedPortalContext` y separar `AdminShell.tsx` de `TenantWorkspaceShell.tsx` (`ADM-001 T-40`)**
  - Crear `packages/domain/src/services/session-context.service.ts` (`resolveAuthenticatedPortalContext`).
  - Eliminar el fallback `role = "platform_owner"` en `apps/admin/app/layout.tsx`, crear `apps/admin/components/portal-shell-router.tsx` y proteger `apps/admin/app/page.tsx` y `/admin/*`.
  - Unificar las redirecciones post-auth en `apps/web` (`login-form.tsx`, `setup-password-card.tsx`, callback OAuth) hacia `mocter-admin`.
  - Verificación: ningún usuario de inquilino o prospecto accede a `AdminShell.tsx` ni a `/admin/*`.
  - Evidencia: 2026-11-09 — Implementado `resolveAuthenticatedPortalContext` en `session-context.service.ts` con 11/11 tests unitarios pasando. Erradicado fallback inseguro `role = "platform_owner"` en `apps/admin/app/layout.tsx`. Creado `PortalShellRouter.tsx` (7/7 tests) y `TenantWorkspaceShell.tsx` (8/8 tests). Protegidas rutas en `apps/admin/proxy.ts` y `apps/admin/app/admin/layout.tsx`. Alineadas redirecciones en `apps/web/components/auth/login-form.tsx`. Recompilados servicios Docker y verificado `HTTP 200` en `/api/health`. Suite E2E Escenario B (`scenario-b-bifurcated-shells.mjs`) pasando 14/14 tests y suite completa 67/67 tests (100%).
  - TNT-RF-02.1 a TNT-RF-02.4, TNT-D-01, CA-TNT-01.

## Fase 3 · Asistente de Onboarding Unificado en 3 Pasos (`/onboarding`)

- [x] **TNT-T-03 · Implementar `TenantOnboardingService` y `TenantOnboardingWizard.tsx` para Alta Manual y Alta Autónoma (`ADM-001 T-41`)**
  - [x] **TNT-T-03.1 · Servicio de Dominio (`TenantOnboardingService`)**: Implementar `packages/domain/src/services/tenant-onboarding.service.ts` con `getOnboardingState`, `completeStep1Business`, `completeStep2FirstProduct` y `completeStep3BotAndActivate` operando sobre `db-portal` y `pg-cell-XX` bajo RLS. Pruebas unitarias en `tenant-onboarding.service.test.ts`. Evidencia: 12/12 tests pasando.
  - [x] **TNT-T-03.2 · Endpoint API (`/api/tenant/onboarding`)**: Implementar Route Handler en `apps/admin/app/api/tenant/onboarding/route.ts` con manejo de excepciones RFC 9457 (`handle()`), validación tipada con Zod y correlación de sesión autoritativa. Evidencia: 6/6 tests pasando en `route.test.ts`.
  - [x] **TNT-T-03.3 · Componentes de UI Mobile First (`TenantOnboardingWizard.tsx` y `/onboarding/page.tsx`)**: Crear el asistente de 3 pasos en `apps/admin/app/onboarding/` con tokens de diseño DSN-001, etiquetas en Title Case (Regla 4.8), «Mejorar con AI» en descripción de producto (AI-001, Regla 4.7) y feedback interactivo. Evidencia: 6/6 tests pasando en `tenant-onboarding-wizard.test.tsx`.
  - [x] **TNT-T-03.4 · Verificación Integral y Pruebas E2E (Escenario C)**: Ejecutar `tests/e2e/scenarios/scenario-c-onboarding-wizard.mjs` validando la transición de `lifecycle_status` de `'alta'` a `'activo'` tanto para `Synergia Market` (alta manual) como para prospecto de `/register` (alta autónoma). Evidencia: 2026-11-09 — Ejecutado `node tests/e2e/run.mjs --scenario=C` pasando 13/13 tests y suite completa pasando 67/67 tests (100%). Compilado `@mocter/domain` vía `tsc` sin errores, reiniciados contenedores `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` y validado `HTTP 200 OK` en `/api/health` bajo Regla 4.18.
  - TNT-RF-03.1 a TNT-RF-03.5, TNT-D-02, CA-TNT-02.

## Fase 4 · Backoffice del Inquilino (`/workspace/*`), Gating por Plan y Flujo Multimedia

- [x] **TNT-T-04 · Implementar `TenantWorkspaceService`, endpoints `/api/tenant/*`, `TenantWorkspaceShell.tsx` y vistas `/workspace/*` (`ADM-001 T-42`)**
  - [x] **TNT-T-04.1 · Servicios de Dominio (`TenantWorkspaceService` & `TenantMediaService`)**: Implementar `packages/domain/src/services/tenant-workspace.service.ts` operando sobre `pg-cell-XX` bajo RLS (`withTenantCellTransaction`) para catálogo, CRM, pedidos, bot, miembros y subida/firma de multimedia (SeaweedFS bucket `media` + imgproxy HMAC). Pruebas unitarias en `tenant-workspace.service.test.ts`. Evidencia: 12/12 tests unitarios pasando.
  - [x] **TNT-T-04.2 · Endpoints API del Inquilino (`/api/tenant/*`)**: Implementar Route Handlers para `/api/tenant/{dashboard,products,products/[id],contacts,orders,orders/[id],bot,team,billing,media/upload}` en `apps/admin` con manejo tipado RFC 9457 Problem Details (`handle()`), validación con Zod y correlación de sesión autoritativa. Pruebas unitarias en `apps/admin`. Evidencia: 5/5 tests pasando en `tenant-routes.test.ts`.
  - [x] **TNT-T-04.3 · Vistas y Componentes del Workspace (`apps/admin/app/workspace/`)**: Crear las páginas de los 7 módulos base (`/workspace/page.tsx`, `products/page.tsx`, `contacts/page.tsx`, `orders/page.tsx`, `bot/page.tsx`, `team/page.tsx`, `billing/page.tsx`) y los 4 módulos condicionales gobernados por `TenantCapabilityGateService` (`conversations`, `branding`, `community`, `reports`), con diseño Mobile First (DSN-001), etiquetas en Title Case (Regla 4.8), modales de confirmación accesibles (Regla 4.17) y sin identificadores de especificación (Regla 4.15). Evidencia: 5/5 tests de componentes pasando en `workspace-views.test.tsx`.
  - [x] **TNT-T-04.4 · Verificación Integral y Pruebas E2E (Escenario D)**: Ejecutar `tests/e2e/scenarios/scenario-d-workspace-and-media.test.mjs`, recompilar `@mocter/domain`, reiniciar `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` y verificar HTTP 200 en `/api/health` bajo Regla 4.18. Evidencia: 2026-11-09 — Ejecutado `node tests/e2e/run.mjs --scenario=D` pasando 13/13 tests y suite completa pasando 67/67 tests (100%). Compilación de `@mocter/domain` vía `tsc` sin errores (código 0), reiniciados contenedores `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` y validado `HTTP 200 OK` en `/api/health` bajo Regla 4.18.
  - TNT-RF-04.1 a TNT-RF-04.3, TNT-D-01, TNT-D-03, CA-TNT-03, CA-TNT-04, CA-TNT-05.

## Fase 5 · Verificación Integral, Seguimiento de Migraciones Celulares y Pruebas End-to-End (Regla 4.18)

- [x] **TNT-T-05 · Implementar seguimiento de migraciones de celdas (`CellMigrationService`), recompilar contenedores y verificar los 5 escenarios funcionales en caliente (`ADM-001 T-43`)**
  - [x] **TNT-T-05.1 · Servicio de Dominio (`CellMigrationService`)**: Implementar `packages/domain/src/services/cell-migration.service.ts` con `getMigrationJournal`, `getCellMigrationStatus`, `executeCellMigrations` y `resolveDrizzleCellPath`. Inspección contra `packages/domain/drizzle-cell/meta/_journal.json` y `drizzle.__drizzle_migrations`. Suite unitaria en `cell-migration.service.test.ts` (6/6 tests pasando).
  - [x] **TNT-T-05.2 · Endpoints API del Plano de Control (`apps/web`)**: Implementar `apps/web/app/api/admin/cells/[id]/migrations/route.ts` (GET estado de migraciones) y ampliar `apps/web/app/api/admin/cells/[id]/action/route.ts` con acción `migrate`.
  - [x] **TNT-T-05.3 · Interfaz de Operador (`apps/admin/app/admin/cells/`)**: Agregar columna `Esquema` y badges («Al día» / «Actualización Pendiente») en `page.tsx` y botón «Migrar» con modal accesible de confirmación (`ConfirmationModal`, Regla 4.17) en `cell-actions.tsx`. Pruebas unitarias de componentes pasando (6/6 tests en `cell-actions.test.tsx`, 4/4 tests en `page.test.tsx`).
  - [x] **TNT-T-05.4 · Verificación Integral E2E y Health Checks (Regla 4.18)**: Ejecutar suite completa de pruebas E2E (Escenarios A, B, C, D, E) pasando 67/67 tests (100%). Compilar `@mocter/domain` vía `tsc` sin errores (código 0), reiniciar contenedores Docker (`mocter-core-admin-portal-1` y `mocter-core-web-portal-1`) y validar código de respuesta `HTTP/1.1 200 OK` en endpoints `/api/health`.
  - Verificación: todos los criterios de aceptación verificados con evidencia en base de datos, API y suite E2E.
  - Evidencia: 2026-11-09 — Completado M5. Suite E2E ejecutada con 67/67 tests pasando (100% éxito en 22.79s). `@mocter/domain` compilado con TypeScript estricto. Contenedores reiniciados y respondiendo HTTP 200 OK (`{"status":"ok"}` en admin-portal y `{"status":"healthy"}` en web-portal).
  - TNT-RF-05.1 a TNT-RF-05.4, TNT-D-01 a TNT-D-03, CA-TNT-01 a CA-TNT-05.

## Fase 6 · Auditoría de Código y Remediación Arquitectónica Post-Implementación

- [x] **TNT-T-06 · Remediación integral de hallazgos del Code Review y endurecimiento según `AGENTS.md`**
  - **Promoción Atómica de Credenciales y Capacidad (`TNT-RF-03.2`, `AUTH-D-01`)**: En `TenantOnboardingService.completeStep1Business`, se incorporó validación estricta de cupo en celda (`currentClients < maxClients`), incremento de `currentClients` e inserción atómica de credenciales en `pg-cell-XX` con purga de `passwordHash = null` e `identityLocation = cellId` en `db-portal`.
  - **Cuota de Almacenamiento y Protección S3 (`TNT-RF-04.3`, `CA-TNT-04`)**: En `TenantWorkspaceService.uploadProductMedia`, se implementó validación de cuota `storage_bytes` contra `planLimits`, verificación de pertenencia del producto al inquilino bajo RLS y aborto estricto con error ante fallos de carga en SeaweedFS.
  - **Trazabilidad de Membresía y Manejo de Inquilinos Suspendidos (`TNT-RF-02.1`)**: En `resolveAuthenticatedPortalContext`, se añadió verificación de membresía activa para roles de agente celular y en `WorkspaceSubtreeLayout` se redirigen cuentas suspendidas a login sin derivar a onboarding.
  - **Atomicidad Transaccional de Migraciones (`M5`)**: En `CellMigrationService.executeCellMigrations`, se encapsuló la ejecución DDL y el registro en `drizzle.__drizzle_migrations` dentro de una transacción de celda única (`cellDb.transaction`), impidiendo estados de esquema inconsistentes.
  - **Cumplimiento de Reglas `AGENTS.md` (§4.12, §4.14, §4.16, §4.18)**: Centralizadas variables `IMGPROXY_*` en `packages/domain/src/utils/env.ts` y `apps/admin/env.ts` vía `@t3-oss/env-*`; sanitizada redirección `returnTo` en `apps/web/components/auth/login-form.tsx` contra Open Redirects; eliminada exposición de errores internos en `/api/tenant/media/upload`; y resueltos todos los errores de tipado `tsc --noEmit` en `apps/admin`.
  - **Verificación Final**: 77/77 tests E2E pasando (100% de éxito en 30.52s), `@mocter/domain` compilado con código 0, contenedores `mocter-core-admin-portal-1` y `mocter-core-web-portal-1` reiniciados y con estado HTTP 200 en `/api/health`.



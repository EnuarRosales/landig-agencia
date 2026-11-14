# SPEC-16 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Completar método `getTenantReferralsOverview` en `ReferralsService` y conexión con `SPEC-04`**
  - **Archivos:** `packages/domain/src/services/referrals.service.ts`, `packages/domain/src/services/referrals.service.test.ts`, `packages/domain/src/services/checkout.service.ts`.
  - **Detalle:** Generar URL de referido usando variable de `env.ts`, proyectar historial sin exponer PII ajena, conectar `qualifyReferral` al flujo de pago confirmado (incluyendo Bre-B aprobado) y validar canje FEFO en checkout.
  - **Verificación:** `pnpm --filter @mocter/domain test referrals referral-credit`.

- [ ] **T-02 · Crear endpoint `GET /api/tenant/referrals` y verificar captura `?r=` en registro**
  - **Archivos:** `apps/admin/app/api/tenant/referrals/route.ts` [Nuevo], tests en `apps/admin/app/api/tenant/tenant-routes.test.ts`, flujo de registro si requiere preservar `referralCode`.
  - **Detalle:** Exigir `tenancy_owner` (`403` para agentes), `handle()` RFC 9457 y paginación validada con Zod.
  - **Verificación:** Tests de integración HTTP (`200`, `400`, `403`).

- [ ] **T-03 · Crear `/workspace/referrals` y registrar acceso en `TenantWorkspaceShell`**
  - **Archivos:** `apps/admin/app/workspace/referrals/page.tsx` [Nuevo], `apps/admin/app/workspace/referrals/referrals-view.tsx` [Nuevo], `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Tarjeta de enlace compartible con botón copiar, 4 KPIs de métricas/saldo, tabla paginada estándar (`SPEC-17`), tabla de créditos vigentes y CTA hacia `/workspace/billing` (`es`/`en`, Title Case, Mobile First).
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-04 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/workspace/referrals`.


# SPEC-16 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Esquema Drizzle, migración `0044` y evento de notificación `SPEC-14`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/users.ts`, `packages/domain/src/db/schemas/admin/referrals.ts`, `packages/domain/drizzle/0044_spec16_referrals_attribution_and_redemptions.sql`, `packages/domain/drizzle/meta/_journal.json`, `packages/domain/src/services/notifications-and-leads.service.ts`, `packages/domain/src/services/notification-dispatcher.service.ts`, `packages/domain/src/services/breb-qr.service.ts`.
  - **Detalle:** Añadir `users.referred_by_code`, `referrals.attributed_ip_hash` y tabla `referral_reward_redemptions` con comentarios SQL (`AGENTS.md §4.5`); exportar `generateQrSvgDataUrl`; registrar evento bilingüe `referral.reward_credited` en `SPEC-14`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y tests de esquema/notificaciones.

- [x] **T-02 · Motor `ReferralsService`, repositorio Drizzle, antifraude y `ReferralCreditBillingManager`**
  - **Archivos:** `packages/domain/src/repositories/referrals.repository.interface.ts`, `packages/domain/src/repositories/drizzle-referrals.repository.ts`, `packages/domain/src/services/referrals.service.ts`, `packages/domain/src/services/referral-credit-billing.manager.ts`, tests unitarios.
  - **Detalle:** Implementar `getTenantReferralsOverview` con `{baseUrl}/r/{code}`, QR SVG, enmascaramiento de comercios, paginación y ledger de redenciones; blindar antifraude (`tax_id`/DNI + IP HMAC) en atribución y calificación; fijar moneda `program.currency` en recompensas `fixed`; corregir deducción FEFO multi-reward idempotente y conectar notificaciones `referral.registered` y `referral.reward_credited`.
  - **Verificación:** `pnpm --filter @mocter/domain test referrals referral-credit`.

- [x] **T-03 · Integración con `SPEC-04` (`CheckoutService`, `BillingService`, `WorkspaceBillingDto` y webhooks)**
  - **Archivos:** `packages/domain/src/services/checkout.service.ts`, `packages/domain/src/services/billing.service.ts`, `packages/domain/src/services/tenant-workspace.service.ts`, `apps/admin/app/api/billing/checkout/route.ts`, `apps/admin/app/api/webhooks/wompi/route.ts`, `apps/admin/app/api/webhooks/stripe/route.ts`, tests.
  - **Detalle:** Soportar `applyReferralCredits` en checkout con liquidación inmediata `$0` (`gateway: "referral_credit"`), deducción FEFO al confirmar pago en `registerPayment` / `reviewManualBreBReport`, calificación automática `qualifyReferral()` al primer pago efectivo, y exponer `availableReferralCreditCents` en `getBillingDetails`.
  - **Verificación:** `pnpm --filter @mocter/domain test checkout billing` y tests de rutas billing/webhooks.

- [x] **T-04 · Atribución cross-portal (`apps/web` `/r/[code]` + `/register` → `apps/admin` Onboarding Paso 1)**
  - **Archivos:** `apps/web/app/r/[code]/route.ts` [Nuevo], `apps/web/app/[locale]/(auth)/register/page.tsx`, `apps/web/components/auth/register-view.tsx`, `apps/web/components/auth/register-form.tsx`, `apps/web/app/api/auth/register/route.ts`, `packages/domain/src/auth/validation.ts`, `packages/domain/src/services/auth.service.ts`, `packages/domain/src/services/tenant-onboarding.service.ts`, `apps/admin/app/api/tenant/onboarding/route.ts`, `apps/admin/env.ts`.
  - **Detalle:** Capturar código vía `/r/[code]` (cookie `HttpOnly` `mocter_ref`) y `?r=`/`?ref=`, persistir `referred_by_code` en `admin.users` al registrar y ejecutar `attributeReferral()` automáticamente en Onboarding Paso 1.
  - **Verificación:** Tests de ruta `/r/[code]`, registro y onboarding.

- [x] **T-05 · Endpoint `GET /api/tenant/referrals`, vista `/workspace/referrals`, `TenantWorkspaceShell` y toggle en `/workspace/billing`**
  - **Archivos:** `apps/admin/app/api/tenant/referrals/route.ts` [Nuevo], `apps/admin/app/workspace/referrals/page.tsx` [Nuevo], `apps/admin/app/workspace/referrals/referrals-view.tsx` [Nuevo], `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/components/billing-checkout-panel.tsx`, `apps/admin/app/workspace/billing/billing-view.tsx`, `apps/admin/lib/i18n.ts`, tests.
  - **Detalle:** Endpoint protegido solo propietarios (`403` agentes) con Zod y RFC 9457; UI Mobile First en Title Case (`es`/`en`) con enlace, Copiar Enlace, Copiar Código, QR descargable, 4 KPIs, `DataTable` de Comercios Invitados, tabla de Créditos y Redenciones y toggle FEFO en `/workspace/billing`.
  - **Verificación:** Tests de rutas tenant y vistas workspace en `@mocter/admin`.

- [x] **T-06 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm --filter @mocter/domain exec drizzle-kit check`, migración aplicada en BD local, `pnpm lint`, `pnpm test`, compilación y reinicio de servicios Docker afectados (`mocter-core-admin-portal-1` y `mocter-core-web-portal-1`), verificación HTTP 200 y logs limpios.

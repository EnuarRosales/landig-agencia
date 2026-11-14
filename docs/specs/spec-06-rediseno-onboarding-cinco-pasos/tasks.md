# SPEC-06 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Actualizar esquema `onboarding_sessions` a 5 pasos y helper compartido de rentabilidad**
  - **Archivos:** `packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`, `packages/domain/src/utils/pricing-margin.ts` [Nuevo], `packages/domain/drizzle/*` [Migración si el enum/check constraint en BD lo restringe].
  - **Detalle:** Actualizar `currentStep` al flujo de 5 pasos (`business`, `plan`, `product`, `assistant_payments`, `billing`, `completed`) y crear función pura `calculateProductProfitability` con pruebas unitarias.
  - **Verificación:** `pnpm --filter @mocter/domain test pricing-margin` y `drizzle-kit check`.

- [ ] **T-02 · Refactorizar `TenantOnboardingService` y endpoint `/api/tenant/onboarding`**
  - **Archivos:** `packages/domain/src/services/tenant-onboarding.service.ts`, `packages/domain/src/services/tenant-onboarding.service.test.ts`, `apps/admin/app/api/tenant/onboarding/route.ts`, `apps/admin/app/api/tenant/onboarding/route.test.ts`.
  - **Detalle:** Soportar guardado progresivo por paso (`1..5`), retrocompatibilidad con sesiones heredadas, integración con `TenantProfileService` (`SPEC-05`), `TenantProductsAndMediaService` (`SPEC-08` costo/venta), `BotService` + etiquetas predeterminadas Chatwoot (`SPEC-10`) y `CheckoutService`/Trial (`SPEC-04`).
  - **Verificación:** `pnpm test onboarding`.

- [ ] **T-03 · Estandarizar Logo de Mocter en Onboarding y modularizar componentes Step 1..5**
  - **Archivos:** `apps/admin/app/onboarding/layout.tsx`, `apps/admin/app/onboarding/tenant-onboarding-wizard.tsx`, `apps/admin/app/onboarding/steps/step-business.tsx` [Nuevo], `step-plan.tsx` [Nuevo], `step-product.tsx` [Nuevo], `step-assistant-payments.tsx` [Nuevo], `step-billing.tsx` [Nuevo], diccionarios i18n `es`/`en`.
  - **Detalle:** Reemplazar asistente de 3 pasos por los 5 pasos modulares; integrar logotipo oficial idéntico al de Login/Registro (`ONB-01`); conectar `<AiEnhanceTextarea />` (`SPEC-02`), `<CatalogQuotaBanner />` (`SPEC-03`) y `<BillingCheckoutPanel />` (`SPEC-04`); mostrar cálculo en vivo de utilidad en Paso 3; labels en Title Case, Mobile First y cero diálogos nativos.
  - **Verificación:** `apps/admin/app/onboarding/tenant-onboarding-wizard.test.tsx`.

- [ ] **T-04 · Pruebas E2E / Integración del flujo completo de Onboarding en 5 pasos**
  - **Archivos:** Suite de pruebas en `apps/admin/app/onboarding/` o `pnpm e2e`.
  - **Detalle:** Cubrir el recorrido completo Paso 1 → Paso 5 tanto iniciando periodo de prueba como reportando pago Bre-B o pagando con Wompi.
  - **Verificación:** `pnpm lint`, `pnpm test`, protocolo de compilación, reinicio Docker y healthcheck HTTP 200 (`AGENTS.md §4.18`).


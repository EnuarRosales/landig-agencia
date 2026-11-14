# SPEC-04 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [ ] **T-01 · Extender esquema de pasarelas (`bre_b`), suscripciones y tabla `billing_manual_payment_reports`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/payment-gateways-config.ts`, `packages/domain/src/db/schemas/admin/billing.ts`, `packages/domain/drizzle/*` [Nueva migración].
  - **Detalle:** Agregar soporte `'bre_b'` con campos de llave/país/QR, columnas de continuidad (`pendingUpgradePlanId`, `d5ReminderSentAt`, `d0ReminderSentAt`) y tabla `billing_manual_payment_reports`. Generar migración SQL + semilla inicial `bre_b` (`isEnabled = false`).
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [ ] **T-02 · Implementar generador de QR Dinámico Bre-B (`BreBQrService`) y pruebas**
  - **Archivos:** `packages/domain/src/services/breb-qr.service.ts` [Nuevo], `packages/domain/src/services/breb-qr.service.test.ts` [Nuevo].
  - **Detalle:** Construir payload interoperable con monto exacto en COP, CRC-16 CCITT y generación SVG determinística; validar restricción exclusiva `country === 'CO'` y `currency === 'COP'`.
  - **Verificación:** `pnpm --filter @mocter/domain test breb-qr`.

- [ ] **T-03 · Extender `CheckoutService` y `BillingService` con Bre-B, Trial, Upgrade y Continuidad**
  - **Archivos:** `packages/domain/src/services/checkout.service.ts`, `packages/domain/src/services/checkout.service.test.ts`, `packages/domain/src/services/billing.service.ts`, `packages/domain/src/services/billing.service.test.ts`.
  - **Detalle:** Implementar filtrado de canales habilitados (`isEnabled`), activación `trialing`, `submitManualBreBReport` con almacenamiento privado en SeaweedFS y garantía de continuidad (nuevo=`trialing`, antiguo=plan vigente), y transacción atómica `reviewManualBreBReport` (aprobación/rechazo con motivo obligatorio).
  - **Verificación:** Suite unitaria cubriendo los escenarios de nuevo en trial, antiguo en upgrade, rechazo sin afectar plan base y bloqueo por doble reporte.

- [ ] **T-04 · Implementar servicio idempotente de recordatorios `D-5` y `D-0`**
  - **Archivos:** `packages/domain/src/services/billing-reminders.service.ts` [Nuevo], `packages/domain/src/services/billing-reminders.service.test.ts` [Nuevo].
  - **Detalle:** Detección diaria de vencimientos en ventana `D-5` y `D-0` sin duplicar envíos ni olvidar zonas horarias.
  - **Verificación:** `pnpm --filter @mocter/domain test billing-reminders`.

- [ ] **T-05 · Remediar `/api/billing/checkout` y crear endpoints de Trial, Bre-B y Revisión Admin**
  - **Archivos:** `apps/admin/app/api/billing/checkout/route.ts`, `apps/admin/app/api/billing/checkout/route.test.ts`, `apps/admin/app/api/tenant/billing/trial/route.ts` [Nuevo], `apps/admin/app/api/tenant/billing/bre-b/report/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/gateways/route.ts`, `apps/admin/app/api/admin/billing/manual-reports/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/manual-reports/[id]/review/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/manual-reports/[id]/voucher/route.ts` [Nuevo].
  - **Detalle:** Eliminar `{} as any` y `catch (error: any)` en checkout; envolver todos los handlers en `handle()` RFC 9457; reforzar RBAC (`tenancy_owner` en inquilino, `platform_*` en revisión admin).
  - **Verificación:** Tests de integración HTTP (`route.test.ts`).

- [ ] **T-06 · Actualizar Backoffice SaaS (`/admin/billing`) con toggles de canales, config Bre-B y bandeja de revisión**
  - **Archivos:** `apps/admin/app/admin/billing/gateways-config-form.tsx`, `apps/admin/app/admin/billing/billing-tabs-view.tsx`, `apps/admin/app/admin/billing/manual-breb-reports-table.tsx` [Nuevo], `apps/admin/app/admin/billing/page.test.tsx`.
  - **Detalle:** Agregar configuración Bre-B con interruptor `isEnabled`, tabla paginada/filtrable de comprobantes pendientes con visor seguro y modal `--dsn-*` para aprobar/rechazar (sin `window.confirm`, labels en Title Case, i18n `es`/`en`).
  - **Verificación:** `apps/admin/app/admin/billing/page.test.tsx`.

- [ ] **T-07 · Actualizar UI Inquilino (`/workspace/billing`, banner `D-5`/`D-0` y componente compartible para Paso 5)**
  - **Archivos:** `apps/admin/app/workspace/billing/billing-view.tsx`, `apps/admin/components/billing-checkout-panel.tsx` [Nuevo — reutilizable en Onboarding Paso 5 y `/workspace/billing`], `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Mostrar selector de renovación/upgrade, canales habilitados, QR dinámico Bre-B + botón copiar llave + carga de comprobante + estado de verificación continua; banner de expiración `<= 5 días`. Cero códigos internos en UI.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [ ] **T-08 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/admin/billing` y `/workspace/billing`.

- [ ] **T-09 [HUMANO] · Registrar llave oficial Bre-B y validar lectura del QR Dinámico con app bancaria real**
  - **Detalle:** El propietario de la plataforma configura la llave oficial Bre-B en `/admin/billing` (en Colombia), genera un checkout de prueba en COP y verifica el escaneo del Código QR dinámico desde una aplicación bancaria compatible con Bre-B para validar el prellenado del monto exacto.


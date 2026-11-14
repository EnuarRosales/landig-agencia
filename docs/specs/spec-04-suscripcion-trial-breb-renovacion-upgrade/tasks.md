# SPEC-04 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Extender esquema de pasarelas (`bre_b`), suscripciones y tabla `billing_manual_payment_reports`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/payment-gateways-config.ts`, `packages/domain/src/db/schemas/admin/billing.ts`, `packages/domain/drizzle/*` [Nueva migración].
  - **Detalle:** Agregar soporte `'bre_b'` con campos de llave/país/QR, columnas de continuidad (`pendingUpgradePlanId`, `d5ReminderSentAt`, `d0ReminderSentAt`) y tabla `billing_manual_payment_reports`. Generar migración SQL + semilla inicial `bre_b` (`isEnabled = false`).
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check`.

- [x] **T-02 · Implementar generador de QR Dinámico Bre-B (`BreBQrService`) y pruebas**
  - **Archivos:** `packages/domain/src/services/breb-qr.service.ts` [Nuevo], `packages/domain/src/services/breb-qr.service.test.ts` [Nuevo].
  - **Detalle:** Construir payload interoperable con monto exacto en COP, CRC-16 CCITT y generación SVG determinística; validar restricción exclusiva `country === 'CO'` y `currency === 'COP'`.
  - **Verificación:** `pnpm --filter @mocter/domain test breb-qr`.

- [x] **T-03 · Extender `CheckoutService` y `BillingService` con Bre-B, Trial, Upgrade y Continuidad**
  - **Archivos:** `packages/domain/src/services/checkout.service.ts`, `packages/domain/src/services/checkout.service.test.ts`, `packages/domain/src/services/billing.service.ts`, `packages/domain/src/services/billing.service.test.ts`.
  - **Detalle:** Implementar filtrado de canales habilitados (`isEnabled`), activación `trialing`, `submitManualBreBReport` con almacenamiento privado en SeaweedFS y garantía de continuidad (nuevo=`trialing`, antiguo=plan vigente), y transacción atómica `reviewManualBreBReport` (aprobación/rechazo con motivo obligatorio).
  - **Verificación:** Suite unitaria cubriendo los escenarios de nuevo en trial, antiguo en upgrade, rechazo sin afectar plan base y bloqueo por doble reporte.

- [x] **T-04 · Implementar servicio idempotente de recordatorios `D-5` y `D-0`**
  - **Archivos:** `packages/domain/src/services/billing-reminders.service.ts` [Nuevo], `packages/domain/src/services/billing-reminders.service.test.ts` [Nuevo].
  - **Detalle:** Detección diaria de vencimientos en ventana `D-5` y `D-0` sin duplicar envíos ni olvidar zonas horarias.
  - **Verificación:** `pnpm --filter @mocter/domain test billing-reminders`.

- [x] **T-05 · Remediar `/api/billing/checkout` y crear endpoints de Trial, Bre-B y Revisión Admin**
  - **Archivos:** `apps/admin/app/api/billing/checkout/route.ts`, `apps/admin/app/api/billing/checkout/route.test.ts`, `apps/admin/app/api/tenant/billing/trial/route.ts` [Nuevo], `apps/admin/app/api/tenant/billing/bre-b/report/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/gateways/route.ts`, `apps/admin/app/api/admin/billing/manual-reports/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/manual-reports/[id]/review/route.ts` [Nuevo], `apps/admin/app/api/admin/billing/manual-reports/[id]/voucher/route.ts` [Nuevo].
  - **Detalle:** Eliminar `{} as any` y `catch (error: any)` en checkout; envolver todos los handlers en `handle()` RFC 9457; reforzar RBAC (`tenancy_owner` en inquilino, `platform_*` en revisión admin).
  - **Verificación:** Tests de integración HTTP (`route.test.ts`).

- [x] **T-06 · Actualizar Backoffice SaaS (`/admin/billing`) con toggles de canales, config Bre-B y bandeja de revisión**
  - **Archivos:** `apps/admin/app/admin/billing/gateways-config-form.tsx`, `apps/admin/app/admin/billing/billing-tabs-view.tsx`, `apps/admin/app/admin/billing/manual-breb-reports-table.tsx` [Nuevo], `apps/admin/app/admin/billing/page.test.tsx`.
  - **Detalle:** Agregar configuración Bre-B con interruptor `isEnabled`, tabla paginada/filtrable de comprobantes pendientes con visor seguro y modal `--dsn-*` para aprobar/rechazar (sin `window.confirm`, labels en Title Case, i18n `es`/`en`).
  - **Verificación:** `apps/admin/app/admin/billing/page.test.tsx`.

- [x] **T-07 · Actualizar UI Inquilino (`/workspace/billing`, banner `D-5`/`D-0` y componente compartible para Paso 5)**
  - **Archivos:** `apps/admin/app/workspace/billing/billing-view.tsx`, `apps/admin/components/billing-checkout-panel.tsx` [Nuevo — reutilizable en Onboarding Paso 5 y `/workspace/billing`], `apps/admin/components/tenant-workspace-shell.tsx`, diccionarios i18n `es`/`en`.
  - **Detalle:** Mostrar selector de renovación/upgrade, canales habilitados, QR dinámico Bre-B + botón copiar llave + carga de comprobante + estado de verificación continua; banner de expiración `<= 5 días`. Cero códigos internos en UI.
  - **Verificación:** `apps/admin/app/workspace/workspace-views.test.tsx`.

- [x] **T-08 · Verificación final y protocolo `AGENTS.md §4.18`**
  - **Comandos:** `pnpm lint`, `pnpm test`, `drizzle-kit check`, build y reinicio de `mocter-core-admin-portal-1`, verificación HTTP 200 en `/admin/billing` y `/workspace/billing`.

---

## Fase 2 · Ajustes Post-Validación Funcional (`T-10` a `T-14`)

- [x] **T-10 · Precios duales por plan (`COP` para Colombia y `USD` para Internacional) en `admin.plans` y `PlanModalDialog`**
  - **Archivos:** `packages/domain/src/db/schemas/admin/plans.ts`, `packages/domain/drizzle/*` [Nueva migración], `apps/admin/app/admin/plans/plan-modal-dialog.tsx`, `apps/admin/app/api/admin/plans/**`, `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/services/checkout.service.ts`.
  - **Detalle:** Añadir columnas `price_monthly_usd_cents` y `price_annual_usd_cents` a `admin.plans` (manteniendo `price_monthly_cents` y `price_annual_cents` en `COP` para Colombia), actualizar el formulario de planes en `/admin/billing` para capturar ambas monedas (`COP` y `USD`), normalizar planes existentes y hacer que `getBillingDetails` + `createCheckoutSession` resuelvan autoritativamente el precio en `COP` si `client.country === 'CO'` y en `USD` si `client.country !== 'CO'`.
  - **Verificación:** `pnpm --filter @mocter/domain exec drizzle-kit check` y tests unitarios de `checkout.service.test.ts`.

- [x] **T-11 · Corregir Tag `26` del QR Dinámico Bre-B (`keyValue` en sub-tag `01`) y eliminar «Plantilla De Payload QR (Opcional)»**
  - **Archivos:** `packages/domain/src/services/breb-qr.service.ts`, `packages/domain/src/services/breb-qr.service.test.ts`, `apps/admin/app/admin/billing/gateways-config-form.tsx`, `apps/admin/app/api/admin/billing/gateways/route.ts`.
  - **Detalle:** En `BreBQrService`, codificar en el Tag `26` únicamente sub-tag `00 = "CO.COM.BANREP.BREB"` y sub-tag `01 = safeKey` (`breBKeyValue`), eliminando `keyType` del TLV para que las billeteras bancarias carguen el valor real de la llave. Eliminar del formulario `GatewaysConfigForm` el campo «Plantilla De Payload QR (Opcional)».
  - **Verificación:** `pnpm --filter @mocter/domain test breb-qr`.

- [x] **T-12 · Activación automática de Trial al finalizar Onboarding, eliminación del botón manual «Comenzar Periodo De Prueba» y bloqueo operativo por expiración**
  - **Archivos:** `packages/domain/src/services/tenant-onboarding.service.ts`, `packages/domain/src/services/session-context.service.ts`, `packages/domain/src/services/tenant-workspace.service.ts`, `apps/admin/components/billing-checkout-panel.tsx`, `apps/admin/components/portal-shell-router.tsx`, `apps/admin/components/tenant-workspace-shell.tsx`, `apps/admin/app/workspace/billing/billing-view.tsx`.
  - **Detalle:**
    1. Iniciar automáticamente `subscriptions` en estado `trialing` al activar el comercio en Paso 3 de Onboarding (y auto-inicializar por única vez comercios activos legados sin fila en `subscriptions`).
    2. Eliminar por completo el botón manual «Comenzar Periodo De Prueba» de `BillingCheckoutPanel`.
    3. Impedir cualquier periodo de prueba adicional tras creada la suscripción.
    4. Cuando la suscripción esté vencida (`expired` / fecha superada sin reporte Bre-B en `pending_review`), bloquear el acceso a todas las rutas y módulos de `/workspace/*` excepto `/workspace/billing`, permitiendo únicamente renovar/pagar el plan.
  - **Verificación:** Tests en `tenant-workspace.service.test.ts`, `billing.service.test.ts` y `workspace-views.test.tsx`.

- [x] **T-13 · Compilación, reinicio de contenedores y verificación de salud (`AGENTS.md §4.18`)**
  - **Comandos:** `drizzle-kit check`, tests de `@mocter/domain` y `@mocter/admin`, reinicio de `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, y verificación HTTP 200.

- [x] **T-14 [HUMANO] · Validar lectura real del QR Dinámico Bre-B corregido (monto en COP y llave en sub-tag `01`)**
  - **Detalle:** Verificar desde la app bancaria Bre-B que el campo «Vas a enviar a la llave» cargue el número/llave real configurada (`3208292559`) y «¿Cuánto?» cargue el valor en Pesos Colombianos (`COP`) del plan.

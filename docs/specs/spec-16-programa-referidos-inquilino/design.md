# SPEC-16 · Diseño Técnico: Programa de Referidos en Workspace Inquilino

## 1. Arquitectura de Atribución, Panel y Redención

```mermaid
flowchart LR
    ShortLink["GET /r/[code] (apps/web)"] -->|Cookie HttpOnly mocter_ref + 307| Register["/register?r=CODE + POST /api/auth/register"]
    Register -->|Persiste users.referred_by_code| Onboarding["Onboarding Paso 1 (apps/admin)"]
    Onboarding -->|Crea admin.clients + attributeReferral()| ReferralsDB[("admin.referrals<br/>status=pending + ip_hash")]
    ReferralsDB -->|SPEC-14| NtfReg["referral.registered (Email + In-App)"]
    FirstPay["Primer Pago Confirmado<br/>(Wompi / Stripe / Bre-B aprobado)"] -->|qualifyReferral() + antifraude tax_id/IP| RewardsDB[("admin.referral_rewards<br/>status=available")]
    RewardsDB -->|SPEC-14| NtfCred["referral.reward_credited (Email + In-App)"]
    OwnerUI["/workspace/referrals"] -->|GET /api/tenant/referrals| ReferralsSvc["ReferralsService.getTenantReferralsOverview()"]
    ReferralsSvc --> CodesDB[("admin.referral_codes")]
    ReferralsSvc --> RewardsDB
    ReferralsSvc --> RedemptionsDB[("admin.referral_reward_redemptions")]
    RewardsDB -->|FEFO Toggle en /workspace/billing| Checkout["CheckoutService + BillingService"]
    Checkout -->|Total = 0: liquidación inmediata / Total > 0: deducción al confirmar pago| RedemptionsDB
```

---

## 2. Esquema de Base de Datos y Migración (`0044`)

1. **`packages/domain/src/db/schemas/admin/users.ts`:**
   - Añadir columna nullable `referredByCode: varchar("referred_by_code", { length: 32 })`.
2. **`packages/domain/src/db/schemas/admin/referrals.ts`:**
   - Añadir columna nullable `attributedIpHash: varchar("attributed_ip_hash", { length: 128 })` en `admin.referrals`.
   - Crear tabla `admin.referral_reward_redemptions`:
     - `id` (`uuid`, PK `uuidv7()`), `rewardId` (FK `admin.referral_rewards.id`), `invoiceId` (FK `admin.invoices.id`), `clientId` (FK `admin.clients.id`), `amountCents` (`bigint` `> 0`), `currency` (`varchar(3)` `IN ('COP', 'USD')`), `redeemedAt` (`timestamptz`), `...auditColumns()`.
     - Índice único `referral_reward_redemptions_reward_invoice_unique (reward_id, invoice_id)` e índices por `client_id` e `invoice_id`.
3. **Migración SQL `packages/domain/drizzle/0044_spec16_referrals_attribution_and_redemptions.sql`:**
   - `ALTER TABLE` + `CREATE TABLE` + `COMMENT ON TABLE/COLUMN` (`AGENTS.md §4.5`) + actualización de `drizzle/meta/_journal.json`.

---

## 3. Componentes Técnicos

### 3.1 `packages/domain`
1. **`breb-qr.service.ts`:**
   - Exportar helper genérico `generateQrSvgDataUrl(payload: string): string` reutilizando `buildQrMatrix` y `renderQrMatrixToSvg`.
2. **`referrals.repository.interface.ts` y `drizzle-referrals.repository.ts`:**
   - Añadir consultas de soporte para el panel del inquilino y antifraude:
     - `listReferralsByReferrerPaginated(referrerClientId, { page, limit, status })` haciendo `LEFT JOIN` a `clients` (solo `displayName` para enmascarar) y `referral_rewards` (monto/moneda).
     - `listRewardsByReferrer(referrerClientId)` (todos los lotes del comercio ordenados por vencimiento/creación).
     - `listRedemptionsByReferrer(referrerClientId)` haciendo `INNER JOIN` a `invoices` (`invoiceNumber`).
     - `getClientFraudFingerprint(clientId)` consultando `clients.taxId` y `client_billing_profiles.dni`.
     - `countReferralsByIpHash(referrerClientId, ipHash, since)` y `hasIpCollisionWithReferrer(referrerClientId, ipHash)`.
     - `redeemCreditsFefoForInvoice({ clientId, invoiceId, maxAmountCents, currency, executedBy })`: descuenta múltiples recompensas en orden FEFO (`expires_at ASC`) registrando cada movimiento en `referral_reward_redemptions` de forma idempotente (`ON CONFLICT DO NOTHING`).
3. **`referrals.service.ts`:**
   - Exportar `maskBusinessName(displayName: string): string` (ej. `"Café Andes"` → `"Café An***"`).
   - Exportar `hashReferralIp(ip: string, pepper: string): string` (HMAC-SHA256).
   - Extender `attributeReferral`: validar IP HMAC, `tax_id`/DNI, persistir `attributedIpHash`, y disparar `referral.registered` (`SPEC-14`).
   - Extender `qualifyReferral`: validar antifraude `tax_id`/DNI (`clients.tax_id` + `client_billing_profiles.dni`) al momento del primer pago, emitir recompensa `fixed` en `program.currency` (y `percent` en `input.currency`), y disparar `referral.reward_credited` (`SPEC-14`).
   - Añadir `getTenantReferralsOverview(clientId, clientSlug, publicBaseUrl, query)` y singleton `getReferralsService()`.
4. **`referral-credit-billing.manager.ts`:**
   - Corregir deducción multi-reward FEFO para iterar y descontar cada recompensa consumida (registrando todas las asignaciones en lugar de sobrescribir un único `appliedCreditId`).
5. **`checkout.service.ts` y `billing.service.ts`:**
   - `CheckoutService.createCheckoutSession`: aceptar `applyReferralCredits?: boolean` (default `true`). Consultar saldo FEFO en la moneda de la factura.
     - Si el crédito cubre el 100% (`totalCents === 0`), emitir factura `paid`, deducir FEFO en `referral_reward_redemptions`, crear pago/recibo interno, activar/renovar suscripción y retornar `gateway: "referral_credit"`.
     - Si queda saldo neto `> 0`, persistir `creditCents` planificado y `totalCents` neto para Wompi/Stripe/Bre-B sin descontar aún los lotes de crédito.
   - `BillingService.registerPayment` y `BillingService.reviewManualBreBReport` (acción `approve`):
     - Al confirmar el pago, si `invoice.creditCents > 0`, consolidar idempotentemente `redeemCreditsFefoForInvoice(...)`.
     - Invocar idempotentemente `ReferralsService.qualifyReferral(...)` para el `clientId` (califica solo si tiene referido `pending`).
6. **`notifications-and-leads.service.ts` y `notification-dispatcher.service.ts`:**
   - Registrar evento canónico `referral.reward_credited` (`category: "referral"`, remitente `referidos`, `tenantConfigurable: true`, variables `["referrer_name", "referred_name", "reward_amount", "currency", "expires_at", "referrals_url"]`) con plantillas bilingües `es`/`en` y añadirlo a `TENANT_COMPETENCE_EVENT_KEYS`.
7. **`auth.service.ts` y `tenant-onboarding.service.ts`:**
   - Aceptar `referralCode?: string` opcional en `registerUserSchema` / `authService.register` y persistirlo en `admin.users.referred_by_code`.
   - Al crear `admin.clients` en Onboarding Paso 1 (`saveBusinessStep`), leer `referred_by_code` (de `users` o cookie fallback) e invocar `ReferralsService.attributeReferral()` con IP hasheada.
8. **`tenant-workspace.service.ts`:**
   - Incluir `availableReferralCreditCents` y `referralCreditCurrency` en `WorkspaceBillingDto` (`getBillingDetails`).

### 3.2 `apps/web`
1. **`apps/web/app/r/[code]/route.ts` [Nuevo]:**
   - Valida formato del código, establece cookie `HttpOnly` `mocter_ref` (`SameSite=Lax`, `Max-Age` 60 días) y redirige `307` a `/es/register?r={CODE}` (respetando locale si existe).
2. **`apps/web/app/[locale]/(auth)/register/page.tsx`, `register-view.tsx`, `register-form.tsx` y `apps/web/app/api/auth/register/route.ts`:**
   - Leer `?r=` / `?ref=` o cookie `mocter_ref`, mostrar insignia de código aplicado y reenviar `referralCode` al endpoint `POST /api/auth/register` (que también toma `mocter_ref` de cookie como respaldo).

### 3.3 `apps/admin`
1. **`apps/admin/env.ts`:** Añadir `NEXT_PUBLIC_APP_URL` en `client` y `runtimeEnv`.
2. **`apps/admin/app/api/tenant/referrals/route.ts` [Nuevo]:**
   - `GET` envuelto en `handle()` RFC 9457, exige propietario (`requireTenantBillingOwner` o helper equivalente de propietario), valida query params con Zod (`page`, `limit`, `status`) y registra evento Pino `tenant.referrals.panel_loaded`.
3. **`apps/admin/app/api/billing/checkout/route.ts`:** Aceptar `applyReferralCredits` booleano (default `true`).
4. **`apps/admin/app/api/webhooks/wompi/route.ts` y `stripe/route.ts`:** Conectar el export `POST` a `getBillingService()` (lazy) en lugar de `{}` stub.
5. **`apps/admin/app/api/tenant/onboarding/route.ts`:** Pasar cookie fallback `mocter_ref` e IP del cliente al Paso 1 de onboarding para atribución automática.
6. **`apps/admin/app/workspace/referrals/page.tsx` [Nuevo] y `referrals-view.tsx` [Nuevo]:**
   - Layout perimetral `w-full space-y-6 p-4 md:px-8 md:py-6`.
   - Enlace + Copiar Enlace + Copiar Código + QR SVG descargable + 4 KPIs + `DataTable` de Comercios Invitados + sección Créditos y Redenciones + CTA a `/workspace/billing`.
7. **`apps/admin/components/tenant-workspace-shell.tsx` y `apps/admin/lib/i18n.ts`:**
   - Añadir ítem **Programa de Referidos** (`href: "/workspace/referrals"`, `ownerOnly: true`) y todas las cadenas `es`/`en` en Title Case gramatical.
8. **`apps/admin/components/billing-checkout-panel.tsx` y `apps/admin/app/workspace/billing/billing-view.tsx`:**
   - Mostrar saldo de crédito disponible, toggle «Aplicar Crédito de Referidos» (activo por defecto), desglose Subtotal / Crédito / Neto y feedback de activación inmediata cuando `gateway === "referral_credit"`.

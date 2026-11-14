# SPEC-16 · Diseño Técnico: Programa de Referidos en Workspace Inquilino

## 1. Arquitectura de Atribución, Panel y Redención

```mermaid
flowchart LR
    Landing["Registro (?r=CODE)"] -->|Captura atribución| AuthReg["Alta Comercio + ReferralsService.attribute()"]
    FirstPay["Primer Pago Confirmado<br/>(Wompi / Stripe / Bre-B aprobado - SPEC-04)"] -->|qualifyReferral()| RewardsDB[("admin.referral_rewards<br/>status=available")]
    OwnerUI["/workspace/referrals"] -->|GET /api/tenant/referrals| ReferralsSvc["ReferralsService.getReferrerPanelData()"]
    ReferralsSvc --> CodesDB[("admin.referral_codes")]
    ReferralsSvc --> RewardsDB
    RewardsDB -->|FEFO Discount| Checkout["SPEC-04 /workspace/billing<br/>ReferralCreditBillingManager"]
```

---

## 2. Componentes Técnicos (`packages/domain` y `apps/admin`)

1. **`packages/domain/src/services/referrals.service.ts`:**
   - Añadir método `getTenantReferralsOverview(clientId, clientSlug, publicBaseUrl, query)` que combine `ensureReferralCode`, programa activo actual, resumen de métricas, paginación y proyección segura de referidos (sin exponer PII sensible del comercio referido).
   - Leer `publicBaseUrl` exclusivamente desde `env.ts` (`NEXT_PUBLIC_APP_URL`).
2. **`apps/admin/app/api/tenant/referrals/route.ts` [Nuevo]:**
   - `GET` protegido con `resolveTenantSession`, validando `role === 'tenant_owner'` (`403` si `tenant_agent`), Zod sobre paginación/filtro y `handle()` RFC 9457.
3. **Integración automática con `SPEC-04` (`checkout.service.ts`):**
   - Al aprobar pago manual Bre-B (o webhook Wompi/Stripe `paid`) de la primera factura de un `client_id`, invocar idempotentemente `ReferralsService.qualifyReferral()` y notificar al referente (`SPEC-14`).
4. **UI (`apps/admin/app/workspace/referrals/`):**
   - `page.tsx` [Nuevo] + `referrals-view.tsx` [Nuevo] + enlace en `apps/admin/components/tenant-workspace-shell.tsx` (restringido visualmente a `tenancy_owner`).


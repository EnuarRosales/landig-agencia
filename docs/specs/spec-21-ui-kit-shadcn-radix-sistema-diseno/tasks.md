# SPEC-21 · Plan de Implementación (`tasks.md`)

## Tareas de Implementación

- [x] **T-01 · Crear el paquete `packages/ui` (`@mocter/ui`), hoja unificada `tokens.css`, las 17 primitivas atómicas (Radix + shadcn/ui) y configurar monorepo/Docker**
  - **Archivos:**
    - `packages/ui/package.json` [Nuevo], `packages/ui/tsconfig.json` [Nuevo], `packages/ui/vitest.config.ts` [Nuevo], `packages/ui/components.json` [Nuevo]
    - `packages/ui/src/styles/tokens.css` [Nuevo], `packages/ui/src/lib/utils.ts` [Nuevo], `packages/ui/src/index.ts` [Nuevo]
    - `packages/ui/src/components/{button,input,textarea,label,select,checkbox,switch,badge,dialog,sheet,tabs,tooltip,dropdown-menu,skeleton,empty-state,alert,card}.tsx` [Nuevos]
    - `packages/ui/src/components/__tests__/primitives.test.tsx` [Nuevo]
    - `apps/admin/package.json`, `apps/web/package.json`, `apps/admin/next.config.ts`, `apps/web/next.config.ts`, `apps/admin/app/layout.tsx`, `apps/admin/app/globals.css`, `apps/web/app/globals.css`, `apps/web/lib/design-tokens.test.ts`
    - `Dockerfile`, `docker-compose.yml`
  - **Detalle:** Inicializar `@mocter/ui` con `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` y `lucide-react`; centralizar las 3 capas de tokens de `DSN-001 §3.1` (`--primitive-*`, `--dsn-*` con valores exactos de `DSN-001` incluyendo `#8d8d93`/`#5c5c63` oscuro, `#71717a`/`#a1a1aa` claro y acento cian `#22d3ee`/`#0891b2`, más `--brand-*`) + `@variant dark` + `@theme inline` (`--color-dsn-*`) en `tokens.css`; implementar las 17 primitivas atómicas (incluyendo `<Select />` dual Mobile First + `<CustomSelect />` Radix); registrar `@mocter/ui` en `apps/admin` y `apps/web`; actualizar `apps/web/lib/design-tokens.test.ts` para inspeccionar `tokens.css`; y actualizar `Dockerfile` y `docker-compose.yml` con volúmenes aislados (`ui-node-modules` y `admin-ui-node-modules`).
  - **Verificación:** `pnpm --filter @mocter/ui test`, `pnpm --filter @mocter/web test lib/design-tokens.test.ts` en verde y `tsc --noEmit` sin errores.

- [x] **T-02 · Promover compuestos transversales (`ConfirmationModal`, `WorkspaceDataTable`, `FormSaveBar`, `useUnsavedChangesGuard`) a `@mocter/ui`, migrar componentes compartidos/shells y renovar el catálogo vivo `/design-system`**
  - **Archivos:**
    - `packages/ui/src/lib/{i18n,use-unsaved-changes-guard}.ts` [Nuevos]
    - `packages/ui/src/components/{confirmation-modal,workspace-data-table,form-save-bar}.tsx` [Nuevos]
    - `apps/admin/components/confirmation-modal.tsx`, `apps/admin/components/ui/workspace-data-table.tsx`, `apps/admin/lib/use-unsaved-changes-guard.ts` (re-exports 1:1) y `apps/admin/components/ui/form-save-bar.tsx` (wrapper mínimo con `useRouter().push`)
    - `apps/admin/components/{data-table,admin-shell,tenant-workspace-shell,user-profile-modal,ai-enhance-textarea,phone-e164-input,geo-address-fields,billing-checkout-panel,catalog-quota-banner,theme-toggle,email-rich-text-editor}.tsx`
    - `apps/admin/app/design-system/design-system-playground.tsx`
  - **Detalle:** Promover `ConfirmationModal` (sobre `<Dialog />` y `<Button />`), `WorkspaceDataTable`, `FormSaveBar` y `useUnsavedChangesGuard` a `@mocter/ui` usando diccionario interno `es`/`en` (extensible vía prop `labels`) y `onNavigate` opcional, dejando re-exports 1:1 y wrapper mínimo `useRouter` en `apps/admin`; migrar shells (`AdminShell`, `TenantWorkspaceShell` con drawer móvil `<Sheet />` o diálogo accesible) y widgets de dominio (`PhoneE164Input`, `GeoAddressFields`, `AiEnhanceTextarea`, `UserProfileModal`) a las primitivas de `@mocter/ui`; y actualizar `/design-system` para exhibir e interactuar en vivo con las 17 primitivas + 3 compuestos y los tokens cian canónicos de `DSN-001`.
  - **Verificación:** `pnpm --filter @mocter/admin test confirmation-modal workspace-data-table form-save-bar admin-shell tenant-workspace-shell user-profile-modal geo-and-phone-inputs design-system` en verde.

- [x] **T-03 · Migrar exhaustivamente todas las vistas y modales del Backoffice del Inquilino (`/workspace/*`) y Onboarding (`/onboarding/*`) a `@mocter/ui`**
  - **Archivos:**
    - `apps/admin/app/onboarding/{page,tenant-onboarding-wizard}.tsx` y `apps/admin/app/onboarding/steps/{step-business,step-plan,step-product,step-assistant-payments,step-billing}.tsx`
    - `apps/admin/app/workspace/workspace-dashboard-view.tsx`
    - `apps/admin/app/workspace/products/{products-view,product-form-modal,product-detail-modal}.tsx`
    - `apps/admin/app/workspace/contacts/{contacts-view,contact-detail-modal}.tsx`
    - `apps/admin/app/workspace/orders/{orders-view,order-detail-modal,order-form-modal,order-guide-modal,order-status-modal}.tsx`
    - `apps/admin/app/workspace/conversations/conversations-view.tsx`
    - `apps/admin/app/workspace/bot/bot-view.tsx`
    - `apps/admin/app/workspace/promotions/{promotions-view,promotion-form-modal}.tsx`
    - `apps/admin/app/workspace/community/{community-view,community-feed-tab,community-clones-tab,community-leader-tab,community-network-tab,community-wall-tab}.tsx`
    - `apps/admin/app/workspace/team/team-view.tsx`
    - `apps/admin/app/workspace/referrals/referrals-view.tsx`
    - `apps/admin/app/workspace/notifications/notifications-view.tsx`
    - `apps/admin/app/workspace/profile/profile-view.tsx`
    - `apps/admin/app/workspace/branding/branding-view.tsx`
    - `apps/admin/app/workspace/billing/billing-view.tsx`
    - `apps/admin/app/workspace/ai/ai-settings-view.tsx`
    - `apps/admin/app/workspace/reports/page.tsx`
  - **Detalle:** Reemplazar `<button>`, `<input>`, `<textarea>`, `<select>`, `<label>`, `<div role="dialog">`, tabs, badges y tarjetas manuales por las primitivas exportadas desde `@mocter/ui` (`Button`, `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `Switch`, `Badge`, `Dialog`, `Tabs`, `Alert`, `Card`, `EmptyState`), preservando todos los textos i18n (`es`/`en`), `aria-*` y `data-testid`.
  - **Verificación:** Suite completa de tests de `/workspace/*` y `/onboarding/*` en verde.

- [x] **T-04 · Migrar exhaustivamente todas las vistas del Plano de Control SaaS (`/admin/*`, `/invite/*`) y las vistas de `apps/web` (`components/auth/*`, `components/admin/*`, `demo-form`, `phone-e164-input`, `cookie-preferences`, `theme-toggle`) a `@mocter/ui`**
  - **Archivos:**
    - `apps/admin/app/invite/**/*.tsx`
    - `apps/admin/app/admin/**/{page,*-view,*-form,*-modal,*-dialog,*-actions,*-table,*-section}.tsx` (`ai`, `billing`, `cells`, `communities`, `conversations`, `leads`, `orders`, `plans`, `referrals`, `reports`, `settings/branding`, `settings/notifications`, `tenants`, `users`)
    - `apps/web/components/auth/{login-form,login-view,register-form,register-view,setup-owner-form,setup-password-card,verify-email-card,oauth-buttons}.tsx`
    - `apps/web/components/admin/**/*.tsx`, `apps/web/components/{demo-form,phone-e164-input,cookie-preferences,theme-toggle}.tsx`
  - **Detalle:** Reemplazar controles nativos manuales y diálogos por las primitivas de `@mocter/ui` en todo el Plano de Control SaaS (`/admin/*` e `/invite/*`) y en las vistas de autenticación, paneles administrativos y controles interactivos de `apps/web` (preservando el diseño marketing de `components/sections/*`).
  - **Verificación:** `pnpm --filter @mocter/admin test` y `pnpm --filter @mocter/web test` 100% en verde.

- [x] **T-05 · Crear test de auditoría arquitectónica (`ui-kit-audit.test.ts`), validar compilación y ejecutar protocolo `AGENTS.md §4.18` en contenedores Docker**
  - **Archivos:**
    - `apps/admin/lib/ui-kit-audit.test.ts` [Nuevo]
  - **Detalle:** Verificar programáticamente la exportación de las 17 primitivas + 3 compuestos en `@mocter/ui`, la adopción transversal de `@mocter/ui` en `/workspace/*`, `/admin/*`, `/onboarding/*` y `apps/web/components/auth/*`, la ausencia de `role="dialog"` manuales fuera de `@mocter/ui` y wrappers autorizados, y el cumplimiento de higiene UI (`AGENTS.md §4.8, §4.17, §4.19`). Compilar, reiniciar `mocter-core-admin-portal-1` y `mocter-core-web-portal-1`, y verificar HTTP 200 y logs limpios.
  - **Verificación:** `pnpm --filter @mocter/ui test`, `pnpm --filter @mocter/admin test`, `pnpm --filter @mocter/web test`, `pnpm --filter @mocter/admin build`, `pnpm --filter @mocter/web build` y `docker compose restart admin-portal web-portal` con HTTP 200 en `127.0.0.1:3003` y `127.0.0.1:3001`.

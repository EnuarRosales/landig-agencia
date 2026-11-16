# SPEC-10 · Diseño Técnico: Asistente AI Unificado, Políticas y 6 Mensajes Clave

## 1. Arquitectura de Datos y Sincronización

```mermaid
flowchart TD
    Onb4["Onboarding Paso 4 (SPEC-06)"] -->|Objetivo + Preset + Tono + Mensaje Pedido| BotSvc["BotConfigUnifiedService"]
    BotUI["/workspace/bot (BotView)"] -->|GET / PUT /api/tenant/bot| BotSvc
    BotSvc --> ControlBot[("admin.tenant_bots<br/>admin.bot_presets / admin.bot_tones")]
    BotSvc --> CellInfo[("pg-cell-XX: cell_client_business_info<br/>returns, warranty, shipping, faqs")]
    BotSvc -->|Idempotente| Labels[("pg-cell-XX: cell_tenant_labels")]
    Labels -->|after() no bloqueante| CWLabels["Chatwoot Labels API (solo cuenta tenant)"]
    BotUI -->|Mejorar Con AI| Enhance["POST /api/ai/enhance (SPEC-02)"]
```

---

## 2. Esquema y Semillas (`packages/domain`)

1. **`packages/domain/src/db/schemas/admin/bot-tenancy.ts`:**
   - Añadir `defaultMessages: jsonb("default_messages").$type<TenantBotDefaultMessages>()`, `businessHours: jsonb("business_hours").$type<TenantBusinessHours>()` y `classifierPrompt: text("classifier_prompt")` en `tenantBots`.
   - `businessHours.timezone` se inicializa por defecto desde `clients.timezone` / `clients.country_code` (`SPEC-20`).
2. **`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts` (`cell_client_business_info` y `cell_tenant_labels`):**
   - Mantener `cell_client_business_info.shipping_policy` como `JSONB` estructurado extendido: `{ freeShipping: boolean; defaultCostCents: number; policyText?: string; deliveryRules?: Array<{ regionCode: string | null; city: string | null; days: string }> }`, compatible con Onboarding Paso 4 (`SPEC-06`).
   - Extender `cell_tenant_labels` con `category` (`'operational' | 'functional'`), `activation_rule` y `side_effects` para persistir tanto las 6 etiquetas operacionales de `SPEC-10` como las 5 funcionales de `SPEC-19` y etiquetas personalizadas creadas en `/workspace/bot`.
3. **`packages/domain/src/services/bot-catalog.seed.ts` + `ai-assist-catalog.seed.ts`:**
   - Verificar catálogo semilla con objetivos estándar (`sales_and_order_capture`, `consultative_advisory`, `customer_support_and_tracking`, `lead_qualification`), presets (`bot_presets`) y tonos (`bot_tones`) completos en `es`/`en`.
   - Añadir diccionario semilla de **6 mensajes por defecto** en `es` y `en` con placeholders internacionales (`{{customer_name}}`, `{{customer_phone}}`, `{{order_number}}`, `{{payment_instructions}}`, `{{shipping_summary}}`, `{{carrier_name}}`, `{{tracking_code}}`, `{{business_name}}`) + los 7 `field_key` correspondientes en `ai_assist_fields` / `ai_assist_prompts` (`bot.msg_welcome`, `bot.msg_order_confirmation`, `bot.msg_dispatch_tracking`, `bot.msg_delivery_issue`, `bot.msg_out_of_hours`, `bot.msg_handoff`, `policy.shipping`).
4. **Unificación de migraciones con `SPEC-20`:**
   - Central DB (`packages/domain/drizzle/0037_*`): combina columnas de `SPEC-20` (`admin.clients`, `admin.geo_provider_locations`) y `SPEC-10`+`SPEC-19` (`admin.tenant_bots`).
   - Cell DB (`packages/domain/drizzle-cell/0017_*` + `0018_*_rls_grants_comments.sql`): combina columnas geográficas/E.164 de `SPEC-20` (`contacts`, `contact_addresses`, `conversation_state`, `orders`) y `SPEC-10`+`SPEC-19` (`cell_tenant_labels`).

---

## 3. Servicios (`packages/domain`)

1. **`packages/domain/src/services/bot.service.ts` + `tenant-workspace.service.ts`:**
   - Unificar lectura `getUnifiedTenantBotConfig(clientId)` mezclando `tenantBots` (incluyendo `instructions` y `classifierPrompt`), catálogos activos (`botPresets`, `botTones`), `cellClientBusinessInfo` (hidratando `default_messages.order_confirmation` si viene de legado y serializando `shippingPolicy` estructurado) y estado de etiquetas `cellTenantLabels` (`SPEC-10` + `SPEC-19`).
   - Método `ensureDefaultChatwootLabels(clientId)`: inserta las etiquetas canónicas (6 operacionales `SPEC-10` + 5 funcionales `SPEC-19`) en `cell_tenant_labels` con `ON CONFLICT DO NOTHING` y, si el comercio ya tiene `chatwoot_accounts` provisionado (`accountId`), sincroniza etiquetas vía cliente REST Chatwoot en `after()` (sin tocar endpoints admin).
2. **Integración en runtime (`packages/domain/src/services/prompt-composer.ts` + `bot-ui-helpers.ts`):**
   - Leer `shippingPolicy` (`policyText` + `defaultCostCents` + `freeShipping` + `deliveryRules`), `defaultMessages` y `instructions` para alimentar los prompts del bot conversacional en producción.
   - Actualizar `ClientGeneralPromptContext` (`apps/admin/app/workspace/bot/bot-ui-helpers.ts`) para aceptar `countryCode` (`SPEC-20`) y `shippingPolicy`, adaptando terminología territorial y moneda al país del comercio.

---

## 4. Interfaz y API (`apps/admin`)

- **`apps/admin/app/api/tenant/bot/route.ts`:** Reescribir `GET` y `PUT` con `handle()` RFC 9457, RBAC estricto (`tenancy_owner` en `PUT`), Zod extendido para los 6 mensajes, `shippingPolicy` JSONB estructurado, `objective`, `presetId`, `toneId`, `businessHours`, `instructions`, `classifierPrompt`, etiquetas `SPEC-19`, y guardarraíles.
- **`apps/admin/app/workspace/bot/bot-view.tsx`:** Dividir en subcomponentes limpios (`bot-identity-tab.tsx`, `bot-policies-tab.tsx`, `bot-messages-tab.tsx` [Nuevos]) cada uno usando `<AiEnhanceTextarea />`, barra de guardado compartida con el pie (`SPEC-17`), Mobile First, Title Case y modales `--dsn-*` para eliminar FAQs o restaurar un mensaje a su texto base.

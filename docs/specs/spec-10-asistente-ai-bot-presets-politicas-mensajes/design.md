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
   - Añadir `defaultMessages: jsonb("default_messages").$type<TenantBotDefaultMessages>()` y `businessHours: jsonb("business_hours").$type<TenantBusinessHours>()` en `tenantBots`.
2. **`packages/domain/src/services/bot-catalog.seed.ts`:**
   - Verificar catálogo semilla con objetivos estándar (`sales_and_order_capture`, `consultative_advisory`, `customer_support_and_tracking`, `lead_qualification`), presets (`bot_presets`) y tonos (`bot_tones`) completos en `es`/`en`.
   - Añadir diccionario semilla de **6 mensajes por defecto** en `es` y `en` + los 6 `field_key` correspondientes en `ai_assist_fields` / `ai_assist_prompts` (`bot.msg_welcome`, `bot.msg_order_confirmation`, `bot.msg_dispatch_tracking`, `bot.msg_delivery_issue`, `bot.msg_out_of_hours`, `bot.msg_handoff`, `policy.shipping`).

---

## 3. Servicios (`packages/domain`)

1. **`packages/domain/src/services/bot.service.ts` + `tenant-workspace.service.ts`:**
   - Unificar lectura `getUnifiedTenantBotConfig(clientId)` mezclando `tenantBots`, catálogos activos (`botPresets`, `botTones`), `cellClientBusinessInfo` (hidratando `default_messages.order_confirmation` si viene de legado) y estado de etiquetas `cellTenantLabels`.
   - Método `ensureDefaultChatwootLabels(clientId)`: inserta las 6 etiquetas canónicas en `cell_tenant_labels` con `ON CONFLICT DO NOTHING` y, si el comercio ya tiene `chatwoot_accounts` provisionado (`accountId`), sincroniza etiquetas vía cliente REST Chatwoot en `after()` (sin tocar endpoints admin).
2. **Integración en runtime (`packages/domain/src/services/prompt-composer.ts`):**
   - Leer `shippingPolicy`, `defaultMessages` y `botMasterPrompt` para alimentar los prompts del bot conversacional en producción.

---

## 4. Interfaz y API (`apps/admin`)

- **`apps/admin/app/api/tenant/bot/route.ts`:** Reescribir `GET` y `PUT` con `handle()` RFC 9457, RBAC estricto (`tenancy_owner` en `PUT`), Zod extendido para los 6 mensajes, `shippingPolicy`, `objective`, `presetId`, `toneId`, `businessHours`, y guardarraíles.
- **`apps/admin/app/workspace/bot/bot-view.tsx`:** Dividir en subcomponentes limpios (`bot-identity-tab.tsx`, `bot-policies-tab.tsx`, `bot-messages-tab.tsx` [Nuevos]) cada uno usando `<AiEnhanceTextarea />`, barra de guardado compartida con el pie (`SPEC-17`), Mobile First, Title Case y modales `--dsn-*` para eliminar FAQs o restaurar un mensaje a su texto base.


# SPEC-19 · Plan de Tareas · Arquitectura de Prompts IDEAL, Adopción Rápida por Producto y Clasificador Dinámico Funcional/Operativo

| Atributo | Valor |
| --- | --- |
| **ID** | `SPEC-19` |
| **Versión** | `1.0.0` |
| **Depende de** | [`requirements.md`](requirements.md), [`design.md`](design.md) |
| **Estado** | Implementada · Verificada |

---

## Tareas de Implementación

### `T-01` · Estandarización de la Biblioteca de Prompts Maestros SaaS bajo Metodología `IDEAL` y Bloques Técnicos (`@mocter/domain`)
- [x] **T-01.1**: Actualizar `packages/domain/src/services/ai-assist-catalog.seed.ts` incorporando la metodología secuencial **`IDEAL`** (`[I] Intención`, `[D] Detalle`, `[E] Ejemplo`, `[A] Acción`, `[L] Límite` con rol de co-creador proactivo, *Few-Shot*, delimitadores y restricciones negativas) en los prompts maestros, corrigiendo los labels en Español a formato gramatical Title Case (`AGENTS.md §4.8`).
- [x] **T-01.2**: Agregar los nuevos campos asistidos `bot.client_general_prompt` («Prompt General de Operación del Cliente») y `bot.conversation_classifier` («Prompt Clasificador de Conversaciones»), y actualizar `seedAiAssistCatalog()` para promover nuevas versiones sembradas por `system.seed` cuando reemplacen versiones previas de `system.seed`.
- [x] **T-01.3**: Enriquecer `INITIAL_PROMPT_BLOCKS` en `packages/domain/src/services/prompt-blocks.seed.ts` y `composePrompt` en `packages/domain/src/services/prompt-composer.ts` para gobernar las reglas técnicas de multiburbuja (`[[SPLIT]]`, `[[SPLIT:2000]]`, `[[SPLIT:3000]]`), marcadores multimedia por tipo/orden (`[[MEDIA:termino:imagen]]`, `[[MEDIA:termino:video]]`, `[[MEDIA:termino:audio:orden]]`), reglas anti-caption, plantillas de pedido en un solo mensaje (`🏠 Domicilio` vs. `🏢 Oficina de Transportadora`), `clientGeneralPrompt` y `botMasterPrompt` del producto.

### `T-02` · Clasificador Dinámico por Inquilino: Etiquetas Funcionales (Color en Chatwoot) vs. Operativas (Handoff, Pausa de Bot y Correo) (`@mocter/domain`)
- [x] **T-02.1**: Extender `packages/domain/src/services/lead-classifier.ts` con el modelo categorizado `TenantClassifierLabelDefinition` (`category: "functional" | "operational"`), catálogos base `DEFAULT_FUNCTIONAL_LABELS` (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`, `devolucion` con colores orientativos de Chatwoot) y `DEFAULT_OPERATIONAL_LABELS` (`nuevo_pedido`, `pendiente_pago`, `pagado`, `despachado`, `soporte_humano`, `cliente_recurrente` con `sideEffects`), compilador dinámico `buildTenantClassifierPrompt` bajo metodología **`IDEAL`** y resolvedor `resolveTenantConversationClassification`.
- [x] **T-02.2**: Extender `packages/domain/src/services/lead-classifier-orchestrator.ts` para ejecutar la clasificación multidimensional (preservando 100 % de retrocompatibilidad con `classifyAndApply` legado), sincronizar el color orientativo y etiquetas en Chatwoot y disparar los `sideEffects` operativos (`handoff_human`, `pause_bot`, `send_email_notification`, `register_order`).

### `T-03` · Generador de Adopción Rápida `IDEAL` por Producto e Idempotencia en `/workspace/products` (`@mocter/admin`)
- [x] **T-03.1**: Refactorizar `buildRecommendedProductPromptTemplate` e implementar `applyRecommendedProductPromptTemplate` en `apps/admin/app/workspace/products/product-ui-helpers.ts` para auto-hidratar los 5 bloques **`IDEAL`** con los datos reales del formulario (`name`, `description`, `category`, `brand`, `kind`, `compositionType`, `priceAmount`, `currency`, `attributes`, `comboItems`, `mediaCounts` y `audioItems` por orden) sin duplicar jamás la plantilla al pulsar múltiples veces el botón.
- [x] **T-03.2**: Actualizar `apps/admin/app/workspace/products/product-form-modal.tsx` y diccionarios i18n (`apps/admin/lib/i18n.ts`) para conectar el contexto completo del producto y de sus archivos multimedia al generador **`IDEAL`** y a `<AiEnhanceTextarea fieldKey="product.bot_master_prompt" />`.

### `T-04` · Prompt General de Operación del Cliente y Clasificador Dinámico en `/workspace/bot` (`@mocter/admin`)
- [x] **T-04.1**: Actualizar `apps/admin/app/workspace/bot/bot-view.tsx` incorporando la sección **«Prompt General de Operación del Cliente (Metodología IDEAL)»** con botón idempotente «Insertar Estructura IDEAL del Negocio» y `<AiEnhanceTextarea fieldKey="bot.client_general_prompt" />`, más la sección **«Clasificador Dinámico de Conversaciones (Etiquetas Funcionales y Operativas)»** que visualiza los colores orientativos en Chatwoot y las acciones operativas (`handoff_human`, `pause_bot`, `send_email_notification`) junto con su prompt compilado.

### `T-05` · Pruebas Unitarias, Compilación, Reinicio de Contenedores y Health Check (`AGENTS.md §4.18`)
- [x] **T-05.1**: Agregar pruebas unitarias en `packages/domain` (`lead-classifier-orchestrator.test.ts` y `ai-assist.service.test.ts`) y en `apps/admin` (`workspace-views.test.tsx`) verificando la estructura `IDEAL`, la no duplicación al pulsar «Insertar Estructura Recomendada» repetidas veces, y la clasificación funcional/operativa con efectos secundarios.
- [x] **T-05.2**: Ejecutar lint, typecheck, tests, `next build`, reinicio de contenedores Docker (`mocter-core-admin-portal-1` y `mocter-core-web-portal-1`) y verificación HTTP `200`.

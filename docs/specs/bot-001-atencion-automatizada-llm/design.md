# BOT-001 · Diseño · Bot de atención automatizada con LLM e inferencia como servicio

| Atributo | Valor |
|---|---|
| ID | BOT-001 |
| Versión | 0.3 (Aprobada — decisiones O-01 a O-07 cerradas) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Fricción mínima.** El inquilino configura lo indispensable; la plataforma aporta presets, tonos, defaults y recomendaciones.
2. **Catálogo gobernado.** Solo la plataforma crea proveedores, modelos, tonos, presets y canales admisibles; el inquilino elige dentro de la whitelist.
3. **Día uno BYOK; billetera y spread aprobados como fundaciones.** El día uno el inquilino registra su proveedor; la billetera, el spread y la inferencia Mocter ya tienen decisiones cerradas y pueden activarse por fases (D-07).
4. **El dinero se cuenta en enteros.** Saldos, costos y consumos en centavos de USD; el checkout muestra y cobra en la moneda del inquilino con FX y redondeo controlados.
5. **El bot nunca se queda mudo.** Sin saldo, falla a un proveedor BYOK habilitado; sin alternativa, responde el fallback y pausa.
6. **Las claves nunca se ven.** Cifradas en reposo, enmascaradas en pantalla, ausentes de logs y respuestas.
7. **Todo se audita.** Catálogo, precios, claves, recargas y consumos dejan rastro; el uso queda en un ledger append-only.

## 2. Contexto y límites

BOT-001 es **configuración y gobernanza**. El motor que ejecuta la conversación (orquestación, memoria, herramientas y el webhook con Chatwoot) es BOT-002 y consume estas tablas por API.

**Fases (D-07):**
- **Día uno:** catálogo de proveedores/modelos/tonos/presets, configuración del bot, canales admisibles gestionados desde Mocter y BYOK.
- **Fundaciones aprobadas (pueden activarse por fases):** billetera, precios con spread, claves de plataforma y ledger de consumo. Sus decisiones O-01 a O-07 están cerradas; la activación operativa no bloquea el lanzamiento.

Los canales del bot son integraciones de Chatwoot. Las **instancias** de canal (inboxes) las aprovisiona ADM-001 (CHW-001); BOT-001 aporta el **catálogo de tipos admisibles** y la habilitación del bot por canal (D-09).

## 3. Arquitectura

```text
                     ┌──────────────────────────────────────────┐
                     │  mocter-admin (apps/admin)               │
                     │  UI de configuración (i18n es/en)        │
                     └──────────────┬───────────────────────────┘
                                    │ API interna
                     ┌──────────────▼───────────────────────────┐
                     │  Router Global · schema `admin`          │
                     │  ai_providers · ai_models · bot_tones    │
                     │  bot_presets · bot_defaults              │
                     │  chatwoot_channel_types                  │
                     │  tenant_bots · tenant_ai_providers       │
                     │  tenant_model_settings · tenant_bot_     │
                     │  channels                               │
                     │  (fundaciones: wallets · wallet_         │
                     │  transactions · ai_usage_events ·        │
                     │  ai_platform_keys)                       │
                     └───────┬──────────────────────────┬───────┘
                             │ config por API            │ claves BYOK del inquilino
                ┌────────────▼───────────┐   ┌───────────▼───────────┐
                │ BOT-002 (futuro)       │   │ Proveedores LLM        │
                │ motor de atención      │   │ OpenAI · Anthropic ·   │
                │ (webhook Chatwoot)     │   │ Google · DeepSeek ·    │
                └────────────────────────┘   │ OpenRouter · Together  │
                                             └───────────────────────┘
```

## 4. Modelo de datos

Todas las tablas viven en el Router Global, schema `admin`, y llevan las columnas de auditoría de la directiva de base de datos (`created_at`, `updated_at`, `created_by`, `updated_by`). Soft delete (`deleted_at`, `deleted_by`) solo donde se indica; el resto usa `status`/`is_active` como baja lógica.

### 4.1 Catálogo (plataforma)

| Tabla | Clave | Atributos |
|---|---|---|
| `ai_providers` | `id` | `code` único (openai, anthropic, google, deepseek, openrouter, together_ai), `name`, `is_active`, `docs_url`, `supported_modes` JSONB `{byok, mocter}`, `sort_order` |
| `ai_models` | `id` | `provider_id` FK, `model_id` (identificador del proveedor), `display_name`, `context_window`, `max_output_tokens`, `capabilities` JSONB (tools/vision/json), `recommended_use` JSONB `{es,en}`, `default_temperature`, `default_max_tokens`, `is_active`, `sort_order`, `spread_percent` (default 30), y precios: `cost_input_mtok_usd_cents`, `cost_output_mtok_usd_cents`, `retail_input_mtok_usd_cents`, `retail_output_mtok_usd_cents` (retail = costo × (1 + spread), nullable hasta configurar) |
| `bot_tones` | `id` | `code` único, `labels` JSONB `{es,en}`, `description` JSONB `{es,en}`, `is_active`, `sort_order` |
| `bot_presets` | `id` | `code` único, `labels` JSONB `{es,en}`, `model_id` FK, `temperature`, `max_tokens`, `recommended_for` JSONB `{es,en}`, `is_active`, `sort_order` |
| `bot_defaults` | `id` (una sola fila) | `default_max_turns`, `default_answer_policy`, `default_handoff_triggers` JSONB, `default_response_language_behavior`, `greeting_message_key`, `fallback_message_key` (claves de diccionario i18n), `default_max_messages_per_contact`, `version` |
| `chatwoot_channel_types` | `id` | `code` único (website, facebook, instagram, whatsapp_cloud, whatsapp_twilio, telegram, email, sms, api, line), `labels` JSONB `{es,en}`, `provisioning` (`api` o `oauth`), `notes` JSONB `{es,en}`, `is_admissible`, `sort_order` |

- Los precios de `ai_models` son **por 1M de tokens**, en centavos de USD. `cost_*` se siembra con el precio vigente y se edita desde el backoffice; `spread_percent` es configurable por modelo (30% por defecto); `retail_*` se calcula y se versiona con auditoría.
- `bot_defaults` es un singleton versionado (RF-03.3).
- La baja lógica del catálogo es `is_active`/`is_admissible`; no se usa `deleted_at` para no romper FKs históricas.
- `chatwoot_channel_types.provisioning` resume la viabilidad técnica: `api` = Chatwoot expone creación por API; `oauth` = el proveedor exige su flujo OAuth y Chatwoot lo media (ver §4.4).

### 4.2 Configuración del inquilino

| Tabla | Clave | Atributos |
|---|---|---|
| `tenant_bots` | `id` | `client_id`, `name`, `objective` (obligatorio), `tone_id` FK (obligatorio), `preset_id` FK nullable o `provider_id`+`model_id` (excluyentes), `status` (draft/active/paused), `revision`; opcionales con default de plataforma: `persona`, `instructions`, `allowed_topics`, `excluded_topics`, `handoff_triggers` JSONB, `max_turns`, `greeting_message`, `fallback_message`, `response_language`, `answer_policy` (solo_conocimiento/libre), `max_messages_per_contact`. Soft delete con `deleted_at`/`deleted_by`. |
| `tenant_ai_providers` | `id` | `client_id`, `provider_id` FK, `api_key_ciphertext`, `api_key_key_id`, `api_key_last4`, `status` (active/disabled). Único `(client_id, provider_id)`. Soft delete al retirar la llave. |
| `tenant_model_settings` | `id` | `client_id`, `provider_id` FK, `model_id` FK, `temperature`, `max_tokens`, `is_enabled`. Único `(client_id, provider_id, model_id)`. Soft delete. |
| `tenant_bot_channels` | `id` | `bot_id` FK, `channel_type_id` FK, `inbox_id` (identificador de Chatwoot, nulo hasta aprovisionar), `inbox_name` (copia legible), `enabled`, `greeting_override` nullable. Único `(bot_id, channel_type_id, inbox_id)`. |

Reglas:

- **Alta mínima (RF-03.1):** nombre, objetivo, tono, y `preset_id` **o** `provider_id`+`model_id`. Los canales se habilitan en el mismo paso o después.
- La temperatura y el max de tokens del bot salen de: `tenant_model_settings` si el inquilino lo configuró; si no, del `bot_presets` elegido; si no, de los defaults de `ai_models` (RF-02.4).
- `response_language` por defecto hereda `clients.locale` (RF-02.6).
- Un cambio de bot incrementa `revision` y audita; el snapshot efectivo (con defaults resueltos) es lo que BOT-002 consume.

### 4.3 Billetera y consumo — fundaciones aprobadas (activación por fases, D-07)

| Tabla | Clave | Atributos |
|---|---|---|
| `wallets` | `client_id` (1:1) | `balance_usd_cents` (≥ 0), `version` (bloqueo optimista), auditoría |
| `wallet_transactions` | `id` | `client_id`, `type` (recharge/consumption/refund/adjustment), `amount_usd_cents` (con signo), `currency` (`COP`/`USD`), `amount_local_cents` nullable, `fx_rate` nullable (solo recharge), `input_tokens`, `output_tokens` (solo consumption), `balance_after_usd_cents`, `reference` (id de pago de la pasarela o id del evento de uso; idempotente), `created_at`, auditoría. Append-only: no se edita ni se borra. |
| `ai_usage_events` | `id` | `client_id`, `bot_id` nullable, `provider_id`, `model_id`, `mode` (byok/mocter), `purpose` (`bot`/`assist`/`trial`; `embedding`/`summary` futuros), `input_tokens`, `output_tokens`, `cost_usd_cents` (0 en modo byok), `wallet_transaction_id` nullable, `created_at`. Append-only; partición mensual futura si el volumen lo exige (patrón DAT-001). |
| `ai_platform_keys` | `id` | `provider_id` FK, `key_id`, `api_key_ciphertext`, `api_key_key_id`, `api_key_last4`, `status` (active/retired), `purpose` (inference), auditoría. Una activa por proveedor; la rotación crea una nueva y retira la anterior sin borrar historia. |

Flujo de consumo (modo Mocter, activación por fases):

1. BOT-002 solicita inferencia con `client_id`, `provider_id`, `model_id` y `purpose` (`bot`/`assist`).
2. Se calcula el costo con el precio minorista vigente: `costo = input_tokens × retail_input + output_tokens × retail_output`; el retail incluye el `spread_percent` del modelo (30% por defecto).
3. En una transacción: verificar `balance ≥ costo` y `balance ≥ 0`, debitar `wallets.balance_usd_cents`, insertar `wallet_transactions` (type=consumption) e `ai_usage_events`. Si el saldo no alcanza, se rechaza sin debitar (RF-06.4) y BOT-002 aplica el fallback BYOK o pausa.
4. La recarga (RF-06.2) entra por webhook de **Wompi o Stripe** con `reference` idempotente; se registra `currency`, `amount_local_cents` y `fx_rate`, y se acredita el equivalente en `amount_usd_cents`. La misma recarga nunca se acredita dos veces.

En el modo BYOK del día uno, `ai_usage_events` registra consumo con `cost_usd_cents = 0` para métricas y auditoría. La billetera cubre bot y asistente AI (RF-06.6); embeddings y resúmenes quedan para una fase futura.

### 4.4 Recordatorios y seguimientos

Motor de recordatorios **personalizables** del inquilino: arma sus propias secuencias de textos con los intervalos y el orden que decida (RF-11). No hay flujos fijos; la imagen de referencia fue solo un ejemplo. La plataforma siembra una **inicialización por defecto editable** que el inquilino adopta, modifica o descarta (RF-11.8).

| Tabla | Clave | Atributos |
|---|---|---|
| `bot_followups` | `id` | `client_id`, `bot_id` nullable (nulo = global del inquilino), `name`, `origin` (`platform_default`/`tenant_custom`), `trigger_inactivity_minutes`, `status` (`draft`/`active`/`paused`), `revision`, auditoría. Soft delete. |
| `bot_followup_steps` | `(followup_id, position)` | `position`, `delay_minutes` (espera desde el paso anterior), `message` (texto del recordatorio), auditoría. Único por posición. |
| `bot_followup_runs` | `id` | Estado de ejecución que escribe BOT-002: `client_id`, `followup_id`, referencia del prospecto y de la conversación de Chatwoot, `current_step`, `next_send_at`, `status` (`running`/`completed`/`stopped`), `stop_reason`, auditoría. |

Comportamiento (todo configurable por el inquilino):

1. **Disparo:** un prospecto sin respuesta durante `trigger_inactivity_minutes` inicia la secuencia que el inquilino tenga aplicable (BOT-002 evalúa; un prospecto, una secuencia activa).
2. **Envío:** el paso se envía por el canal de la conversación activa; antes de cada paso comercial se consulta `prospect_consents` (CRM-001) y sin consentimiento vigente la secuencia se cancela.
3. **Espera:** se agenda el siguiente paso con `delay_minutes`.
4. **Parada:** respuesta del prospecto, toma de un agente, revocación de consentimiento o pausa del bot cancelan los pasos pendientes (RF-11.4).
5. **WhatsApp:** un mensaje iniciado por el negocio fuera de la ventana de 24 h desde el último mensaje del usuario exige **plantilla aprobada**; la secuencia lo respeta y se valida en laboratorio contra 4.19.

Los textos de los pasos son campos asistidos por AI (`followup_step.message`, AI-001) y respetan `clients.locale`. El envío se audita con actor `bot` y queda en `bot_followup_runs`.

## 5. Canales: viabilidad técnica

Los canales admisibles son los que soporta Chatwoot. El inquilino los gestiona desde Mocter; el sistema configura Chatwoot por detrás. Viabilidad por tipo (a validar contra Chatwoot 4.19 en laboratorio, T-14):

| Tipo | Aprovisionamiento | Cómo se gestiona desde Mocter |
|---|---|---|
| Website (widget) | `api` (alta confianza) | Mocter crea el inbox por la API de Chatwoot y entrega el script al inquilino |
| API channel | `api` (alta confianza) | Mocter crea el inbox y expone el webhook token |
| Email | `api` (a validar en 4.19) | Mocter crea el inbox con la dirección configurada |
| Facebook · Instagram | `oauth` | Mocter redirige el flujo de autorización de Facebook Business que Chatwoot media; la cuenta queda conectada en Chatwoot |
| WhatsApp Cloud · WhatsApp Twilio | `oauth` | Igual que Facebook: la conexión la ejecuta Chatwoot; Mocter la dispara y la refleja |
| Telegram | `oauth` (token de bot) | Mocter recibe el token del bot del inquilino y lo aplica por la API de Chatwoot (a validar) |
| SMS (Twilio/Bandwidth) · Line | `oauth` | Conexión mediada por Chatwoot; Mocter la dispara |

**Conclusión de viabilidad.** Técnicamente viable como **orquestación**: Mocter es el panel donde el inquilino gestiona sus integraciones y el sistema ejecuta la configuración en Chatwoot. No es viable (ni deseable) replicar fuera de Chatwoot los flujos OAuth de los proveedores (Meta, Twilio): se mantienen dentro de Chatwoot y Mocter los dispara y refleja. La lista exacta de endpoints por tipo se confirma en laboratorio contra 4.19 y se documenta en CHW-001; un tipo que 4.19 no permita aprovisionar se marca `is_admissible = false` con su nota.

## 6. Seguridad de claves

- BYOK y claves de plataforma: AES-256-GCM con AAD `client_id:provider_id` (o `platform:provider_id`), la misma maquinaria de claves que AUTH-D-04 (clave maestra en Docker secrets, `key_id`, rotación por lotes).
- Enmascarado `••••<last4>` en UI y respuestas; nunca en logs, analítica ni backups en claro (la clave maestra no entra al respaldo, OPS-001).
- La escritura de claves audita registro/rotación/retiro en `audit_log`, nunca el material cifrado.

## 7. Gobernanza y roles

- Catálogo, presets, tonos, canales admisibles, defaults, precios y spread: `platform_admin`/`platform_owner`.
- Bots, claves BYOK e integraciones de canal del inquilino: `tenant_owner`. El `tenant_agent` consulta.
- `platform_sales` lee consumo y recaudación agregados (RF-10.3).
- El cambio de precio minorista audita quién, cuánto, cuándo y por qué; aplica a consumos futuros (RF-05.3).

## 8. i18n

- Toda la UI de configuración cumple la directiva de i18n (es/en, Español por defecto).
- Los textos del catálogo (tonos, presets, recomendaciones, canales) se guardan como JSONB `{es,en}` para que el inquilino decida leyendo en su idioma (RF-03.4).
- Los textos del bot (objetivo, saludo, fallback, persona) son contenido libre del inquilino, en el idioma que el negocio necesite; `response_language` gobierna la respuesta al contacto.

## 9. Verificación

Día uno:

| Control | Prueba |
|---|---|
| Catálogo | Seed con los 6 proveedores y modelos; un proveedor deshabilitado pausa bots vigentes |
| Alta mínima | Un bot se crea con 5 campos; todo lo demás hereda defaults; el snapshot efectivo coincide |
| BYOK | La clave se guarda cifrada, se muestra enmascarada y no aparece en logs ni respuestas |
| Canales | El inquilino gestiona sus integraciones desde Mocter; el tipo `api` crea el inbox en Chatwoot; el tipo `oauth` dispara el flujo mediado por Chatwoot |
| Auditoría | Cambio de catálogo y rotación de clave dejan rastro en `audit_log` |
| Recordatorios | Una secuencia envía sus pasos en orden y en los intervalos configurados; la respuesta del prospecto cancela los pendientes; sin consentimiento comercial no se envía; en WhatsApp fuera de 24 h se exige plantilla |
| i18n | La UI y las etiquetas del catálogo se muestran en es y en en |

Fundaciones (activación por fases):

| Control | Prueba |
|---|---|
| Consumo | Consumir 1.000 tokens descuenta el monto exacto del retail; saldo insuficiente rechaza sin debitar |
| Idempotencia | Dos webhooks con la misma recarga acreditan una sola vez |
| Fallback | Sin saldo, el bot usa el proveedor BYOK habilitado; sin BYOK, fallback + pausa |
| Proveedores | Activar/desactivar un proveedor desde backoffice habilita o pausa sus modelos; los modelos se activan por proveedor |
| Spread | El retail se calcula con 30% por defecto y respeta el override por modelo |
| Moneda | Una recarga en COP por Wompi y una en USD por Stripe se acreditan en USD con FX y redondeo registrados |
| Prepago estricto | El saldo nunca queda negativo; sin BYOK el modo Mocter se pausa con aviso |
| Asistente | El consumo del asistente AI usa `purpose = assist` y la misma billetera del bot |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Spam o molestia por recordatorios | Máximo 10 pasos por secuencia, una secuencia activa por prospecto y parada ante cualquier respuesta |
| Ventana de 24 h de WhatsApp | Los mensajes fuera de ventana exigen plantillas aprobadas; validado en laboratorio contra 4.19 |
| Recordatorio sin consentimiento | Consulta de `prospect_consents` antes de cada paso comercial (CRM-001) |
| Dependencia de los flujos OAuth de los proveedores de canal | Se mantienen dentro de Chatwoot; Mocter orquesta y refleja; validación por tipo en laboratorio (T-14) |
| Volatilidad de precios de los proveedores (fase futura) | Repricing periódico auditado; el spread absorbe variación menor; saldo en fiat, no en tokens |
| Abuso del modo Mocter (fase futura) | Solo dentro de capacidades de la plataforma (RF-05.5); saldo prepago estricto y fallback BYOK, sin límites por plan |
| Saldo prepago como pasivo contable | Saldos en fiat registrados en ledger append-only; conciliación con la pasarela |
| Dependencia de claves de plataforma (fase futura) | Rotación por `key_id`, una activa por proveedor, retiro sin borrar historia |
| Volumen de `ai_usage_events` | Append-only con índices por `(client_id, created_at)`; partición mensual cuando se mida |

## 11. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | Inboxes y canales aprovisionados por ADM-001 (CHW-001); BOT-001 consume el listado y gobierna los admisibles. No se usa `ai_tokens_monthly` en v1; el saldo prepago es el guardrail y no se reabre T-10. |
| DAT-001 | RF-10.8 (todo en el Router, sin FK entre planos) y RF-10.9 (auditoría) |
| AUTH-001 | Maquinaria de claves AUTH-D-04 reutilizada |
| CHW-001 | Tipos de canal y endpoints de aprovisionamiento validados contra Chatwoot 4.19 |
| CRM-001 | Los recordatorios comerciales consultan `prospect_consents` antes de enviar (RF-11.6) |
| AI-001 | Los textos de los pasos son campos asistidos (`followup_step.message`) |
| OPS-001 | Monitoreo de consumo y costo por proveedor; claves cifradas en respaldo, clave maestra fuera |
| i18n | Directiva es/en aplicada a UI y catálogo |

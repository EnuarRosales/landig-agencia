# SPEC-23 · Gateway Híbrido RESTful (OpenAPI 3.1) + MCP Server, Entrega Multimedia Firmada y Orquestación M2M para `mocter-engine` (Python / LangGraph)

## 1. Identificación

| Campo | Valor |
| --- | --- |
| **ID** | `SPEC-23` |
| **Nombre** | Gateway Híbrido RESTful (OpenAPI 3.1) + Model Context Protocol (MCP Streamable HTTP Stateless), Compilador de Burbujas y Multimedia Firmada (`imgproxy` + Streaming HMAC), Correlación `in_reply_to`, Resiliencia BYOK/LLM, Adaptador Conversacional Chatwoot y Servicios Deterministas de Ventas/CRM para `mocter-engine` |
| **Tipo de intervención** | Nueva frontera de interoperabilidad M2M privada (Docker / Kubernetes), servidor MCP stateless embebido, endpoints RESTful con OpenAPI 3.1, migración celular de `conversation_state` / `tenant_labels` / `conversation_sent_media_log` y cliente HTTP conversacional hacia `mocter-chatwoot` |
| **Prioridad** | P0 — Crítica (habilita a `mocter-engine` en Python/LangGraph para ejecutar atención multicanal, catálogo, multimedia, CRM, prompts IDEAL, seguimiento comercial y pedidos sobre `mocter-core` y `mocter-chatwoot`) |
| **Versión** | 1.2.0 (Post Spec Review + Adopción de Patrones Operativos Validados en Producción) |
| **Estado** | Aprobada · Lista para implementación |
| **Paquetes / Apps afectadas** | `packages/domain`, `apps/admin` |

---

## 2. Trazabilidad

| Elemento | Referencia |
| --- | --- |
| **Specs previas relacionadas** | [SPEC-22](../spec-22-particionamiento-pgvector-embeddings-busqueda-hibrida/requirements.md) (Particionamiento `pgvector`, Embeddings y Búsqueda Híbrida RRF), [API-001](../api-001-openapi-swagger/requirements.md), [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md), [BOT-002](../bot-002-motor-atencion-prompts/requirements.md), [CHW-001](../chw-001-inventario-chatwoot/requirements.md), [CHW-002](../chw-002-estabilizacion-interoperabilidad-chatwoot/requirements.md), [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md), [NTF-001](../ntf-001-notificaciones-email/requirements.md), [ORD-001](../ord-001-pedidos-fulfillment/requirements.md), [SPEC-02](../spec-02-motor-inferencia-byok-prompts-ai/requirements.md), [SPEC-08](../spec-08-catalogo-productos-crud-multimedia-combos-stock/requirements.md), [SPEC-09](../spec-09-crm-contactos-calificacion-direcciones-prospeccion/requirements.md), [SPEC-10](../spec-10-asistente-ai-bot-presets-politicas-mensajes/requirements.md), [SPEC-11](../spec-11-pedidos-crud-estados-guias-repetir/requirements.md), [SPEC-14](../spec-14-notificaciones-plantillas-email/requirements.md), [SPEC-18](../spec-18-motor-promociones-descuentos-campanas/requirements.md), [SPEC-19](../spec-19-arquitectura-prompts-ideal-comercializacion-clasificador/requirements.md), [SPEC-20](../spec-20-estandar-geografico-e164-homologacion/requirements.md) |
| **Directivas aplicables** | `.agents/AGENTS.md` (§3 R-09/R-10, §4.4 TSDoc en español, §4.12 `@t3-oss/env-nextjs`, §4.13 Logging estructurado con `x-request-id`, `after()` no bloqueante y redacción de secretos, §4.14 Manejo de excepciones con `handle()` y RFC 9457 sin fuga de detalles internos en `500`, §4.16 Cero puertos hardcodeados / compatibilidad con Traefik y Kubernetes, §4.18 Compilación, reinicio y Health Check) |

---

## 3. Topología del Ecosistema y Problema a Resolver

### 3.1 Topología Privada de Red (Docker Actual → Kubernetes Futuro)
El ecosistema Mocter opera con tres servicios principales más el stack multimedia:
1. **`mocter-core`** (este monorepo Next.js 16 + `@mocter/domain`, dueño del Control Plane y de las celdas `pg-cell-XX`).
2. **`mocter-engine`** (servicio externo en **Python + LangGraph**, responsable del grafo de razonamiento agéntico, STT/Visión multimodal y memoria conversacional de corto plazo).
3. **`mocter-chatwoot`** (instancia singleton de Chatwoot v4.19.1, bandeja omnicanal).
4. **`mocter-media`** (SeaweedFS S3 interno + `imgproxy` público en `IMGPROXY_PUBLIC_URL`).

**Reglas innegociables de red e infraestructura:**
- **Comunicación Este–Oeste 100 % privada:** `mocter-core`, `mocter-engine` y `mocter-chatwoot` se comunican a través de una **red interna única de Docker** sin publicar puertos al host (`R-10`) ni exponer las rutas M2M (`/api/v1/agent/*`, `/api/v1/mcp`, `/api/v1/agent/openapi.json`) en el router público de Traefik.
- **Exposición Norte–Sur estrictamente mínima:** Al exterior (Traefik TLS 443) solo salen las URLs firmadas que plataformas externas como WhatsApp Cloud API o clientes finales necesitan descargar para ver/escuchar archivos multimedia:
  - `IMGPROXY_PUBLIC_URL` (imágenes `@jpg`/`@png` firmadas por HMAC-SHA256).
  - `${MOCTER_PUBLIC_ADMIN_URL}/api/v1/public-media/:mediaId?clientId=...&exp=...&sig=...` (audios, videos y PDFs firmados por HMAC-SHA256 stateless).
- **Preparación nativa para Kubernetes y múltiples celdas (Celda 2, 3… N):**
  - Todo el Gateway (`mocter-core`) es **100 % stateless** entre réplicas: no almacena sesiones MCP, locks de idempotencia, contadores de *rate limit* ni cooldowns de alertas en memoria local en producción; utiliza el **Redis del Control Plane (`ioredis`)**.
  - Ningún código hardcodea puertos (`3000`, `3003`) ni nombres de contenedor; los orígenes se resuelven por variables de entorno validadas (en Docker `http://admin-portal:3003`, en Kubernetes ClusterIP `http://mocter-admin.mocter.svc.cluster.local:3003`).

### 3.2 Brechas Verificadas que Esta Especificación Resuelve
1. **Bloqueo en `apps/admin/proxy.ts`:** `proxy.ts` exige la cookie `mocter_sid` en toda ruta `/api/*` salvo `/api/health`, `/api/webhooks` y `accept-invite`, y omite `x-request-id` en rutas exentas. Sin actualizar `proxy.ts`, cualquier llamada de `mocter-engine` o WhatsApp recibiría `401`.
2. **Precios no recalculados en `OrdersService.registerOrderDetailed`:** `orders.service.ts` acepta `item.unitPriceCents`, `shippingCents` y `discountCents` del caller. Para evitar que un LLM invente o altere precios (`RN-SPEC-23-01`), la herramienta `register_order` no acepta precios desde el LLM y recalcula obligatoriamente con `quoteOrderItems()`.
3. **Carencia de columnas operativas en celda (`conversation_state`, `tenant_labels`, `conversation_sent_media_log`):**
   - `admin.conversation_state` no persiste `bot_paused`, `turn_count`, `operational_labels`, `followup_active` ni `last_committed_message_id`, y su `CHECK` sobre `last_label` solo admite 4 slugs fijos (rechazando `devolucion` y etiquetas funcionales custom de `SPEC-19`).
   - `admin.tenant_labels` no declara `chatwoot_priority` ni `is_conversion` para automatizar prioridades en Chatwoot y proteger conversiones de forma monotónica.
   - No existe registro de correlación `(chatwoot_message_id → product_id, media_id)` para saber qué producto/foto citó un comprador al usar «Responder a este mensaje» en WhatsApp.
4. **Falta de implementador HTTP conversacional hacia `mocter-chatwoot`:** `IChatwootConversationGateway` solo tiene mocks en tests y carece de cliente HTTP real con preservación de etiquetas manuales (`GET → merge → POST` en conversación y contacto), lectura fresca de `custom_attributes`, actualización de `priority`, filtrado de notas privadas/actividad y despacho `multipart/form-data`.
5. **Bloqueo `401`, compatibilidad WhatsApp y desorden visual en entrega multimedia:** `/api/tenant/media/[mediaId]` exige cookie humana; `imgproxy` solo procesa imágenes (`422` en audio/PDF); WhatsApp Cloud API rechaza `@webp`, `video/webm` y `audio/wav`; y el texto enviado sin pausa tras un binario suele llegar antes que la foto/audio en Meta.
6. **Resiliencia operativa ante incidentes BYOK/LLM y entradas multimodales:** Se requiere un circuito fail-safe que escale a humano (nota privada + prioridad urgente + alerta de correo con anti-flood de 30 min) cuando se agota o revoca la API Key del inquilino sin bloquear ni silenciar fallos parciales con failover activo, y soporte tanto para transcripción de voz (STT multi-proveedor) como para imágenes entrantes (comprobantes/fotos).

---

## 4. Decisiones de Diseño (`/grill-me` + Spec Review + Patrones Operativos de Producción)

### D-01 · Arquitectura Híbrida RESTful (OpenAPI 3.1) + MCP Streamable HTTP Stateless sobre Esquemas Zod v4 Únicos (Sin GraphQL)
1. **Fuente única de verdad en Zod v4 (`packages/domain/src/validation/agent-gateway.schemas.ts`):** Cada una de las 9 operaciones canónicas define una única pareja de esquemas Zod de entrada y salida. Adicionalmente se expone un endpoint REST auxiliar M2M (`POST /api/v1/agent/media-receipts`, no expuesto como tool al LLM) para que `mocter-engine` registre los `chatwootMessageId` cuando opere con `dispatchToChatwoot = false`.
2. **Exposición Dual en `apps/admin`:**
   - **RESTful (`/api/v1/agent/*`):** Route Handlers envueltos en `handle()` con errores **RFC 9457 Problem Details** (`application/problem+json`) y sanitización estricta de `500` (`AGENTS.md §4.14`). Documentados automáticamente en `GET /api/v1/agent/openapi.json` (generado con `@asteasolutions/zod-to-openapi`) y explorables en `/api-docs/agent` (`@scalar/api-reference-react`, restringido a operadores `platform_admin`/`platform_owner`).
   - **MCP Streamable HTTP Stateless (`POST /api/v1/mcp`):** Implementa la especificación **Model Context Protocol Streamable HTTP (`2025-03-26`, con negociación retrocompatible a `2024-11-05`)** en modo stateless (cero *sticky sessions*, apto para Kubernetes):
     - Acepta `Accept: application/json, text/event-stream` y responde `application/json`.
     - Métodos JSON-RPC 2.0 soportados: `initialize`, `notifications/initialized` (responde `202 Accepted` sin cuerpo), `ping`, `tools/list` (generando `inputSchema` con `z.toJSONSchema()` nativo de Zod v4 `^4.6.7`) y `tools/call`.
     - `GET /api/v1/mcp` y `DELETE /api/v1/mcp` responden `405 Method Not Allowed` con cabecera `Allow: POST`.
3. **Descarte explícito de GraphQL:** Las herramientas discretas con esquemas Zod cerrados eliminan alucinaciones de queries complejas y garantizan contratos deterministas para LLMs.

### D-02 · Seguridad M2M (`MOCTER_AGENT_SERVICE_KEY`), Prevención de Conflictos de Tenencia, Rate Limit y Trazabilidad en Redis
- **Autenticación M2M:** `Authorization: Bearer <MOCTER_AGENT_SERVICE_KEY>` o cabecera `X-Mocter-Agent-Key`, validada en tiempo constante mediante `compareHashesConstantTime(sha256(provided), sha256(expected))`.
- **Contexto de tenencia inyectado desde el estado de LangGraph (`InjectedToolArg` / cabecera `X-Mocter-Client-Id`):**
  - `mocter-engine` inyecta `clientId` desde su `AgentState` mediante cabecera `X-Mocter-Client-Id` (o en el payload en `turn-context` junto con `chatwootAccountId`), evitando que el LLM deba generar UUIDs.
  - **Validación anti-conflicto (`RN-SPEC-23-05`):** Si una petición proporciona a la vez `X-Mocter-Client-Id` y `body.clientId` (o `chatwootAccountId`), Mocter verifica que ambos resuelvan al **mismo `clientId`**; ante cualquier discrepancia rechaza con `400 TENANT_CONTEXT_MISMATCH`.
  - Toda operación sobre datos del comercio se ejecuta obligatoriamente dentro de `withTenantCellTransaction(clientId, ...)` bajo `FORCE ROW LEVEL SECURITY`.
- **Rate Limiting Distribuido:** Límite configurable vía `MOCTER_AGENT_RATE_LIMIT_PER_CONV_PER_MIN` (default `30 req/min`) por clave Redis `agent:rl:${clientId}:${chatwootConversationId}`, devolviendo `429 Too Many Requests` con cabecera `Retry-After` para contener bucles infinitos de grafos en `mocter-engine`.
- **Correlación de Trazas:** `apps/admin/proxy.ts` y `verifyAgentServiceAuth` propagan `X-Request-Id` y `X-Mocter-Engine-Run-Id` (ID de ejecución de LangGraph/LangSmith) en todos los logs estructurados (`appLogger`) y en las cabeceras de respuesta.

### D-03 · Flujo Conversacional de 3 Fases, Correlación `in_reply_to`, Adjuntos Entrantes Multimodales e Idempotencia en `turn-commit`
1. **Migración celular `0029` / `0030`:**
   - En `admin.conversation_state`: añade `bot_paused`, `bot_paused_reason`, `bot_paused_at`, `turn_count`, `operational_labels` (`jsonb`), `followup_active` (`boolean NOT NULL DEFAULT true`) y `last_committed_message_id`, y remueve el `CHECK` rígido de 4 slugs sobre `last_label`.
   - En `admin.tenant_labels`: añade `chatwoot_priority` (`'urgent' | 'high' | 'medium' | 'low' | null`) e `is_conversion` (`boolean NOT NULL DEFAULT false`), con backfill para `compra-realizada`, `soporte_humano` y `devolucion`.
   - Crea tabla celular `admin.conversation_sent_media_log` con `FORCE ROW LEVEL SECURITY` e índice `(client_id, chatwoot_message_id)` para correlacionar envíos multimedia con respuestas citadas de WhatsApp.
2. **Fase 1 — Bootstrap (`POST /api/v1/agent/turn-context` / MCP `bootstrap_conversation_turn`):**
   - En un único viaje interno resuelve `chatwootAccountId → { clientId, cellId }`, ejecuta `ingestFromChatwoot`, evalúa todos los guardrails (`shouldInvokeLlm`: mensaje entrante, bot activo, canal habilitado, `custom_attributes.desactivar_bot !== true`, `bot_paused === false`, `turn_count < maxTurns`, horario comercial y disponibilidad de credenciales LLM).
   - **Correlación de respuesta citada (`in_reply_to`):** Si `message.inReplyToChatwootMessageId` viene presente, consulta `admin.conversation_sent_media_log` y devuelve `repliedMediaContext` (`productId`, `productName`, `mediaId`, `mediaKind`) sin costo de LLM; si corresponde a un producto activo y no hay foco previo (o el cliente cambia explícitamente de artículo citando su foto), hidrata `activeProduct`. Si cita texto normal, retorna `null` sin error.
   - **Adjuntos entrantes multimodales (Audio + Imagen + Video + Archivo):** Acepta `message.attachments[]` y reescribe sus URLs al origen privado `CHATWOOT_INTERNAL_URL` (`internalDownloadUrl`) para que `mocter-engine` descargue tanto notas de voz (STT) como imágenes de comprobantes o productos (Visión) por la red interna Docker.
   - **Fecha/Hora localizada en `PromptComposer`:** Inyecta `{fecha_actual}` / `{{current_date}}` formateado dinámicamente con `clients.timezone` y `clients.locale` mediante `Intl.DateTimeFormat` (nunca hardcodeado a una zona fija).
   - Entrega `contact`, `conversationState`, `activeProduct`, `repliedMediaContext`, `inboundAttachments`, `contactMemory` (RAG `SPEC-22`), `prompts` (System Prompt de 3 planos IDEAL + Prompt Clasificador Dinámico), `businessContext` (`paymentChannels`, `carriers`, `shippingPolicy`, `bubblePreset`), `llmCandidates: [primary, secondary]` y `sttCredential`.
3. **Fase 2 — Ciclo Agéntico en `mocter-engine`:** Invoca las herramientas deterministas y de búsqueda híbrida (§5).
4. **Fase 3 — Commit Idempotente (`POST /api/v1/agent/turn-commit` / MCP `commit_conversation_turn`):**
   - Exige `idempotencyKey` (`turn:${clientId}:${chatwootConversationId}:${inboundMessageId}`), respaldado por Redis (`SET agent:commit:${clientId}:${idempotencyKey} ... NX EX 86400`) + `conversation_state.last_committed_message_id`.
   - Soporta `requestHumanHandoff` explícito desde el agente, `inferenceIncident` (failover parcial o fallo total BYOK/LLM), clasificación dinámica con **protección monotónica de conversión**, actualización segura de Chatwoot (`GET → merge → POST` en conversación y contacto + lectura fresca de `custom_attributes` + `priority`), compilación de `deliveryPlan`, despacho opcional vía `after()` de Next.js 16 y consolidación RAG/tokens.

### D-04 · Entrega M2M de `llmCandidates [primary, secondary]`, `sttCredential` y Circuito de Incidentes BYOK/LLM con Anti-Flood (30 min)
- **Resolución de inferencia y STT:** En `turn-context`, Mocter invoca `AiCredentialResolverService.resolveCredentialCandidates({ clientId })` y entrega `llmCandidates: [primary, secondary]`. Cuando existan adjuntos de audio (o el bot acepte voz), entrega adicionalmente `sttCredential` resolviendo primero un proveedor BYOK OpenAI/Google activo del comercio y, como respaldo multi-proveedor (p. ej. comercios con Anthropic o DeepSeek), `env.MOCTER_STT_API_KEY` (si está configurada).
- **Circuito de Incidentes Failover-Aware (Pre-vuelo + Runtime):**
  - Respetando el constraint real de `admin.tenant_ai_providers.status` (`'active' | 'disabled' | 'invalid' | 'revoked'`), los errores de saldo/cuota (`insufficient_quota`) se registran en `last_verification_error` sin violar el `CHECK`; únicamente los errores de autenticación/revocación (`401` / `invalid_api_key` / `revoked`) transicionan `status = 'invalid'`.
  - **Fallo parcial (`scope = "partial_failover"`, falló `primary` pero respondió `secondary`):** registra `last_verification_error` (y `status = 'invalid'` si `401`) en el proveedor primario, mantiene el bot operativo sin escalar la conversación y emite alerta preventiva al comercio sujeta al cooldown Redis.
  - **Fallo total (`scope = "total_failure"` en runtime o fallo pre-vuelo en `turn-context`):** (1) registra error en `tenant_ai_providers`, (2) pausa el bot (`bot_paused = true`, `followup_active = false`, detiene `bot_followup_runs`), (3) configura en Chatwoot `priority = "urgent"`, `custom_attributes` fusionados `{ desactivar_bot: true, sin_api_key: true }` y publica **nota privada** (`private: true`) para el equipo humano (nunca expone detalles técnicos al comprador), y (4) dispara notificación por correo `NTF-001` al inquilino y administración SaaS protegida por **anti-flood en Redis** (`agent:key_incident_cooldown:${clientId}`, TTL `MOCTER_INCIDENT_COOLDOWN_SECONDS` = `1800 s`).
- **Auditoría y Redacción:** `turn-commit` registra `tokenUsage[]` en `admin.ai_usage_events`. `packages/domain/src/utils/logger.ts` redacta `x-mocter-agent-key`, `mocter_agent_service_key`, `mocter_stt_api_key`, `llmCandidates[*].apiKey`, `sttCredential.apiKey` y `sig=`.

### D-05 · Entrega Multimedia Sin Bloqueos `401/422`, Compilador `deliveryPlan` Endurecido, Ejecución No Bloqueante `after()` y `ChatwootHttpConversationGateway`
1. **Imágenes (`image`):** Servidas por **`imgproxy`** (`IMGPROXY_PUBLIC_URL`) con firma HMAC-SHA256 en formato `@jpg` (o `@png` si el original es PNG con transparencia).
2. **Audios (`audio` por orden `1..N`), Videos (`video`) y Documentos (`pdf`):**
   - Servidos mediante `GET /api/v1/public-media/[mediaId]?clientId=<uuid>&exp=<unix>&sig=<hmac>`, construido sobre `env.MOCTER_PUBLIC_ADMIN_URL` (fallback `env.NEXT_PUBLIC_ADMIN_URL`), firmado con `env.MOCTER_PUBLIC_MEDIA_SIGNING_KEY` dedicada (o clave derivada `HMAC(IMGPROXY_KEY, "mocter-public-media-v1:" + IMGPROXY_SALT)`), streaming SeaweedFS S3 con `HTTP 206 Range`, `Cache-Control: private, max-age=<min(300, ttlRestante)>` y bandera `whatsappCompatible`.
3. **Compilador `compileTurnDeliveryPlan` endurecido:**
   - Normaliza `\r\n` y `\r` → `\n`.
   - Soporta `[[SPLIT]]`, `[[SPLIT:ms]]` y **`[[SPLIT:media]]`** (delay `0 ms`).
   - Aplica tope defensivo **`MAX_SEGMENTS = 6`** (fusionando excedentes en el 6.º segmento con `wasTruncated: true`).
   - Resuelve `[[MEDIA:termino:tipo:orden]]` en orden determinista: (1) UUID exacto o `"activo"`, (2) `media_term` normalizado, (3) `slugifyMediaTerm(name)` sin tildes.
   - **Red de seguridad para URLs crudas:** Si el texto del LLM contiene una URL cruda perteneciente a `IMGPROXY_PUBLIC_URL` o `${MOCTER_PUBLIC_ADMIN_URL}/api/v1/public-media/`, la extrae del texto y la convierte en un paso `{ kind: "media", caption: null }`.
   - **Regla Anti-Caption (`RN-SPEC-23-03`) sin reordenamiento ciego:** Separa texto + multimedia dentro de cada segmento en paso `media` (`caption: null`) seguido de paso `text`, respetando el orden secuencial definido por `SPEC-19` para audios y medios.
   - **Pausa Post-Multimedia (`postMediaPauseMs`):** En canal WhatsApp, cualquier paso `text` inmediatamente posterior a un paso `media` aplica una pausa mínima `MOCTER_WHATSAPP_POST_MEDIA_PAUSE_MS` (default `5000 ms`, máx. `8000 ms`) para garantizar que Meta entregue primero el binario.
4. **Despacho no bloqueante (`after()` de Next.js 16) y `ChatwootHttpConversationGateway`:**
   - Cuando `dispatchToChatwoot === true` y el `deliveryPlan` contiene pausas, el Route Handler de `turn-commit` ejecuta las escrituras de BD y sincronización de estado sincrónicamente y delega el bucle de envío con pausas a **`after()`** (`next/server`, `AGENTS.md §4.13`), respondiendo inmediatamente con `dispatchStatus: "scheduled_async"`. Cada adjunto enviado registra su `chatwoot_message_id` en `admin.conversation_sent_media_log`.
   - `ChatwootHttpConversationGateway` opera por `CHATWOOT_INTERNAL_URL` implementando:
     - `updateConversationLabels` y `updateContactLabels` con **`GET → merge → POST`** preservando etiquetas manuales externas a `admin.tenant_labels`.
     - `getConversationDetails` y `updateConversationCustomAttributes` con **lectura fresca + merge** para no sobrescribir `desactivar_bot: true` activado en vivo por un humano.
     - `updateConversationPriority` (`PATCH /conversations/:id`).
     - `getRecentMessages` filtrando estrictamente `private !== true && message_type !== 2`.
     - `handoffToHumanAgent`, `sendPrivateNote`, `sendTextMessage` y `sendMediaAttachment` (`multipart/form-data`).

### D-06 · Garantía Determinista Total en `quote_order_items`, `register_order`, `upsert_contact_and_address` y Clasificación Monotónica
- **Cero precios desde el LLM (`RN-SPEC-23-01`):** `register_order` no acepta campos monetarios; invoca obligatoriamente `quoteOrderItems()` primero y pasa los centavos oficiales a `BotOrderCaptureService.capture()`. Al confirmarse el pedido, aplica determinísticamente el estado de conversión (`followup_active = false`, detención de `bot_followup_runs`, etiqueta de conversión y prioridad urgente) sin depender de herramientas separadas del LLM.
- **Patch no destructivo en `upsert_contact_and_address` (`RN-SPEC-23-06`):** Todo campo omitido, `null` o cadena vacía se ignora (`COALESCE(NULLIF(trim(nuevo), ''), actual)`), impidiendo borrar datos previos del comprador.
- **Protección monotónica de conversión (`RN-SPEC-23-07`):** Cuando la etiqueta funcional vigente tiene `is_conversion = true` (p. ej. `compra-realizada`), el clasificador bloquea descensos a etiquetas de embudo previo (`lead-frio`, `lead-tibio`, `lead-caliente`), pero **siempre permite** transicionar a `devolucion` y evaluar/aplicar **Etiquetas Operativas** (`soporte_humano`, `pagado`, `despachado`, `cliente_recurrente`) con sus `sideEffects`.

---

## 5. Catálogo Canónico de las 9 Herramientas (MCP Tools / Endpoints REST) + Endpoint Auxiliar de Recibos

| # | Tool MCP (`POST /api/v1/mcp`) | Endpoint REST (`/api/v1/agent/*`) | Garantía | Propósito |
| --- | --- | --- | --- | --- |
| **1** | `bootstrap_conversation_turn` | `POST /api/v1/agent/turn-context` | Orquestación + Guardrails | Resuelve inquilino/celda, ingesta contacto CRM, evalúa guardrails (`bot_paused`, `custom_attributes.desactivar_bot`, `turn_count`, horario, canal, credenciales), correlaciona `in_reply_to` (`repliedMediaContext`), normaliza adjuntos multimodales entrantes, compone prompts IDEAL con `{fecha_actual}` localizada y entrega `llmCandidates` + `sttCredential`. |
| **2** | `search_catalog_hybrid` | `POST /api/v1/agent/catalog/search` | Híbrido (RRF + Determinista) | Invoca `CatalogHybridSearchService` (`SPEC-22`): HNSW + léxico sin tildes + SKU exacto, hidratado en vivo con precios en centavos, promoción activa (`SPEC-18`), stock efectivo, variantes y resumen multimedia. |
| **3** | `get_product_details_and_pricing` | `GET /api/v1/agent/catalog/products/:productId` | 100 % Determinista | Obtiene la ficha completa en tiempo real por `productId`, `sku` o `mediaTerm`, incluyendo `botMasterPrompt` IDEAL, precio efectivo, promoción, combo, stock, variantes y multimedia firmada. |
| **4** | `get_product_media_assets` | `GET /api/v1/agent/catalog/products/:productId/media` | 100 % Determinista | Resuelve archivos por `productId` o `mediaTerm`, filtrando por `mediaKind` (`image\|video\|audio\|pdf`) y `audioOrder` (`1..N`), entregando URLs públicas firmadas (`imgproxy` `@jpg`/`@png` y `/api/v1/public-media/:mediaId`) + flag `whatsappCompatible`. |
| **5** | `quote_order_items` | `POST /api/v1/agent/orders/quote` | 100 % Determinista | Calcula en centavos exactos subtotal, descuentos promocionales (`SPEC-18`), envío (`shipping_policy`) y total, validando stock real y atributos `requiredForOrder` (cero aritmética en el LLM). |
| **6** | `resolve_geographic_location` | `POST /api/v1/agent/geo/resolve` | 100 % Determinista | Homologa país, subdivisión y ciudad vía `LocationResolverService` (`SPEC-20`: ISO 3166-1/2 + ACL `Dropi`/`Effi`/`MercadoLibre`), devolviendo `resolved`, `soft_normalized`, `ambiguous` o `unresolved`. |
| **7** | `upsert_contact_and_address` | `POST /api/v1/agent/crm/contacts/upsert` | 100 % Determinista (Patch No Destructivo) | Crea/actualiza contacto con validación E.164 (`libphonenumber-js`), semántica `COALESCE(NULLIF(..., ''), actual)`, libreta de direcciones internacional de 8 campos y consentimientos Habeas Data (`data_treatment`, `commercial_comms`). |
| **8** | `register_order` | `POST /api/v1/agent/orders/register` | 100 % Determinista e Idempotente | Cotiza obligatoriamente en servidor vía `quoteOrderItems()` (sin campos de precio en entrada), registra el pedido idempotente por `chatwootConversationId` (`BotOrderCaptureService`), desactiva seguimientos (`followup_active = false`), retorna `ORD-YYYYMM-####`, `paymentChannels` y `closingRequired`. |
| **9** | `commit_conversation_turn` | `POST /api/v1/agent/turn-commit` | Orquestación Idempotente | Protegido por `idempotencyKey` en Redis: procesa `inferenceIncident` (failover/anti-flood 30 min) y `requestHumanHandoff`, actualiza `conversation_state` (`turn_count`, `bot_paused`, `followup_active`, `operational_labels`), aplica clasificación monotónica + `GET→merge→POST` en Chatwoot (conversación y contacto) + `priority` + `custom_attributes` frescos, compila `deliveryPlan` endurecido (`postMediaPauseMs`, Anti-Caption, `MAX_SEGMENTS=6`), despacha opcionalmente vía `after()`, registra `ai_usage_events` y consolida `contact_memories`. |
| **Aux** | *(Solo REST M2M — no expuesto al LLM)* | `POST /api/v1/agent/media-receipts` | Infraestructura Idempotente | Registra recibos `(chatwootConversationId, chatwootMessageId, productId, mediaId, mediaKind)` en `admin.conversation_sent_media_log` cuando `mocter-engine` ejecuta `deliveryPlan` directamente (`dispatchToChatwoot = false`), habilitando la correlación `in_reply_to`. |

---

## 6. Requisitos Funcionales

| ID | Requisito |
| --- | --- |
| **RF-SPEC-23-01** | Declarar y validar en `packages/domain/src/utils/env.ts`, `apps/admin/env.ts` y `.env.example`: `MOCTER_AGENT_SERVICE_KEY`, `MOCTER_PUBLIC_ADMIN_URL`, `MOCTER_PUBLIC_MEDIA_SIGNING_KEY`, `MOCTER_PUBLIC_MEDIA_TTL_SECONDS` (default `3600`), `MOCTER_AGENT_RATE_LIMIT_PER_CONV_PER_MIN` (default `30`), `MOCTER_STT_API_KEY` (opcional), `MOCTER_WHATSAPP_POST_MEDIA_PAUSE_MS` (default `5000`, máx. `8000`) y `MOCTER_INCIDENT_COOLDOWN_SECONDS` (default `1800`), y ampliar la redacción en `packages/domain/src/utils/logger.ts` (`x-mocter-agent-key`, `mocter_agent_service_key`, `mocter_stt_api_key`, `sig=`). |
| **RF-SPEC-23-02** | Actualizar esquemas celulares (`conversation-state.ts`, `tenancy-catalog.ts`), `ConversationStateService` y crear migraciones celulares `0029` / `0030` (con snapshots y `_journal.json`) añadiendo: (a) en `admin.conversation_state`: `bot_paused`, `bot_paused_reason`, `bot_paused_at`, `turn_count`, `operational_labels`, `followup_active`, `last_committed_message_id` y remoción del `CHECK` rígido de 4 slugs; (b) en `admin.tenant_labels`: `chatwoot_priority` e `is_conversion` con backfill idempotente; (c) nueva tabla `admin.conversation_sent_media_log` con `FORCE ROW LEVEL SECURITY` e índice `(client_id, chatwoot_message_id)`. |
| **RF-SPEC-23-03** | Actualizar `apps/admin/proxy.ts` para eximir del chequeo de cookie `mocter_sid` a `/api/v1/agent/`, `/api/v1/mcp` y `/api/v1/public-media/` inyectando/propagando siempre `x-request-id`, corregir el bypass accidental de `pathname.includes(".")` sobre `/api/v1/agent/openapi.json` y sanitizar el `detail` de respuestas `500` en `apps/admin/lib/errors/route.ts` (`handle()`). |
| **RF-SPEC-23-04** | Implementar `public-media-signer.ts` (HMAC-SHA256 con separación de dominio + `imgproxy` `@jpg`/`@png` + `whatsappCompatible`), `GET /api/v1/public-media/[mediaId]/route.ts` (streaming SeaweedFS S3 con `HTTP 206 Range` y `Cache-Control: private, max-age=<min(300, ttlRestante)>`) y `turn-delivery-compiler.ts` (`compileTurnDeliveryPlan` con normalización `\r\n`, `[[SPLIT:media]]`, `MAX_SEGMENTS = 6`, `postMediaPauseMs`, red de seguridad para URLs crudas del dominio confiable, resolución `productId → media_term → slug(name)` y Regla Anti-Caption sin reordenamiento ciego). |
| **RF-SPEC-23-05** | Implementar `ChatwootHttpConversationGateway` en `@mocter/domain` sobre `CHATWOOT_INTERNAL_URL` con `service_token` descifrado para: `updateConversationLabels` y `updateContactLabels` (`GET → merge → POST` preservando etiquetas manuales), `getConversationDetails`, `updateConversationCustomAttributes` (lectura fresca + merge sin pisar `desactivar_bot`), `updateConversationPriority`, `getRecentMessages` (filtrando `private !== true && message_type !== 2`), `handoffToHumanAgent`, `sendPrivateNote`, `sendTextMessage` y `sendMediaAttachment` (`multipart/form-data` devolviendo `chatwootMessageId`). |
| **RF-SPEC-23-06** | Extender `PromptComposer` (`currentDateTimeIso`/`timezone` → `{fecha_actual}`/`{{current_date}}` localizado), `lead-classifier.ts` / `LeadClassifierOrchestrator` (protección monotónica de `is_conversion` permitiendo `devolucion` y todas las etiquetas operativas), e implementar los esquemas Zod v4 unificados (`agent-gateway.schemas.ts`) y `AgentGatewayOrchestratorService` cubriendo las 9 operaciones canónicas + `recordSentMediaReceipts`, con recálculo obligatorio en `registerOrder`, patch no destructivo en `upsertContactAndAddress`, circuito de incidentes BYOK/LLM (pre-vuelo + runtime, failover-aware + anti-flood Redis 30 min + `NTF-001`), detención automática de `bot_followup_runs`, correlación `in_reply_to`, adjuntos multimodales + `sttCredential`, idempotencia Redis en `commitConversationTurn` y auditoría en `admin.ai_usage_events`. |
| **RF-SPEC-23-07** | Implementar `apps/admin/lib/agent-auth.ts` (`timingSafeEqual`, anti-conflicto `400 TENANT_CONTEXT_MISMATCH`, rate limit Redis y propagación `X-Mocter-Engine-Run-Id`), los 9 Route Handlers REST + `POST /api/v1/agent/media-receipts` (ejecutando el envío diferido de `dispatchToChatwoot = true` vía `after()` de Next.js 16), OpenAPI 3.1 (`@asteasolutions/zod-to-openapi`) en `GET /api/v1/agent/openapi.json` (autenticada) y visor Scalar (`@scalar/api-reference-react`) en `/api-docs/agent` (solo `platform_admin`/`platform_owner`). |
| **RF-SPEC-23-08** | Implementar el servidor MCP Streamable HTTP Stateless en `apps/admin/app/api/v1/mcp/route.ts` (`POST` para JSON-RPC 2.0 `initialize`, `notifications/initialized` → `202`, `ping`, `tools/list` vía `z.toJSONSchema()` nativo de Zod v4, `tools/call` exponiendo exclusivamente las 9 herramientas canónicas; `GET`/`DELETE` → `405 Allow: POST`). |

---

## 7. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
| --- | --- | --- |
| **RNF-SPEC-23-01** | Latencia de `turn-context` | **P95 ≤ 250 ms** en red interna Docker (incluyendo resolución de celda, upsert de contacto, correlación `in_reply_to`, RAG `contact_memories` y composición IDEAL con caché). |
| **RNF-SPEC-23-02** | Latencia de Tools deterministas | `quote_order_items`, `get_product_details_and_pricing`, `get_product_media_assets` y `resolve_geographic_location`: **P95 ≤ 100 ms**. |
| **RNF-SPEC-23-03** | Streaming `public-media` | TTFB **≤ 150 ms** con soporte completo de `HTTP 206 Partial Content` para reproducción progresiva de audio/video en WhatsApp y móviles. |
| **RNF-SPEC-23-04** | Escalabilidad horizontal / Kubernetes y no bloqueo | Cero estado en memoria en producción; idempotencia, rate limit y cooldown de incidentes en Redis del Control Plane; MCP 100 % stateless; pausas de despacho `dispatchToChatwoot` ejecutadas vía `after()` sin retener respuestas HTTP de `turn-commit`. |
| **RNF-SPEC-23-05** | Seguridad de red, privacidad y secretos | Cero exposición de `/api/v1/agent/*` y `/api/v1/mcp` en Traefik público en producción; cero fugas de `MOCTER_AGENT_SERVICE_KEY`, `MOCTER_STT_API_KEY`, `llmCandidates[*].apiKey`, `sttCredential.apiKey`, `sig=`, mensajes privados de Chatwoot ni `error.message` en `500`. |

---

## 8. Reglas de Negocio (Invariantes)

- **`RN-SPEC-23-01` (Cero precios o totales provenientes del LLM):** El contrato de `register_order` no acepta campos monetarios desde `mocter-engine`; el total siempre proviene de `quoteOrderItems()`.
- **`RN-SPEC-23-02` (Multimedia 100 % descargable sin 401/422 en WhatsApp y Chatwoot):** Toda imagen apunta a `imgproxy` firmado (`@jpg`/`@png`), y todo audio/video/PDF apunta a `/api/v1/public-media/:mediaId?...` firmado con HMAC-SHA256. Ninguna URL del Gateway apunta a `/api/tenant/media/*`.
- **`RN-SPEC-23-03` (Regla Anti-Caption y Pausa Post-Multimedia sin reordenamiento ciego):** Ningún paso `media` de `deliveryPlan` lleva `caption` con texto comercial mezclado; cualquier URL cruda del dominio confiable se extrae a paso `media`; en WhatsApp todo texto posterior a un `media` espera `postMediaPauseMs`; nunca se reordenan todos los binarios al inicio violando el orden de `SPEC-19`.
- **`RN-SPEC-23-04` (Idempotencia estricta de `turn-commit`):** Dos llamadas con el mismo `idempotencyKey` producen exactamente un envío de burbujas, un registro de tokens y una actualización de `turn_count`.
- **`RN-SPEC-23-05` (Cero ambigüedad de inquilino):** Ante discrepancia entre `X-Mocter-Client-Id`, `body.clientId` o `chatwootAccountId`, la petición se rechaza inmediatamente con `400 TENANT_CONTEXT_MISMATCH`.
- **`RN-SPEC-23-06` (Patch no destructivo de contactos):** `upsert_contact_and_address` jamás sobrescribe campos existentes con valores vacíos o nulos.
- **`RN-SPEC-23-07` (Protección monotónica de conversión con excepción de postventa y operativas):** Una conversación con etiqueta funcional marcada `is_conversion = true` nunca retrocede a `lead-frio`, `lead-tibio` o `lead-caliente`, pero siempre admite `devolucion` y cualquier etiqueta operativa (`soporte_humano`, `pagado`, `despachado`, etc.).
- **`RN-SPEC-23-08` (Preservación de etiquetas manuales y control humano en Chatwoot):** Toda sincronización de etiquetas en conversación o contacto usa `GET → merge → POST`; toda actualización de `custom_attributes` lee el estado fresco de Chatwoot y respeta `desactivar_bot = true` activado por un humano; ningún mensaje `private === true` o `message_type === 2` se entrega al contexto visible del cliente.
- **`RN-SPEC-23-09` (Escalamiento seguro y anti-flood en incidentes BYOK/LLM):** Un fallo total de credenciales pausa el bot, marca la conversación urgente, publica nota privada y notifica por correo con enfriamiento de 30 minutos por inquilino; un fallo parcial con failover activo no interrumpe la venta.

---

## 9. Exclusiones Explícitas (Fuera de Alcance de `SPEC-23`)

Para mantener contratos limpios, agnósticos de proveedor y acotados al dominio actual de Mocter, quedan **explícitamente fuera de alcance** de `SPEC-23`:
1. **Herramientas de agenda y citas (Cal.com o calendarios externos):** El agendamiento de citas médicas/servicios corresponde a una especificación dedicada futura sobre el dominio de citas y no se mezcla con el núcleo de comercio electrónico/ventas.
2. **Herramienta artificial `Think` para el LLM:** El razonamiento paso a paso se maneja con capacidades nativas de los modelos modernos y el grafo de estados de LangGraph (`mocter-engine`).
3. **Herramientas separadas de etiquetado o prioridad expuestas al LLM (`etiqueta_compra`, `actualizar_prioridad_urgente`):** Las etiquetas de conversión, la prioridad urgente y la detención de seguimientos se ejecutan de forma 100 % determinista dentro de `register_order` y `turn-commit`, nunca dependiendo de que el LLM recuerde invocar una tool adicional.
4. **Validación frágil de API Keys por prefijo (`sk-`) o longitud fija:** Mocter opera multi-proveedor (OpenAI, Anthropic, Google Gemini, DeepSeek, etc.), por lo que las credenciales se validan por resolución real y códigos de estado HTTP/SDK, nunca por heurísticas de prefijo.

---

## 10. Criterios de Aceptación (Gherkin)

```gherkin
Característica: Gateway Híbrido REST (OpenAPI 3.1) + MCP Stateless, Multimedia Firmada, Resiliencia BYOK y Orquestación M2M para mocter-engine

  Escenario: Bootstrap de turno en red interna Docker con correlación in_reply_to y adjuntos multimodales
    Dado que el comercio envió previamente la imagen del producto "Hidrolavadora a Vapor" con chatwoot_message_id 4501 registrado en conversation_sent_media_log
    Y el comprador responde citando el mensaje 4501 adjuntando una imagen de comprobante y una nota de voz
    Cuando mocter-engine invoca "POST /api/v1/agent/turn-context" con inReplyToChatwootMessageId=4501 y message.attachments
    Entonces proxy.ts permite el paso sin cookie inyectando "x-request-id"
    Y Mocter retorna repliedMediaContext apuntando a "Hidrolavadora a Vapor" en menos de 250 ms
    Y normaliza ambos adjuntos (imagen y audio) con internalDownloadUrl hacia CHATWOOT_INTERNAL_URL junto con sttCredential y {fecha_actual} en la zona horaria del comercio

  Escenario: Registro de pedido determinista ignora precios externos, aplica cotización oficial y detiene seguimientos
    Dado un producto activo "Hidrolavadora a Vapor" con precio regular 156.000 COP y promoción vigente de 140.400 COP
    Cuando mocter-engine invoca la tool MCP "register_order" con productId y quantity=2 (sin campos de precio)
    Entonces Mocter ejecuta internamente quoteOrderItems, valida stock y atributos obligatorios
    Y persiste la orden idempotente con unitPriceCents=14040000 y subtotalCents=28080000
    Y establece conversation_state.followup_active=false deteniendo las ejecuciones activas en bot_followup_runs

  Escenario: Entrega multimedia con pausa post-multimedia, red de seguridad URL y despacho no bloqueante via after()
    Dado una respuesta del agente en WhatsApp con "[[MEDIA:hidrolavadora_a_vapor:image]] Mira las especificaciones [[SPLIT]] ¿A qué ciudad te lo enviamos?"
    Cuando mocter-engine invoca turn-commit con dispatchToChatwoot=true
    Entonces compileTurnDeliveryPlan separa el paso media (caption=null, URL imgproxy @jpg) seguido del paso text con pauseMs >= 5000 ms
    Y el Route Handler responde inmediatamente con dispatchStatus="scheduled_async" ejecutando los envíos y pausas dentro de after() sin bloquear la petición HTTP
    Y registra el chatwoot_message_id devuelto por Chatwoot en conversation_sent_media_log

  Escenario: Protección monotónica de compra-realizada con soporte de devolucion y etiquetas operativas sin pisar manuales
    Dado una conversación con etiqueta funcional "compra-realizada" (is_conversion=true) y etiqueta manual "vip-bogota" en Chatwoot
    Cuando el clasificador sugiere degradar a "lead-caliente" junto con la etiqueta operativa "soporte_humano"
    Entonces Mocter bloquea la degradación conservando "compra-realizada", aplica "soporte_humano" y conserva "vip-bogota" mediante GET→merge→POST en conversación y contacto
    Y establece la prioridad de la conversación en "urgent"

  Escenario: Incidente total de API Key BYOK pausa el bot, escala a humano y respeta anti-flood de 30 minutos
    Dado que mocter-engine reporta inferenceIncident con scope="total_failure" y errorType="insufficient_quota" en turn-commit
    Cuando Mocter procesa el incidente
    Entonces registra last_verification_error en tenant_ai_providers conservando status="active" (sin violar el CHECK constraint)
    Y pausa el bot, marca prioridad "urgent", fusiona custom_attributes { desactivar_bot: true, sin_api_key: true } y publica nota privada en Chatwoot
    Y envía alerta de correo NTF-001 bloqueando alertas duplicadas durante 30 minutos mediante Redis
```

# SPEC-23 · Plan de Tareas · Gateway Híbrido RESTful (OpenAPI 3.1) + MCP Stateless, Multimedia Firmada, Resiliencia BYOK y Orquestación M2M para `mocter-engine`

| Atributo | Valor |
| --- | --- |
| **ID** | `SPEC-23` |
| **Versión** | `1.2.0` (Post Spec Review + Patrones Operativos de Producción) |
| **Depende de** | [`requirements.md`](requirements.md), [`design.md`](design.md), [SPEC-22](../spec-22-particionamiento-pgvector-embeddings-busqueda-hibrida/tasks.md) |
| **Estado** | Aprobada · Lista para implementación |

---

## Tareas de Implementación

### `T-01` · Entorno, Redacción de Secretos, Evolución Celular (`0029`/`0030`) y Dependencias (`@mocter/domain`, `apps/admin`)
- [ ] **T-01.1**: Registrar y validar en `packages/domain/src/utils/env.ts`, `apps/admin/env.ts` y `.env.example` (`AGENTS.md §4.12`): `MOCTER_AGENT_SERVICE_KEY`, `MOCTER_PUBLIC_ADMIN_URL`, `MOCTER_PUBLIC_MEDIA_SIGNING_KEY`, `MOCTER_PUBLIC_MEDIA_TTL_SECONDS` (default `3600`), `MOCTER_AGENT_RATE_LIMIT_PER_CONV_PER_MIN` (default `30`), `MOCTER_STT_API_KEY` (opcional), `MOCTER_WHATSAPP_POST_MEDIA_PAUSE_MS` (default `5000`, máx. `8000`) y `MOCTER_INCIDENT_COOLDOWN_SECONDS` (default `1800`).
- [ ] **T-01.2**: Ampliar `packages/domain/src/utils/logger.ts` para redactar `x-mocter-agent-key`, `mocter_agent_service_key`, `mocter_stt_api_key` y el parámetro `sig=` en URLs de `/api/v1/public-media/`, añadiendo pruebas en `logger.test.ts`.
- [ ] **T-01.3**: Actualizar esquemas celulares en `packages/domain/src/db/schemas/tenant/`:
  - `conversation-state.ts`: añadir `botPaused`, `botPausedReason`, `botPausedAt`, `turnCount`, `operationalLabels`, `followupActive` (`boolean NOT NULL DEFAULT true`) y `lastCommittedMessageId` en `cellConversationState`; permitir cualquier `lastLabel` no vacío; definir nueva tabla `cellConversationSentMediaLog` (`admin.conversation_sent_media_log`) exportada en `tenant/index.ts`.
  - `tenancy-catalog.ts`: añadir `chatwootPriority` y `isConversion` en `cellTenantLabels`.
  - Actualizar `ConversationStateService` (`conversation-state.service.ts`) para soportar los nuevos campos y métodos de lectura/escritura de `conversation_sent_media_log`.
- [ ] **T-01.4**: Crear migraciones celulares `0029_cell_phase13_agent_gateway_spec23.sql` (alteraciones en `conversation_state` y `tenant_labels` + backfill `compra-realizada`/`soporte_humano`/`devolucion` + creación de `conversation_sent_media_log`) y `0030_cell_phase13_rls_grants_comments_spec23.sql` (`ENABLE`/`FORCE RLS`, `GRANT` a `mocter_migrator`/`mocter_admin`/`mocter_app`, `COMMENT ON TABLE`/`COLUMN` y actualización de `meta/_journal.json` + snapshots para `db:check:cell`, respetando `R-09`).
- [ ] **T-01.5**: Añadir `@asteasolutions/zod-to-openapi` (`^9.1.0`) y `@scalar/api-reference-react` (`^0.9.81`) a `apps/admin/package.json` ejecutando `pnpm install`.
- **Verificación:** `pnpm --filter @mocter/domain db:check:cell`, `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain lint`.

### `T-02` · Firmador Multimedia Público, Compilador `deliveryPlan` Endurecido, `PromptComposer`, Clasificador Monotónico y `ChatwootHttpConversationGateway` (`@mocter/domain`)
- [ ] **T-02.1**: Crear `packages/domain/src/utils/public-media-signer.ts` con `signPublicMediaToken`, `verifyPublicMediaToken` (separación de dominio criptográfico + `timingSafeEqual`) y `resolvePublicAgentMediaAsset` (imágenes vía `buildImgproxyUrl` en `@jpg`/`@png`; audios/videos/PDFs vía `${MOCTER_PUBLIC_ADMIN_URL}/api/v1/public-media/:mediaId?clientId=...&exp=...&sig=...`; bandera explícita `whatsappCompatible`).
- [ ] **T-02.2**: Crear `packages/domain/src/services/turn-delivery-compiler.ts` (`compileTurnDeliveryPlan`) con normalización `\r\n` → `\n`, soporte `[[SPLIT]]`/`[[SPLIT:ms]]`/`[[SPLIT:media]]`, tope `MAX_SEGMENTS = 6` (`wasTruncated`), resolución `productId → media_term → slugifyMediaTerm(name)` + `audioOrder` 1-based, red de seguridad para URLs crudas de `IMGPROXY_PUBLIC_URL` y `/api/v1/public-media/`, Regla Anti-Caption (`RN-SPEC-23-03`) sin reordenamiento ciego y pausa post-multimedia `postMediaPauseMs` (`MOCTER_WHATSAPP_POST_MEDIA_PAUSE_MS`) en canal WhatsApp.
- [ ] **T-02.3**: Extender `PromptComposer` (`packages/domain/src/services/prompt-composer.ts`) con `currentDateTimeIso` y `timezone` para inyectar `{fecha_actual}` / `{{current_date}}` localizado con `Intl.DateTimeFormat`, y extender `lead-classifier.ts` + `lead-classifier-orchestrator.ts` con protección monotónica para etiquetas `isConversion = true` (bloqueando degradación a `lead-frio`/`lead-tibio`/`lead-caliente`, permitiendo `devolucion` y todas las etiquetas operativas + cálculo de `recommendedChatwootPriority`).
- [ ] **T-02.4**: Crear `packages/domain/src/services/chatwoot-conversation.gateway.ts` implementando `ChatwootHttpConversationGateway` sobre `CHATWOOT_INTERNAL_URL` con `service_token` descifrado: `updateConversationLabels` y `updateContactLabels` (`GET → merge → POST` preservando etiquetas manuales), `getConversationDetails`, `updateConversationCustomAttributes` (lectura fresca sin pisar `desactivar_bot: true`), `updateConversationPriority`, `getRecentMessages` (filtrando `private !== true && message_type !== 2`), `handoffToHumanAgent`, `sendPrivateNote`, `sendTextMessage` y `sendMediaAttachment` (`multipart/form-data` retornando `chatwootMessageId`).
- [ ] **T-02.5**: Agregar pruebas unitarias en `public-media-signer.test.ts`, `turn-delivery-compiler.test.ts`, `prompt-composer.test.ts`, `lead-classifier.test.ts` y `chatwoot-conversation.gateway.test.ts`.
- **Verificación:** `pnpm --filter @mocter/domain test`.

### `T-03` · Esquemas Zod v4 Unificados y `AgentGatewayOrchestratorService` (`@mocter/domain`)
- [ ] **T-03.1**: Crear `packages/domain/src/validation/agent-gateway.schemas.ts` con los esquemas Zod v4 de entrada y salida de las 9 operaciones canónicas + `AgentMediaReceiptsInputSchema`, asegurando que `AgentRegisterOrderInputSchema` excluya campos monetarios (`RN-SPEC-23-01`) y que `AgentTurnCommitInputSchema` exija `idempotencyKey` (`RN-SPEC-23-04`) y soporte `requestHumanHandoff` e `inferenceIncident`.
- [ ] **T-03.2**: Implementar `packages/domain/src/services/agent-gateway-orchestrator.service.ts` coordinando:
  - `bootstrapConversationTurn`: resolución `chatwootAccountId → { clientId, cellId }`, `ingestFromChatwoot`, sincronización de `custom_attributes.desactivar_bot`, guardrails completos (incluyendo circuito pre-vuelo de credenciales LLM), correlación `inReplyToChatwootMessageId → repliedMediaContext`, reescritura de `message.attachments` a `CHATWOOT_INTERNAL_URL`, RAG `contact_memories`, 3 planos IDEAL con `{fecha_actual}` localizada, clasificador dinámico, `llmCandidates [primary, secondary]` y `sttCredential`.
  - `searchCatalogHybrid` (`SPEC-22`), `getProductDetailsAndPricing` y `getProductMediaAssets`.
  - `quoteOrderItems`, `resolveGeographicLocation`, `upsertContactAndAddress` (con semántica estricta de patch no destructivo `COALESCE(NULLIF(..., ''), actual)`) y `registerOrder` (invocando obligatoriamente `quoteOrderItems()` antes de `BotOrderCaptureService.capture()` y deteniendo `followup_active`/`bot_followup_runs`).
  - `commitConversationTurn`: idempotencia en Redis (`agent:commit:${clientId}:${idempotencyKey}` TTL 24h + `conversation_state.last_committed_message_id`), circuito de incidentes BYOK/LLM failover-aware con anti-flood Redis 30 min (`MOCTER_INCIDENT_COOLDOWN_SECONDS`) + `NTF-001` respetando `tenant_ai_providers_status_check`, `requestHumanHandoff`, actualización de `conversation_state`, detención de `bot_followup_runs` en conversión/pausa, clasificación monotónica + `ChatwootHttpConversationGateway` (etiquetas conversación/contacto, `priority`, `custom_attributes` frescos), `compileTurnDeliveryPlan`, registro en `admin.ai_usage_events`, consolidación en `contact_memories` y helper `dispatchCompiledDeliveryPlan` (invocable desde `after()` registrando cada `chatwoot_message_id` en `conversation_sent_media_log`).
  - `recordSentMediaReceipts`: inserción idempotente en `admin.conversation_sent_media_log` para el modo `dispatchToChatwoot = false`.
- [ ] **T-03.3**: Exportar esquemas, utilidades y servicios en `packages/domain/src/index.ts` con documentación TSDoc en español.
- [ ] **T-03.4**: Crear suite unitaria `agent-gateway-orchestrator.service.test.ts` cubriendo guardrails, correlación `in_reply_to`, adjuntos multimodales + `sttCredential`, recálculo de precios en `registerOrder`, patch no destructivo en contactos, protección monotónica, circuito BYOK parcial/total con anti-flood Redis e idempotencia de `commitConversationTurn`.
- **Verificación:** `pnpm --filter @mocter/domain test` y `pnpm --filter @mocter/domain build`.

### `T-04` · Ajustes en `proxy.ts`, Sanitización de `handle()`, Middleware M2M y Streaming `/api/v1/public-media/[mediaId]` (`apps/admin`)
- [ ] **T-04.1**: Actualizar `apps/admin/proxy.ts` para eximir `/api/v1/agent/`, `/api/v1/mcp` y `/api/v1/public-media/` del chequeo de cookie `mocter_sid` propagando siempre `x-request-id`, corregir el bypass accidental de `pathname.includes(".")` sobre `/api/v1/agent/openapi.json` y mantener `/api-docs/agent` protegido por sesión de Backoffice.
- [ ] **T-04.2**: Actualizar `apps/admin/lib/errors/route.ts` (`handle()`) para sanitizar el campo `detail` cuando `status >= 500`, registrando el mensaje real solo en `appLogger.error`.
- [ ] **T-04.3**: Crear `apps/admin/lib/agent-auth.ts` con `verifyAgentServiceAuth(req)` (validación `timingSafeEqual` de `MOCTER_AGENT_SERVICE_KEY`, validación anti-conflicto `400 TENANT_CONTEXT_MISMATCH`, rate limit distribuido en Redis por `(clientId, chatwootConversationId)` → `429` con `Retry-After` y propagación de `X-Mocter-Engine-Run-Id`).
- [ ] **T-04.4**: Crear `apps/admin/app/api/v1/public-media/[mediaId]/route.ts` (streaming SeaweedFS S3 sin cookies, soporte `HTTP 206 Range`, validación de firma HMAC y `Cache-Control: private, max-age=<min(300, ttlRestante)>`).
- [ ] **T-04.5**: Crear pruebas en `apps/admin/lib/agent-auth.test.ts`, `apps/admin/proxy.test.ts` y `apps/admin/app/api/v1/public-media/public-media.route.test.ts`.
- **Verificación:** `pnpm --filter @mocter/admin test`.

### `T-05` · Endpoints REST (`/api/v1/agent/*`), Despacho `after()`, OpenAPI 3.1 + Scalar y Servidor MCP Stateless (`POST /api/v1/mcp`) (`apps/admin`)
- [ ] **T-05.1**: Implementar en `apps/admin/app/api/v1/agent/` los 9 Route Handlers canónicos + el endpoint auxiliar de recibos, todos envueltos en `handle()`:
  - `POST /api/v1/agent/turn-context/route.ts`
  - `POST /api/v1/agent/catalog/search/route.ts`
  - `GET /api/v1/agent/catalog/products/[productId]/route.ts`
  - `GET /api/v1/agent/catalog/products/[productId]/media/route.ts`
  - `POST /api/v1/agent/orders/quote/route.ts`
  - `POST /api/v1/agent/geo/resolve/route.ts`
  - `POST /api/v1/agent/crm/contacts/upsert/route.ts`
  - `POST /api/v1/agent/orders/register/route.ts`
  - `POST /api/v1/agent/turn-commit/route.ts` (programando `dispatchCompiledDeliveryPlan` dentro de `after()` de `next/server` cuando `dispatchToChatwoot === true` y existan pausas)
  - `POST /api/v1/agent/media-receipts/route.ts`
- [ ] **T-05.2**: Crear `apps/admin/lib/agent-openapi.ts` (`@asteasolutions/zod-to-openapi`), `GET /api/v1/agent/openapi.json/route.ts` (autenticado con `MOCTER_AGENT_SERVICE_KEY` o sesión `platform_admin`/`platform_owner`) y `apps/admin/app/api-docs/agent/page.tsx` (Scalar restringido a `platform_admin`/`platform_owner`).
- [ ] **T-05.3**: Implementar `apps/admin/app/api/v1/mcp/route.ts` (MCP Streamable HTTP Stateless: `POST` con JSON-RPC 2.0 `initialize` `"2025-03-26"`/`"2024-11-05"`, `notifications/initialized` → `202`, `ping`, `tools/list` con `z.toJSONSchema()` de Zod v4 exponiendo las 9 herramientas canónicas, `tools/call` con inyección de `X-Mocter-Client-Id`; `GET`/`DELETE` → `405 Allow: POST`).
- [ ] **T-05.4**: Crear pruebas `apps/admin/app/api/v1/agent/agent-routes.test.ts` (verificando también programación en `after()` y `POST /api/v1/agent/media-receipts`) y `apps/admin/app/api/v1/mcp/mcp.route.test.ts`.
- **Verificación:** `pnpm --filter @mocter/admin test` y `pnpm --filter @mocter/admin lint`.

### `T-06` · Migración Celular, Compilación Integral, Reinicio de Contenedores y Health Check (`AGENTS.md §4.18`)
- [ ] **T-06.1**: Aplicar migraciones celulares `0029` y `0030` en la celda activa (`CellMigrationService` / `db:migrate:cell`) y ejecutar `pnpm lint`, `pnpm test`, `pnpm --filter @mocter/domain db:check:cell`, `pnpm --filter @mocter/domain build` y `next build` en `apps/admin` y `apps/web`.
- [ ] **T-06.2**: Recompilar y reiniciar los contenedores Docker afectados (`mocter-core-admin-portal-1`, `mocter-core-web-portal-1`), verificar HTTP `200` en `/api/v1/agent/openapi.json` (autenticado), `POST /api/v1/mcp` (`tools/list`), `GET /api/v1/public-media/:id` (con firma válida) y `405` en `GET /api/v1/mcp`, inspeccionando logs estructurados sin secretos ni excepciones.
- **Verificación:** Health checks HTTP `200`, pruebas de red interna Docker hacia `admin-portal:3003` y verificación de que Traefik público no exponga `/api/v1/agent/*` ni `/api/v1/mcp`.

# REP-001 · Diseño · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/design.md) · [BOT-001](../bot-001-atencion-automatizada-llm/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Borrador |

## 1. Principios

1. **Una mecánica de períodos, dos superficies.** Día, semana, mes, trimestre, semestre, año y rango personalizado, siempre en la zona horaria del negocio.
2. **Sin SQL entre planos.** La agregación respeta D-19 de ADM-001 y RF-10.8 de DAT-001.
3. **Agregados sin PII.** Los dashboards muestran números, no personas.
4. **El pasado no se recalcula.** Los períodos mayores se componen desde snapshots diarios.
5. **Cada rol ve lo suyo.** El agente ve sus métricas; el dueño y la plataforma, el todo.

## 2. Arquitectura

```text
Celda del inquilino                         Router Global
┌──────────────────────────┐   API   ┌──────────────────────────────┐
│ job nocturno (mocter-    │────────►│ job de plataforma            │
│ admin)                   │         │ agrega por API               │
│  └► report_snapshots     │         │  └► platform_snapshots       │
│     (día, metric_key,    │         │                                │
│      valor)              │         │ Dashboard SaaS: inquilinos,   │
│                          │         │ almacenamiento+dedup, IA,     │
│ Dashboard inquilino:     │         │ comunidades, Chatwoot,        │
│ conversaciones,          │         │ calidad de datos, backups     │
│ prospectos, bot,         │         │                                │
│ productos, etiquetas,    │         └──────────────────────────────┘
│ agentes, cuota           │
└──────────────────────────┘
```

## 3. Modelo de datos

### 3.1 `report_snapshots` (celda, RLS)

| Atributo | Regla |
|---|---|
| `client_id` + `id` | PK compuesta, RLS |
| `period_type` | `day` (la única fila materializada; el resto se compone) |
| `period_start` · `period_end` | Fechas en la zona del inquilino |
| `metric_key` | Clave estable de la métrica (§4) |
| `value` JSONB | Valor escalar u objeto por dimensión (canal, origen, etapa…) |
| Auditoría | `created_at`, `created_by = 'mocter-admin'` (job) |

Único `(client_id, period_start, metric_key)`; append-only por día (se reescribe el día en curso hasta su cierre).

### 3.2 `platform_snapshots` (Router Global)

| Atributo | Regla |
|---|---|
| `id` | PK |
| `period_start` · `metric_key` | Único `(period_start, metric_key)` |
| `value` JSONB | Agregado de todas las celdas vía API |
| Auditoría | `created_by = 'mocter-admin'` (job) |

## 4. Métricas

### 4.1 Inquilino (`metric_key`)

| Grupo | Claves |
|---|---|
| Conversaciones | `conversations_new`, `conversations_closed`, `conversations_open_eod`, `conversations_resolved`, `first_response_avg_minutes`, `resolution_avg_minutes`, `csat_avg`, `conversations_by_channel` |
| Prospectos | `prospects_new`, `prospects_by_source`, `prospects_by_stage`, `conversion_rate`, `consent_rate` |
| Bot | `bot_messages`, `bot_handoffs`, `bot_self_resolution_rate`, `followups_sent`, `followups_replied`, `tokens_in`, `tokens_out`, `tokens_cost_cents` |
| Productos | `products_active`, `products_top_consulted`, `shares_published`, `adoptions_received` |
| Etiquetas y agentes | `labels_top`, `agents_workload`, `resolutions_by_agent` |
| Almacenamiento | `storage_used_bytes`, `storage_limit_bytes`, `files_uploaded`, `external_links` |

### 4.2 SaaS (`metric_key`)

| Grupo | Claves |
|---|---|
| Inquilinos | `clients_total`, `clients_new`, `clients_active`, `clients_suspended`, `clients_churned`, `clients_by_plan`, `clients_by_region`, `clients_by_industry` |
| Almacenamiento | `storage_total_bytes`, `storage_growth`, `storage_top_clients`, `dedup_ratio`, `external_links_total` |
| IA | `ai_tokens_by_mode`, `bots_active`, `providers_usage`, `presets_usage`, `projected_spread_cents` |
| Comunidades | `orgs_active`, `shares_published`, `adoptions_total` |
| Chatwoot | `chatwoot_accounts_by_state`, `sync_errors` |
| Calidad de datos | `prospects_without_consent_pct`, `invalid_emails_pct`, `duplicates_pct` |
| Operación | `backup_health` (OPS-001) |

## 5. Motor de períodos

- El snapshot diario cierra en la zona horaria del inquilino (`clients.timezone`).
- Semana, mes, trimestre, semestre y año se **componen sumando los snapshots diarios** del rango; el rango personalizado usa la misma composición con fecha de inicio y fin libres.
- Cada vista muestra el delta contra el período anterior equivalente (RF-01.3).

## 6. Roles y export

- `tenant_owner`: dashboard completo; `tenant_agent`: solo sus claves (`agents_workload`, `resolutions_by_agent`, sus conversaciones y sus prospectos).
- SaaS: `platform_admin`/`platform_owner` completo; `platform_sales` ve inquilinos, planes, IA y recaudación proyectada, sin datos operativos de conversaciones.
- Export: CSV por vista y resumen PDF del período (O-02 define archivo vs vista de impresión).

## 7. i18n

Ambas superficies en es/en (Español por defecto); las etiquetas de las métricas viven en los diccionarios.

## 8. Verificación

| Control | Prueba |
|---|---|
| Períodos | Una métrica en `America/Bogota` no cuenta interacciones del día siguiente en UTC; semana/mes se componen desde snapshots diarios y coinciden con el rango |
| Sin PII | Ningún agregado contiene email, teléfono ni contenido de conversación |
| Roles | Un `tenant_agent` no ve métricas de otro agente ni las agregadas del inquilino |
| Agregación SaaS | `platform_snapshots` coincide con la suma de las celdas por API |
| Export | CSV y PDF se generan para cada período y en ambos idiomas |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Carga de agregación nocturna | Job acotado por lote; reescritura del día en curso idempotente |
| Tamaño de snapshots | Una fila por métrica y día; retención configurable (O-01) |
| Divergencia celda vs Chatwoot | La fuente conversacional es la API de Chatwoot en el momento del snapshot |
| Exposición de datos | Roles + agregados sin PII + auditoría de accesos |

## 10. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| ADM-001 | `clients` (timezone, plan, industria), `client_usage`, `chatwoot_accounts`, `tenant_labels`, D-19 |
| CRM-001 | Prospectos y consentimientos en agregado |
| BOT-001 | `ai_usage_events` (tokens, propósito), bots, recordatorios |
| CHW-001 | Conversaciones, CSAT y etiquetas por API |
| OPS-001 | Salud de backups y alertas |
| DAT-001 | RLS, RF-10.9, sin FK entre planos |

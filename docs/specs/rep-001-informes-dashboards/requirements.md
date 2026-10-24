# REP-001 · Requisitos · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md) · [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [OPS-001](../ops-001-operacion-continuidad-observabilidad/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Borrador |

## 1. Propósito

Dos superficies de informes con una sola mecánica de períodos: el **dashboard operativo del inquilino** (conversaciones, prospectos, bot, productos, etiquetas, agentes y almacenamiento) y el **dashboard de negocio de la SaaS** (inquilinos, crecimiento del almacenamiento por la multimedia cargada, IA, comunidades y calidad de datos). Períodos: día, semana, mes, trimestre, semestre, año y rango personalizado.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «Plantea sin ajustar especificaciones un tema de informes para la operacion de los inquilinos y un dashboard informativo con la estadistica de la operativa diaria, semanal, mensual, trimestral, semestral, anual y por un rango de fechas establecidas.»
- «Tambia para la SaaS pero con al informacion propia de cantidad de inquilinos, basado en los archivos multimedia cargados por los inquilinos para llevar el control de crecimiento del almacenamiento y demas informacion relevante del negocio»
- «Aprobado documenta»

## 3. Requisitos funcionales

### RF-01 · Períodos

| ID | Requisito |
|---|---|
| RF-01.1 | Toda métrica se calcula para día, semana, mes, trimestre, semestre, año y un rango de fechas personalizado. |
| RF-01.2 | Los períodos se calculan en la zona horaria del inquilino (`clients.timezone`); para la SaaS, en la zona de la plataforma. |
| RF-01.3 | El rango personalizado admite cualquier par de fechas y compara contra el período anterior equivalente (delta). |

### RF-02 · Dashboard del inquilino

| ID | Requisito |
|---|---|
| RF-02.1 | Conversaciones: nuevas, cerradas, abiertas al cierre, resueltas, tiempo de primera respuesta, tiempo de resolución, CSAT promedio y desglose por canal. |
| RF-02.2 | Prospectos: nuevos por origen, por etapa, conversión prospecto→cliente, por agente asignado y % con consentimiento vigente. |
| RF-02.3 | Bot: mensajes atendidos, handoffs a humano, tasa de auto-resolución, recordatorios enviados y respondidos, tokens y costo estimado. |
| RF-02.4 | Productos: activos, más consultados/compartidos por el bot, publicaciones en comunidad y clones adoptados. |
| RF-02.5 | Etiquetas: top de etiquetas aplicadas; agentes: carga y resoluciones; almacenamiento: consumo vs cuota, archivos subidos y enlaces externos vs internos. |

### RF-03 · Dashboard de la SaaS

| ID | Requisito |
|---|---|
| RF-03.1 | Inquilinos: totales, nuevos, activos, suspendidos, bajas (churn), por plan, por región y por vertical (`industry`). |
| RF-03.2 | Almacenamiento: crecimiento por período, GB por inquilino (top), total facturado, headroom de cuota, archivos totales, **ratio de deduplicación** (bytes físicos vs referenciados) y enlaces externos que no consumen cuota. |
| RF-03.3 | IA: tokens por inquilino y modo (BYOK/Mocter), bots activos, proveedores y presets más usados, recaudación proyectada del spread (propuesta BOT-001). |
| RF-03.4 | Comunidades, Chatwoot (cuentas por estado, errores de sincronización), calidad de datos (consentimiento, emails inválidos, duplicados) y operación (salud de backups, OPS-001). |

### RF-04 · Snapshots y agregación

| ID | Requisito |
|---|---|
| RF-04.1 | Un job nocturno materializa agregados diarios por inquilino (`report_snapshots`, en la celda) leyendo celda y Chatwoot por API; sin SQL entre planos (ADM-001 D-19). |
| RF-04.2 | La SaaS agrega los snapshots de todas las celdas por API en `platform_snapshots` (Router Global). |
| RF-04.3 | Los agregados no contienen datos personales de prospectos ni contenidos de conversaciones. |
| RF-04.4 | Un período mayor (semana, mes, …) se compone desde los snapshots diarios; no se recalcula desde el origen. |

### RF-05 · Roles y export

| ID | Requisito |
|---|---|
| RF-05.1 | El `tenant_owner` ve todo el dashboard del inquilino; el `tenant_agent` solo sus métricas propias (D-31 de ADM-001). En la SaaS, `platform_admin`/`platform_owner` ven todo y `platform_sales` lo comercial. |
| RF-05.2 | Export CSV de cualquier vista y resumen PDF del período. |
| RF-05.3 | La UI cumple la directiva de i18n (es/en, Español por defecto) y todo acceso a los dashboards se audita. |

## 4. Decisiones del borrador

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | Una sola mecánica de períodos para ambas superficies. | Día a año y rango personalizado se comportan igual en inquilino y SaaS. |
| D-02 | Snapshots diarios en la celda + agregación por API en el Router. | Respeta D-19 y RF-10.8 (sin SQL ni FK entre planos). |
| D-03 | Los períodos se computan en `clients.timezone`. | Un «día» significa el día del negocio, no el del servidor. |
| D-04 | Sin PII en los agregados. | Los dashboards no exponen datos personales de prospectos. |
| D-05 | Export CSV + resumen PDF. | El inquilino y la SaaS pueden llevar los informes a sus propios procesos. |

## 5. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿Retención de los snapshots diarios (12 meses por defecto)? | Define almacenamiento y ventanas históricas. |
| O-02 | ¿El resumen PDF es un archivo generado o una vista de impresión? | Define si se genera, almacena y expira un archivo. |
| O-03 | ¿El job de materialización corre una vez por día (nocturno) o también bajo demanda? | Define frescura vs costo de agregación. |

## 6. Fuera de alcance

BI empresarial con data warehouse externo, reportes contables o fiscales, paneles de Chatwoot (se consumen por API, no se replican) y métricas de infraestructura (OPS-001 tiene las suyas).

## 7. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Consume `clients`, `client_usage`, `chatwoot_accounts`, `tenant_labels` y la agregación D-19. |
| CRM-001 | Consume prospectos y consentimientos en agregado, sin PII. |
| BOT-001 | Consume `ai_usage_events`, bots y recordatorios; alimenta la recaudación proyectada del spread. |
| CHW-001 | Conversaciones y CSAT por API de Chatwoot. |
| OPS-001 | Salud de backups en el dashboard de la SaaS. |
| DAT-001 | Auditoría RF-10.9; snapshots en celda y Router sin FK entre planos. |

## 8. Trazabilidad

- L1 (2026-10-23): «Plantea sin ajustar especificaciones un tema de informes para la operacion de los inquilinos y un dashboard informativo con la estadistica de la operativa diaria, semanal, mensual, trimestral, semestral, anual y por un rango de fechas establecidas. Tambia para la SaaS pero con al informacion propia de cantidad de inquilinos, basado en los archivos multimedia cargados por los inquilinos para llevar el control de crecimiento del almacenamiento y demas informacion relevante del negocio, analiza y propon para ambos actores del negocio inquilino y la propia SaaS y teniendo en cuenta los datos procesados informes y dashboard muy utiles para cada caso.»
- L2 (2026-10-23): «Aprobado documenta»

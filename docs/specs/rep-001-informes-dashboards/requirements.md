# REP-001 · Requisitos · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/requirements.md) · [BOT-001](../bot-001-atencion-automatizada-llm/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [OPS-001](../ops-001-operacion-continuidad-observabilidad/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Dos superficies de informes analíticos calculados **en caliente** sobre la base de datos con una sola mecánica de períodos: el **dashboard operativo del inquilino** (conversaciones, prospectos, bot, productos, etiquetas, agentes y cuota de almacenamiento) y el **dashboard de negocio de la SaaS** (inquilinos, crecimiento del almacenamiento por multimedia cargada, consumo de IA, comunidades y calidad de datos). Soporta filtros por día, semana, mes, trimestre, semestre, año y rango personalizado, con exportación nativa a **Excel (`.xlsx`) y PDF (`.pdf`)**.

## 2. Requisitos de origen (decisiones del usuario, verbatim)

- «Plantea sin ajustar especificaciones un tema de informes para la operacion de los inquilinos y un dashboard informativo con la estadistica de la operativa diaria, semanal, mensual, trimestral, semestral, anual y por un rango de fechas establecidas.»
- «Tambia para la SaaS pero con al informacion propia de cantidad de inquilinos, basado en los archivos multimedia cargados por los inquilinos para llevar el control de crecimiento del almacenamiento y demas informacion relevante del negocio»
- «Omitir no es necesario en esta version» (sobre snapshots y materialización nocturna).
- «Sin snapshots» (sobre O-01 y O-03).
- «formatos admisibles para exportar Excel y pdf».
- «Es necesario definir los criterios, para ello propon criterios y pregunta para aprobarlos.»
- Aprobado el 2026-10-24: paquete de 5 criterios BDD en caliente (filtros diario a anual + rango libre, exportación Excel/PDF nativa, y aislamiento por `client_id`).

## 3. Requisitos funcionales

### RF-01 · Períodos y cálculo en caliente
| ID | Requisito |
|---|---|
| RF-01.1 | Toda métrica se calcula **en caliente** (on-the-fly) mediante consultas SQL optimizadas con índices temporales y cláusula de particionado lógico (`WHERE client_id = ? AND created_at BETWEEN ? AND ?`). |
| RF-01.2 | El selector temporal soporta 7 modos: `diario`, `semanal`, `mensual`, `trimestral`, `semestral`, `anual` y `rango personalizado` (con `start_date` y `end_date` libres). |
| RF-01.3 | Los períodos se computan en la zona horaria del inquilino (`clients.timezone`); para la SaaS, en la zona horaria de la plataforma (`America/Bogota`). |
| RF-01.4 | Cada consulta compara las métricas contra el período anterior equivalente (delta porcentual y absoluto). |

### RF-02 · Dashboard operativo del inquilino
| ID | Requisito |
|---|---|
| RF-02.1 | **Conversaciones:** Volumen de nuevas, cerradas, abiertas al corte, resueltas, tiempo medio de primera respuesta, tiempo medio de resolución y desglose por canal de atención. |
| RF-02.2 | **Prospectos:** Nuevos por origen, distribución por etapa del pipeline comercial, tasa de conversión (prospecto → cliente) y porcentaje con consentimiento Habeas Data vigente. |
| RF-02.3 | **Bot:** Total de mensajes atendidos, transferencias a agentes humanos (handoffs), tasa de auto-resolución, recordatorios enviados/respondidos y tokens consumidos. |
| RF-02.4 | **Productos y Catálogo:** Productos activos, más consultados/compartidos por el bot y publicaciones adoptadas en comunidad. |
| RF-02.5 | **Almacenamiento y Agentes:** Consumo en bytes vs cuota del plan, archivos subidos, enlaces multimedia externos y carga de trabajo por agente. |

### RF-03 · Dashboard de negocio de la SaaS
| ID | Requisito |
|---|---|
| RF-03.1 | **Inquilinos:** Total registrados, nuevos en el período, activos, suspendidos, churn, distribución por plan y vertical de industria. |
| RF-03.2 | **Almacenamiento Global:** Crecimiento en GB por período, top inquilinos por consumo, total facturado, headroom de cuota y ratio de deduplicación de multimedia. |
| RF-03.3 | **Inteligencia Artificial:** Tokens procesados por modo (BYOK vs Mocter), presets de bot más utilizados y recaudación acumulada por spread de inferencia. |
| RF-03.4 | **Calidad de Datos y Salud:** Porcentaje de prospectos con consentimiento, cuentas Chatwoot sincronizadas, errores de integración y estado de backups diarios. |

### RF-04 · Exportación de reportes (Excel y PDF)
| ID | Requisito |
|---|---|
| RF-04.1 | Toda vista analítica y tabla de desglose permite la exportación estricta en dos formatos: **Excel (`.xlsx`)** y **PDF (`.pdf`)**. Se excluye el formato CSV plano. |
| RF-04.2 | La exportación a Excel incluye cabeceras estilizadas, celdas tipadas (fechas, monedas, enteros) y el resumen de los filtros temporales aplicados. |
| RF-04.3 | La exportación a PDF genera un documento vectorizado paginado con membrete del inquilino (o SaaS), resumen de KPIs principales, gráficas renderizadas y tabla de detalle. |

### RF-05 · Roles, seguridad e i18n
| ID | Requisito |
|---|---|
| RF-05.1 | En el inquilino: `tenant_owner` y `tenant_admin` visualizan todas las métricas operativas; `tenant_agent` accede únicamente a sus propias estadísticas de conversaciones y prospectos asignados (D-31). |
| RF-05.2 | En la SaaS: `platform_owner` y `platform_admin` acceden al dashboard global completo; `platform_sales` accede a métricas de inquilinos y facturación, sin datos operativos internos. |
| RF-05.3 | Todas las consultas y exportaciones filtran obligatoriamente por el `client_id` de la sesión activa, garantizando aislamiento multi-inquilino estricto. |
| RF-05.4 | La interfaz y los archivos generados están internacionalizados (es/en, Español por defecto). |

---

## 4. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Latencia de Consulta | P95 ≤ 800 ms para consultas analíticas de períodos predefinidos o rangos de hasta 1 año calendario. |
| RNF-02 | Optimización de Base de Datos | Todas las consultas analíticas utilizan índices compuestos `(client_id, created_at)` o `(client_id, status, created_at)`, garantizando planes de ejecución `Index Scan` sin `Seq Scan`. |
| RNF-03 | Generación de Exportables | Tiempo de generación y descarga de Excel/PDF ≤ 3.0 s para conjuntos de hasta 5,000 filas. |
| RNF-04 | Disponibilidad | 99.9% de uptime para los endpoints de métricas y dashboards. |
| RNF-05 | Cero PII en Agregados | Los payloads JSON de métricas consolidadas contienen exclusivamente conteos, promedios, sumas y series temporales numéricas; nunca nombres, emails ni teléfonos. |

---

## 5. Criterios de Aceptación (BDD)

### CA-REP-01 · Cálculo en caliente por períodos predefinidos
- **Dado** un usuario autenticado con rol `tenant_owner` o `tenant_admin`,
- **Cuando** consulta el dashboard operativo seleccionando cualquiera de los períodos predefinidos (`diario`, `semanal`, `mensual`, `trimestral`, `semestral`, `anual`),
- **Entonces** el sistema ejecuta las consultas en caliente contra PostgreSQL filtrando las transacciones del intervalo en su zona horaria (`clients.timezone`),
- **Y** retorna las métricas consolidadas y el delta contra el período anterior en menos de 800 ms sin consultar tablas de snapshots precalculados.

### CA-REP-02 · Rango de fechas personalizado
- **Dado** un usuario en la vista de reportes,
- **Cuando** define un rango libre ingresando `start_date` y `end_date` válidos (donde `end_date >= start_date`),
- **Entonces** el sistema aplica los límites de fecha a las consultas en caliente y devuelve la agregación exacta para dicho intervalo;
- **Y si** `end_date < start_date`, el sistema bloquea la consulta informando error de validación temporal.

### CA-REP-03 · Exportación nativa a Excel (.xlsx)
- **Dado** un reporte generado bajo cualquier filtro de período,
- **Cuando** el usuario pulsa el botón "Exportar Excel",
- **Entonces** el servidor genera un archivo binario `.xlsx` válido con cabeceras en negrita, columnas formateadas según tipo de dato y metadatos del filtro aplicado, iniciando la descarga en el navegador en ≤ 3.0 s.

### CA-REP-04 · Exportación a PDF (.pdf)
- **Dado** un reporte analítico del inquilino o de la SaaS,
- **Cuando** el usuario selecciona "Exportar PDF",
- **Entonces** se genera en el servidor un documento `.pdf` con membrete oficial, bloques de KPIs visuales y tabla paginada con numeración de páginas y marca temporal de generación.

### CA-REP-05 · Aislamiento multi-inquilino y scopes por rol (D-31)
- **Dado** un operador perteneciente al inquilino A,
- **Cuando** solicita cualquier endpoint de métricas o exportación de reportes,
- **Entonces** el servidor inyecta de forma forzosa el filtro `client_id = tenant_a_id`, haciendo físicamente imposible acceder a métricas de otros inquilinos;
- **Y si** el usuario tiene rol `tenant_agent`, sus métricas de conversaciones se limitan a aquellas asignadas a su `agent_id`.

---

## 6. Decisiones del documento

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | Una sola mecánica de períodos (diario a anual + rango personalizado) para inquilino y SaaS. | Experiencia unificada en ambas consolas. |
| D-02 | **Cálculo en caliente sin snapshots:** Se eliminan tablas y jobs de materialización nocturna. | Menor complejidad de infraestructura, datos en tiempo real y cero costos de almacenamiento de agregados redundantes en v1. |
| D-03 | Los períodos se computan en la zona horaria del cliente (`clients.timezone`). | Las métricas reflejan el día comercial exacto del inquilino. |
| D-04 | Exportación exclusiva en Excel (`.xlsx`) y PDF (`.pdf`). | Se elimina CSV; se ofrecen formatos ejecutivos listos para uso administrativo. |
| D-05 | Agregados analíticos sin PII. | Los dashboards y exportables protegen la privacidad de datos personales. |

## 7. Decisiones abiertas

No quedan decisiones abiertas en REP-001.

Cerradas el 2026-10-24:
- O-01: Omitido (sin retención de snapshots; se calcula en caliente).
- O-02: Exportación PDF generada en servidor con diseño vectorizado oficial.
- O-03: Omitido (sin jobs de materialización nocturna).

## 8. Fuera de alcance

Data warehouse externo (Snowflake/BigQuery), pipelines ETL complejos, cubos OLAP, réplicas de solo lectura en etapa inicial y reportes contables oficiales (cubiertos por comprobantes en BILL-001).

## 9. Anexo i18n · Catálogo de Cadenas

| Clave | Español (`locales/es.json`) | Inglés (`locales/en.json`) |
|---|---|---|
| `reports.title` | Informes y Estadísticas | Reports and Analytics |
| `reports.period.daily` | Diario | Daily |
| `reports.period.weekly` | Semanal | Weekly |
| `reports.period.monthly` | Mensual | Monthly |
| `reports.period.quarterly` | Trimestral | Quarterly |
| `reports.period.semiannual` | Semestral | Semiannual |
| `reports.period.annual` | Anual | Annual |
| `reports.period.custom` | Rango personalizado | Custom range |
| `reports.export.xlsx` | Exportar a Excel (.xlsx) | Export to Excel (.xlsx) |
| `reports.export.pdf` | Exportar a PDF (.pdf) | Export to PDF (.pdf) |
| `reports.metrics.conversations` | Conversaciones | Conversations |
| `reports.metrics.prospects` | Prospectos | Prospects |
| `reports.metrics.bot_resolution` | Tasa de resolución del bot | Bot resolution rate |
| `reports.metrics.storage` | Consumo de almacenamiento | Storage usage |

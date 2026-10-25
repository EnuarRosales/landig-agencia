# REP-001 · Diseño · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 1.1 (Aprobada — roles D-31 sin tenant_admin) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [CRM-001](../crm-001-prospectos-gestion-comercial/design.md) · [BOT-001](../bot-001-atencion-automatizada-llm/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Aprobada |

## 1. Principios de Diseño

1. **Cálculo en caliente sin sobrecarga:** Se eliminan tablas y jobs de snapshots materializados. Las consultas se calculan en caliente contra PostgreSQL aprovechando índices compuestos por `(client_id, created_at)`.
2. **Una sola mecánica de períodos:** Día, semana, mes, trimestre, semestre, año y rango libre, computados con precisión en la zona horaria del negocio (`clients.timezone`).
3. **Exportación nativa de alta fidelidad:** Formatos ejecutivos directos en **Excel (`.xlsx`) y PDF (`.pdf`)**, sin CSV plano.
4. **Agregados sin PII y RLS estricto:** Ninguna métrica expone datos personales; el aislamiento por `client_id` es no negociable.

## 2. Arquitectura del Motor Analítico

```mermaid
flowchart TD
    subgraph Frontend / UI
        DashboardUI[Vistas de Dashboard & Reportes] -->|GET /api/reports/metrics?period=...| MetricsAPI[/api/reports/metrics]
        DashboardUI -->|GET /api/reports/export?format=xlsx| ExportAPI[/api/reports/export]
    end

    subgraph Backend / mocter-admin
        MetricsAPI --> PeriodResolver[Calculador de Fechas por Timezone]
        PeriodResolver --> QueryEngine[Motor de Consultas en Caliente Drizzle]

        ExportAPI --> PeriodResolver
        ExportAPI --> QueryEngine

        QueryEngine --> DB[(PostgreSQL Celda / Router)]

        QueryEngine --> MetricsFormatter[Formateador de KPIs y Deltas]
        MetricsFormatter --> MetricsAPI

        QueryEngine --> Exporters[Servicio de Exportación]
        Exporters --> ExcelGen[Generador Excel .xlsx - exceljs]
        Exporters --> PDFGen[Generador PDF .pdf - Document Service]
    end
```

## 3. Estrategia de Indexación en Base de Datos

Para garantizar tiempos de respuesta P95 ≤ 800 ms sin requerir materialización nocturna, las tablas transaccionales de dominio en `packages/domain` incorporan los siguientes índices compuestos:

```typescript
// Ejemplo de índices en Drizzle ORM
index('idx_conversations_client_created').on(conversations.clientId, conversations.createdAt),
index('idx_prospects_client_created').on(prospects.clientId, prospects.createdAt),
index('idx_ai_events_client_created').on(aiUsageEvents.clientId, aiUsageEvents.createdAt),
index('idx_orders_client_created').on(orders.clientId, orders.createdAt),
index('idx_invoices_client_created').on(invoices.clientId, invoices.createdAt)
```

Estos índices permiten que el optimizador de PostgreSQL ejecute búsquedas de rango por índice (`Index Scan` o `Bitmap Index Scan`), descartando de inmediato las filas de otros inquilinos y aquellas fuera de la ventana de fechas.

---

## 4. Resolución de Períodos y Zonas Horarias

El módulo `PeriodResolver` convierte la selección del usuario en límites exactos `[period_start, period_end]` y calcula el período anterior equivalente para la comparación de deltas:

| Período | Definición de Inicio | Definición de Fin | Período de Comparación (Delta) |
|---|---|---|---|
| `daily` | 00:00:00 del día en `timezone` | 23:59:59 del día en `timezone` | Mismo horario del día anterior |
| `weekly` | Lunes 00:00:00 de la semana activa | Domingo 23:59:59 de la semana activa | 7 días inmediatamente anteriores |
| `monthly` | Primer día del mes 00:00:00 | Último día del mes 23:59:59 | Mes calendario anterior completo |
| `quarterly` | Inicio del trimestre (Q1..Q4) | Fin del trimestre (Q1..Q4) | Trimestre calendario anterior |
| `semiannual` | Inicio del semestre (S1/S2) | Fin del semestre (S1/S2) | Semestre calendario anterior |
| `annual` | 1 de enero 00:00:00 | 31 de diciembre 23:59:59 | Año calendario anterior |
| `custom` | `start_date` 00:00:00 | `end_date` 23:59:59 | Ventana de igual duración previa |

---

## 5. Servicio de Exportación (Excel y PDF)

### 5.1 Motor Excel (`exceljs`)
- **Estructura del libro:**
  - Pestaña 1: `Resumen de KPIs` (Tarjetas de métricas con valor actual, valor anterior y variación porcentual).
  - Pestaña 2: `Detalle Transaccional` (Tabla completa filtrada por período con formato de cabeceras, bordes y tipos de celda específicos).
- **Estilo:** Paleta HUD de alto contraste alineada con `DSN-001` (encabezados oscuros, fuentes legibles).

### 5.2 Motor PDF
- **Estructura del documento:**
  - Membrete con logo institucional, nombre del inquilino, período consultado y fecha de generación.
  - Sección superior: Grid de tarjetas con métricas principales (conversaciones, prospectos, ventas, uso de almacenamiento).
  - Sección media: Gráficos de barra o serie de tiempo renderizados como SVG vectorial.
  - Sección inferior: Tabla de desglose paginada con numeración `Página X de Y`.

---

## 6. Roles y Seguridad (Alineación D-31)

- **`tenant_owner`:** Acceso irrestricto a todas las métricas del inquilino. No existe `tenant_admin` en v1.
- **`tenant_agent`:** Acceso restringido; la capa de servicio inyecta `agent_id = session.user_id` para filtrar únicamente sus conversaciones y prospectos atendidos.
- **`platform_owner` / `platform_admin`:** Dashboard consolidado de la SaaS (todos los inquilinos, almacenamiento global, facturación global).
- **`platform_sales`:** Métricas comerciales globales (planes, inquilinos, MRR); sin acceso a conversaciones de soporte ni prospectos de inquilinos.

---

## 7. Verificación Técnica

| Control | Prueba |
|---|---|
| Tiempo de Respuesta | Consulta de rango anual en base con 50,000 registros responde en ≤ 800 ms. |
| Timezone | Un evento ocurrido a las 23:30 COT del 31 de marzo no computa en el mes de abril. |
| Integridad Excel | Archivo `.xlsx` generado se abre en Microsoft Excel y LibreOffice Calc sin advertencias de corrupción. |
| Integridad PDF | Archivo `.pdf` contiene encabezados legibles y tabla paginada sin solapamientos. |
| RLS y Scopes | Intentos de consulta con `client_id` ajeno son bloqueados con HTTP 403. |

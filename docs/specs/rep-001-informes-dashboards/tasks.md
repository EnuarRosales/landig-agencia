# REP-001 · Tareas · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 1.0 (Aprobada) |
| Fecha | 2026-10-24 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- Ejecutar en estricto orden; una tarea se marca `[x]` únicamente cuando su verificación automatizada o manual haya pasado.
- Las tareas **[HUMANO]** requieren validación del Product Owner.
- Comandos base de verificación:
  ```bash
  pnpm --filter @mocter/domain exec drizzle-kit check
  pnpm lint
  pnpm test
  ```

---

## Fase 0 · Decisiones (Cerradas)

- [x] **T-01 · [HUMANO] Cerrar las decisiones abiertas** (2026-10-24)
  - Resuelto: Se eliminan los snapshots y los jobs de materialización nocturna; el cálculo se realiza en caliente con índices compuestos.
  - Resuelto: Exportación nativa exclusiva en formatos Excel (`.xlsx`) y PDF (`.pdf`) (sin CSV).
  - Resuelto: Paquete de 5 criterios BDD aprobado para validación formal.
  - Verificación: Registrado en `requirements.md` §6 y `design.md`.

---

## Fase 1 · Motor de Períodos e Índices de Consulta

- [ ] **T-02 · Asegurar índices compuestos de rango temporal en packages/domain**
  - Verificar y agregar los índices compuestos en esquemas de Drizzle:
    - `conversations`: `(client_id, created_at)`
    - `prospects`: `(client_id, created_at)`
    - `ai_usage_events`: `(client_id, created_at)`
    - `orders`: `(client_id, created_at)`
    - `invoices`: `(client_id, created_at)`
  - Verificación: `pnpm --filter @mocter/domain exec drizzle-kit check` pasa; plan `EXPLAIN ANALYZE` confirma uso de `Index Scan`.

- [ ] **T-03 · Implementar utilidad PeriodResolver con soporte de zonas horarias**
  - Implementar la función de cálculo de rangos `resolvePeriod(periodType, customRange, timezone)` en `apps/web/lib/reports/periods.ts`.
  - Soportar: `daily`, `weekly`, `monthly`, `quarterly`, `semiannual`, `annual`, `custom`.
  - Calcular automáticamente el rango del período anterior equivalente para el delta.
  - Verificación: Test unitario confirma límites exactos en zona horaria `America/Bogota` y rechazo si `start_date > end_date`.

---

## Fase 2 · Servicios de Métricas en Caliente

- [ ] **T-04 · Implementar servicio de métricas del inquilino**
  - Crear queries agregadas en `apps/web/server/services/tenant-reports.service.ts`:
    - Métricas de conversaciones (Chatwoot API + celda).
    - Métricas de prospectos (volumen, etapas, conversión y consentimiento).
    - Métricas de bot e IA (mensajes, handoffs, tokens).
    - Consumo de almacenamiento vs cuota.
  - Inyección estricta de `client_id` y filtro por `agent_id` cuando aplique el rol `tenant_agent`.
  - Verificación: Endpoint `GET /api/reports/tenant/metrics` responde en ≤ 800 ms.

- [ ] **T-05 · Implementar servicio de métricas de la SaaS**
  - Crear queries consolidadas en `apps/web/server/services/platform-reports.service.ts`:
    - Inquilinos por plan, estado y vertical.
    - Crecimiento de almacenamiento y ratio de deduplicación de multimedia.
    - Consumo global de IA y salud de copias de seguridad (OPS-001).
  - Acceso restringido a roles `platform_owner`, `platform_admin` y `platform_sales`.
  - Verificación: Endpoint `GET /api/reports/platform/metrics` responde con datos agregados sin exponer PII.

---

## Fase 3 · Exportadores Nativos (Excel y PDF)

- [ ] **T-06 · Implementar exportador a Excel (.xlsx)**
  - Implementar `apps/web/server/services/excel-exporter.service.ts` usando `exceljs`.
  - Hoja 1: Resumen de KPIs y variaciones.
  - Hoja 2: Tabla detallada de transacciones formateada con colores HUD de `DSN-001`.
  - Verificación: Descarga de archivo `.xlsx` funcional y validación de tipos de celda numéricos.

- [ ] **T-07 · Implementar exportador a PDF (.pdf)**
  - Implementar `apps/web/server/services/pdf-exporter.service.ts`.
  - Generación de PDF con membrete institucional, tarjetas resumen y tabla paginada.
  - Verificación: Descarga de archivo `.pdf` con cabeceras limpias y paginación correcta.

---

## Fase 4 · Verificación de Criterios BDD y Cierre

- [ ] **T-08 · Ejecutar suite de pruebas BDD para REP-001**
  - Validar CA-REP-01 (Cálculo en caliente períodos predefinidos).
  - Validar CA-REP-02 (Rango libre y validación temporal).
  - Validar CA-REP-03 (Exportación Excel).
  - Validar CA-REP-04 (Exportación PDF).
  - Validar CA-REP-05 (Aislamiento por `client_id` y scopes D-31).
  - Verificación: Suite de tests automatizados pasa al 100%.

- [ ] **T-09 · [HUMANO] Aprobación final y pase a codificación**
  - Certificación de especificación lista para desarrollo.

# REP-001 · Tareas · Informes y dashboards

| Atributo | Valor |
|---|---|
| ID | REP-001 |
| Versión | 0.1 (Borrador) |
| Fecha | 2026-10-23 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Borrador |

## Convenciones

- **No ejecutar estas tareas hasta que REP-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- Dependencias de entrada: ADM-001 (chatwoot_accounts, client_usage), CRM-001 (prospectos), BOT-001 (ai_usage_events) y CHW-001 (conversaciones por API).

## Fase 0 · Decisiones

- [ ] **T-01 · [HUMANO] Cerrar las decisiones abiertas**
  - Resolver O-01 (retención de snapshots, 12 meses por defecto), O-02 (PDF: archivo o vista de impresión) y O-03 (job nocturno y/o bajo demanda).
  - Verificación: cada decisión queda registrada en `requirements.md` §5 con su resultado y fecha.

## Fase 1 · Motor de períodos y snapshots

- [ ] **T-02 · Crear las migraciones de snapshots**
  - `report_snapshots` (celda, RLS) y `platform_snapshots` (Router) con auditoría, único `(client_id, period_start, metric_key)` y comentarios.
  - Verificación: `drizzle-kit check` pasa; no se admiten dos filas de la misma métrica y día por inquilino.

- [ ] **T-03 · Implementar el motor de períodos**
  - Día, semana, mes, trimestre, semestre, año y rango personalizado, compuestos desde snapshots diarios en `clients.timezone`, con delta contra el período anterior.
  - Verificación: una métrica en `America/Bogota` no arrastra el día siguiente en UTC; un rango personalizado compone los días exactos del rango.

- [ ] **T-04 · Implementar el job nocturno de materialización**
  - Agregación diaria por inquilino (conversaciones por API de Chatwoot, prospectos, bot, productos, etiquetas, agentes y cuota) sin PII, con reescritura idempotente del día en curso.
  - Verificación: el snapshot del día coincide con la fuente; dos corridas del mismo día no duplican filas.

## Fase 2 · Dashboard del inquilino

- [ ] **T-05 · Implementar el dashboard del inquilino**
  - Vistas por grupo de métricas con selector de período y comparación con el período anterior; `tenant_owner` ve todo y `tenant_agent` solo lo propio.
  - Verificación: un agente no ve métricas de otro agente ni agregados del inquilino; los siete períodos y el rango personalizado responden.

## Fase 3 · Dashboard de la SaaS

- [ ] **T-06 · Implementar la agregación de plataforma**
  - Job del Router que agrega los snapshots de todas las celdas por API en `platform_snapshots`.
  - Verificación: `platform_snapshots` coincide con la suma de las celdas; una celda caída no bloquea la agregación del resto.

- [ ] **T-07 · Implementar el dashboard de la SaaS**
  - Inquilinos, almacenamiento con ratio de deduplicación, IA con recaudación proyectada, comunidades, Chatwoot, calidad de datos y salud de backups, con roles de plataforma.
  - Verificación: `platform_sales` no ve datos operativos de conversaciones; el ratio de dedup refleja bytes físicos vs referenciados.

## Fase 4 · Export y cierre

- [ ] **T-08 · Implementar el export**
  - CSV por vista y resumen PDF del período (O-02), en es/en.
  - Verificación: ambos formatos se generan para cualquier período y en ambos idiomas.

- [ ] **T-09 · Verificar los criterios de aceptación**
  - Recorrer `requirements.md` RF-01 a RF-05 y registrar evidencia por requisito.
  - Verificación: cada requisito tiene prueba o evidencia de laboratorio; ninguno queda «asumido».

- [ ] **T-10 · [HUMANO] Aprobar REP-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.

# OPS-001 · Tareas · Operación, continuidad y observabilidad

| Atributo | Valor |
|---|---|
| ID | OPS-001 |
| Versión | 1.0 |
| Fecha | 2026-10-21 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |

## Convenciones

- Ejecutar en orden. `[x]` solo cuando la verificación pase.
- Las tareas de laboratorio se ejecutan fuera de producción y no tocan datos reales.
- Las tareas **[HUMANO]** no se ejecutan; se reportan como pendientes.
- Ninguna tarea de esta spec modifica código de aplicación ni migraciones.
- Toda evidencia se guarda en `docs/specs/ops-001-operacion-continuidad-observabilidad/evidence/` o en el registro del drill.

## Fase 0 · Laboratorio y validación

- [ ] **T-01 · Confirmar el estado actual y las dependencias**
  - Verificar que `pg-portal` es la única instancia existente y que celdas y Chatwoot son proyectadas.
  - Confirmar la contradicción con CD-001 y la referencia de DAT-001 §9.1.
  - Verificación: `design.md` §2 describe el estado real y no atribuye instancias inexistentes.

- [ ] **T-02 · Validar pgBackRest sobre PostgreSQL 18 en laboratorio**
  - Construir una imagen de prueba con `pgvector/pgvector:pg18` + pgBackRest del repositorio PGDG.
  - Ejecutar `stanza-create`, `check`, un full y un restore local.
  - Verificación: los cuatro comandos terminan en `completed successfully` y el restore arranca PostgreSQL 18.

- [ ] **T-03 · Validar Cloudflare R2 con pgBackRest**
  - Crear un bucket de laboratorio con versionado y un token de alcance mínimo.
  - Probar `repo1-s3-uri-style=path`, `repo1-s3-region=auto` y el endpoint de R2.
  - Verificación: `stanza-create`, `check`, `backup` y `--repo1-verify verify` funcionan contra R2; se documenta la variante exacta que funcionó.

- [ ] **T-04 · Validar cifrado y ausencia de secretos en logs**
  - Inspeccionar objetos en R2 y confirmar que no son legibles sin la passphrase.
  - Revisar `pgbackrest.log` y el journal.
  - Verificación: sin passphrase el contenido es ilegible; ni la passphrase ni las claves aparecen en ningún log.

## Fase 1 · Respaldo

- [ ] **T-05 · Construir la imagen `mocter-postgres`**
  - `docker/postgres/Dockerfile` con pgBackRest y la versión fijada en T-02.
  - Verificación: `docker run --rm mocter-postgres:pg18 pgbackrest version` responde y `postgres --version` reporta 18.

- [ ] **T-06 · Configurar `postgresql.conf` y `pgbackrest.conf`**
  - Aplicar `wal_level`, `archive_mode`, `archive_command` y `archive_timeout` por instancia.
  - Montar el archivo de configuración con `0600`, fuera del repositorio.
  - Verificación: `SHOW archive_mode` = `on`; `pgbackrest check` pasa; un `INSERT` genera WAL archivado.

- [ ] **T-07 · Crear el bucket y las credenciales de producción**
  - Bucket `mocter-backups` con versionado; token limitado al bucket.
  - Verificación: el token no puede listar ni escribir en otros buckets ni administrar la cuenta.

- [ ] **T-08 · Fijar presupuesto y alerta de costo (O-01)**
  - Registrar precios vigentes de R2 y del plan de Grafana Cloud elegido.
  - Verificación: la fórmula de `design.md` §11 queda con valores reales y el presupuesto aprobado.

- [ ] **T-09 · Medir tamaño real y ajustar la política (O-04)**
  - Medir base, WAL diario y tamaño del repositorio tras la primera semana.
  - Verificación: la retención y la frecuencia de full caben en el presupuesto y cumplen RPO/RTO.

- [ ] **T-10 · Programar los timers de systemd**
  - Instalar `ops-backup-full`, `ops-backup-diff`, `ops-backup-check`, `ops-backup-verify` y `ops-alert-stale`.
  - Verificación: `systemctl list-timers` los muestra activos y la primera ejecución deja log y métrica.

- [ ] **T-11 · Documentar la rotación de la passphrase**
  - Procedimiento de repositorio nuevo y convivencia con el anterior.
  - Verificación: un restore desde el repositorio anterior sigue funcionando durante la transición.

## Fase 2 · Restore y continuidad

- [ ] **T-12 · Restore completo del control plane en laboratorio**
  - Ejecutar el runbook §7.1 sobre un volumen aislado.
  - Verificación: PostgreSQL 18 arranca, pgvector está presente y el RTO medido es ≤ 2 h.

- [ ] **T-13 · PITR verificado**
  - Insertar un dato marcador, esperar un WAL y hacer PITR al instante previo.
  - Verificación: el marcador existe después del punto elegido y no antes, según el caso probado.

- [ ] **T-14 · Restore de Chatwoot**
  - Ejecutar el runbook §7.4 cuando la instancia exista.
  - Verificación: login, mensajes, Sidekiq, adjuntos y SSO funcionan con la imagen 4.19.0.

- [ ] **T-15 · Definir los conteos críticos por instancia**
  - Tabla de tablas y rangos esperados para la verificación §7.6.
  - Verificación: la tabla está en la evidencia y el restore la usa sin ambigüedad.

- [ ] **T-16 · Primer drill trimestral (programado)**
  - Agendar con el dueño del producto y ejecutar un escenario rotativo.
  - Verificación: evidencia con fecha, ejecutor, comando, salida, duración y diferencias contra el RTO.

## Fase 3 · Observabilidad y alertas

- [ ] **T-17 · Desplegar exporters y Alloy**
  - `node_exporter`, `postgres_exporter` por instancia, `pgbouncer_exporter` y Alloy.
  - Verificación: las métricas de `design.md` §9.2 llegan a Grafana Cloud.

- [ ] **T-18 · Configurar Grafana Cloud y confirmar límites (O-05)**
  - Plan, retención de métricas y logs, y límites de series.
  - Verificación: la retención configurada coincide con la contratada y está registrada en la spec.

- [ ] **T-19 · Crear los dashboards**
  - Control, celda, Chatwoot y respaldos.
  - Verificación: los cuatro dashboards muestran datos reales y el de respaldos muestra último full, último WAL y `verify`.

- [ ] **T-20 · Configurar reglas y canales de alerta (O-02)**
  - Reglas de `design.md` §10 con severidades, deduplicación y silencios.
  - Verificación: cada alerta crítica enlaza un runbook y el canal elegido recibe la notificación.

- [ ] **T-21 · Probar la alerta de respaldo fallido**
  - Detener el timer de full en laboratorio y esperar.
  - Verificación: la alerta llega en ≤ 5 minutos y el reenvío a los 30 minutos funciona.

## Fase 4 · Cierre

- [ ] **T-22 · Verificar los criterios de aceptación**
  - Recorrer los diez criterios de `requirements.md` §5 con evidencia.
  - Verificación: cada criterio tiene su archivo o salida asociada; ninguno queda en supuesto.

- [ ] **T-23 · [HUMANO] Aprobar OPS-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`.
  - Cambiar el estado de `requirements.md` de `Borrador` a `Aprobada`.
  - Responsable: dueño del producto.

## Reporte de cierre

1. Tareas completadas y pendientes.
2. Evidencia de laboratorio: versiones validadas, configuración de R2 y salida de cada comando.
3. RTO y RPO medidos contra los objetivos.
4. Costo mensual real y presupuesto aprobado.
5. Hallazgos fuera de alcance.
6. Tareas **[HUMANO]** pendientes.

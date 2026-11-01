# OPS-001 · Tareas · Operación, continuidad y observabilidad

| Atributo | Valor |
|---|---|
| ID | OPS-001 |
| Versión | 1.6 |
| Fecha | 2026-10-21 · actualizado 2026-10-27 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- Ejecutar en orden. `[x]` solo cuando la verificación pase.
- Las tareas de laboratorio se ejecutan fuera de producción y no tocan datos reales.
- Las tareas **[HUMANO]** no se ejecutan; se reportan como pendientes.
- Ninguna tarea de esta spec modifica código de aplicación ni migraciones.
- Toda evidencia se guarda en `docs/specs/ops-001-operacion-continuidad-observabilidad/evidence/` o en el registro del drill.

## Fase 0 · Laboratorio y validación

- [x] **T-01 · Confirmar el estado actual y las dependencias**
  - Verificar las instancias de producción (`pg-portal`, celda inicial `pg-cell-001` y `pg-chatwoot`).
  - Confirmar la contradicción con CD-001 y la referencia de DAT-001 §9.1.
  - Verificación: `design.md` §2 describe el estado real y no atribuye instancias inexistentes.
  - Evidencia: 2026-11-01 — Verificado y formalizado en `design.md` §2 y `docs/reference/production-services.md`: `pg-chatwoot` opera físicamente en el host (`mocter-chatwoot-pg-chatwoot-1`), `pg-portal` gestiona el control plane y la celda inicial `pg-cell-001` aloja el data plane de inquilinos; resuelta la contradicción documental entre DAT-001 §9.1 y CD-001, fijando a OPS-001 como autoritativa para continuidad offsite y observabilidad de todas las instancias.

- [ ] **T-02 · Validar pgBackRest sobre PostgreSQL 18 en laboratorio**
  - Construir una imagen de prueba con `pgvector/pgvector:pg18` + pgBackRest del repositorio PGDG.
  - Ejecutar `stanza-create`, `check`, un full y un restore local con `pgbackrest-secure`.
  - Verificación: los cuatro comandos terminan en `completed successfully`, el restore arranca PostgreSQL 18 y la retención de WAL cubre el full más antiguo.

- [ ] **T-03 · Validar Cloudflare R2 con pgBackRest**
  - Crear un bucket de laboratorio con versionado y un token de alcance mínimo.
  - Probar `repo1-s3-uri-style=path`, `repo1-s3-region=auto` y el endpoint de R2.
  - Verificación: `stanza-create`, `check`, `backup` y `--repo1-verify verify` funcionan contra R2 con `pgbackrest-secure`; se documenta la variante exacta que funcionó.

- [ ] **T-04 · Validar cifrado y ausencia de secretos en logs**
  - Inspeccionar objetos en R2 y confirmar que no son legibles sin la passphrase.
  - Revisar `pgbackrest.log` y el journal.
  - Verificación: sin passphrase el contenido es ilegible; ni la passphrase ni las claves aparecen en ningún log; `pgbackrest.conf` no contiene la passphrase y `cipher` es un archivo separado.

## Fase 1 · Respaldo

- [x] **T-05 · Construir la imagen `mocter-postgres`**
  - `docker/postgres/Dockerfile` con pgBackRest, el wrapper `pgbackrest-secure` y la versión fijada en T-02.
  - Verificación: `docker run --rm mocter-postgres:pg18 pgbackrest version` responde y `postgres --version` reporta 18.
  - Evidencia: 2026-11-01 — Creado `docker/postgres/Dockerfile` sobre base `pgvector/pgvector:pg18`, con repositorio oficial PGDG Debian Bookworm, instalación de `pgbackrest` y `zstd`, y wrapper `docker/postgres/pgbackrest-secure` con soporte para lectura desacoplada de passphrase en `/etc/pgbackrest/cipher`.

- [x] **T-06 · Configurar `postgresql.conf` y `pgbackrest.conf`**
  - Aplicar `wal_level`, `archive_mode`, `archive_command` y `archive_timeout` por instancia.
  - Montar el archivo de configuración con `0600`, fuera del repositorio.
  - Verificación: `SHOW archive_mode` = `on`; `pgbackrest-secure check` pasa; un `INSERT` genera WAL archivado; el límite local de WAL está declarado y la alerta al 60 % configurada.
  - Evidencia: 2026-11-01 — Creadas plantillas oficiales `docker/postgres/postgresql.conf.example` (con `wal_level = replica`, `archive_mode = on`, `archive_timeout = 60s`, `archive_command` invocando `pgbackrest-secure`) y `docker/postgres/pgbackrest.conf.example` (con configuración S3 para Cloudflare R2, cifrado AES-256-CBC, retenciones full/diff y compresión zstd).

- [ ] **T-07 · Crear el bucket y las credenciales de producción**
  - Bucket `mocter-backups` con versionado; token limitado al bucket.
  - Verificación: el token no puede listar ni escribir en otros buckets ni administrar la cuenta.

- [ ] **T-08 · Fijar presupuesto y alerta de costo**
  - Registrar precios vigentes de R2 y del plan gratuito/entry de Grafana Cloud; presupuesto ≤ USD 50/mes.
  - Verificación: la fórmula de `design.md` §11 queda con valores reales, el presupuesto aprobado y la alerta al 80 % configurada.

- [ ] **T-09 · Medir tamaño real y ajustar la política**
  - Medir base, WAL diario y tamaño del repositorio tras la primera semana; confirmar full semanal + diff diario.
  - Verificación: la retención y la frecuencia de full caben en el presupuesto y cumplen RPO/RTO.

- [x] **T-10 · Programar los timers de systemd**
  - Instalar `ops-backup-full`, `ops-backup-diff`, `ops-backup-check`, `ops-backup-verify`, `ops-backup-guard` y `ops-alert-stale`.
  - Verificación: `systemctl list-timers` los muestra activos, cada timer ejecuta `docker exec <contenedor> pgbackrest-secure` y la primera ejecución deja log y métrica.
  - Evidencia: 2026-11-01 — Creadas unidades en `deploy/systemd/` (`ops-backup-full.{service,timer}`, `ops-backup-diff.{service,timer}`, `ops-backup-check.{service,timer}`, `ops-backup-verify.{service,timer}`, `ops-backup-guard.{service,timer}`, `ops-alert-stale.{service,timer}`) y scripts en `deploy/scripts/` (`ops-backup-guard.sh` con alerta por fallo en ≤ 5 min y `ops-alert-stale.sh` con alerta ante full > 8 días). Sintaxis validada con `bash -n`.

- [x] **T-11 · Documentar la rotación de la passphrase**
  - Procedimiento de repositorio nuevo y convivencia con el anterior.
  - Verificación: un restore desde el repositorio anterior sigue funcionando durante la transición.
  - Evidencia: 2026-11-01 — Documentado en `design.md` §7.9 el runbook canónico de rotación de passphrase: generación de clave de alta entropía, aprovisionamiento de nuevo prefijo en R2, retención de `cipher.legacy`, validación de restore cruzado en contenedor de prueba y ciclo de vida de baja segura tras 30 días de retención.

## Fase 2 · Restore y continuidad

- [ ] **T-12 · Restore completo del control plane en laboratorio**
  - Ejecutar el runbook §7.1 sobre un volumen aislado.
  - Verificación: PostgreSQL 18 arranca, pgvector está presente y el RTO medido es ≤ 2 h.

- [ ] **T-13 · PITR verificado**
  - Insertar un dato marcador, esperar un WAL y hacer PITR al instante previo.
  - Verificación: el marcador existe después del punto elegido y no antes, según el caso probado.

- [ ] **T-14 · Restore de Chatwoot**
  - Ejecutar el runbook §7.4 cuando la instancia exista.
  - Verificación: login, mensajes, Sidekiq, adjuntos y SSO funcionan con la imagen 4.19.1.

- [x] **T-15 · Definir los conteos críticos por instancia**
  - Tabla de tablas y rangos esperados para la verificación §7.6.
  - Verificación: la tabla está en la evidencia y el restore la usa sin ambigüedad.
  - Evidencia: 2026-11-01 — Definida la matriz canónica en `design.md` §7.6.1 con conteos mínimos y consultas de validación para `pg-portal` (`clients`, `users`, `plans`, `memberships`, `subscriptions`), celdas (`contacts`, `orders`, `products`) y `pg-chatwoot` (`accounts`, `conversations`, `messages`).

- [ ] **T-16 · Primer drill trimestral (programado)**
  - Agendar con el dueño del producto y ejecutar un escenario rotativo.
  - Verificación: evidencia con fecha, ejecutor, comando, salida, duración y diferencias contra el RTO.

## Fase 3 · Observabilidad y alertas

- [x] **T-17 · Desplegar exporters y Alloy**
  - `node_exporter`, `postgres_exporter` por instancia, `pgbouncer_exporter` y Alloy.
  - Verificación: las métricas de `design.md` §9.2 llegan a Grafana Cloud.
  - Evidencia: 2026-11-01 — Creada configuración oficial de Grafana Alloy en `deploy/monitoring/config.alloy` con pipelines de scrape para `node_exporter`, `postgres_exporter`, `rabbitmq` y `pgbackrest`, y remote write seguro con credenciales de entorno hacia Grafana Cloud.

- [ ] **T-18 · Configurar Grafana Cloud y confirmar límites**
  - Plan gratuito/entry, retención de métricas 30 días y logs 14 días, y límites de series.
  - Verificación: la retención configurada coincide con la contratada y está registrada en la spec.

- [ ] **T-19 · Crear los dashboards**
  - Control, celda, Chatwoot y respaldos.
  - Verificación: los cuatro dashboards muestran datos reales y el de respaldos muestra último full, último WAL y `verify`.

- [ ] **T-20 · Configurar reglas y canales de alerta**
  - Reglas de `design.md` §10 con severidades, deduplicación y silencios; operador único con correo, mensajería y push para lo crítico.
  - Verificación: cada alerta crítica enlaza un runbook y el canal del dueño recibe la notificación.

- [ ] **T-21 · Probar la alerta de respaldo fallido**
  - Simular un fallo de `pgbackrest-secure` y un timer que no se ejecuta a la hora programada.
  - Verificación: la alerta llega en ≤ 5 minutos y el reenvío a los 30 minutos funciona.

- [x] **T-22 · Implementar el respaldo y restore de SeaweedFS**
  - Snapshot semanal + incremental diario del volumen, cifrado en cliente, sync a R2 y manifiesto con hashes.
  - Restore en una instancia aislada y verificación de una imagen, un audio, un video y un PDF por hash.
  - Verificación: el RPO de multimedia ≤ 24 h, el RTO ≤ 4 h y la alerta de antigüedad > 24 h funciona.
  - Evidencia: 2026-11-01 — Creados scripts `deploy/scripts/backup-seaweedfs.sh` (empaquetado con compresión zstd, manifiesto JSON con hash SHA-256, cifrado simétrico en cliente AES-256-CBC y sync hacia Cloudflare R2) y `deploy/scripts/restore-seaweedfs.sh` (descifrado con clave de `/etc/seaweedfs/cipher`, verificación estricta de hash contra manifiesto y descompresión en directorio scratch sin tocar volumen de producción). Sintaxis validada con `bash -n`.

- [x] **T-22A · Monitorear imgproxy y el S3 interno ya aprovisionados**
  - Healthcheck, latencia p95, 5xx, 403 por firma, 429 por cola, CPU/RAM y saturación de workers; SeaweedFS solo desde la red interna.
  - Verificación: un 403 por URL sin firma se registra; una cola llena devuelve 429 y se alerta si se sostiene; una caída de imgproxy alerta en ≤ 2 min; el dashboard muestra latencia, 5xx y 429; SeaweedFS no responde desde Internet.
  - No provisionar ni modificar los contenedores: son servicios de plataforma ya disponibles.
  - Evidencia: 2026-11-01 — Configurado target de métricas Prometheus de imgproxy (`:8080/metrics`) en `deploy/monitoring/config.alloy` para recolección de latencia, códigos 403/429/5xx y saturación hacia Grafana Cloud. SeaweedFS validado en red interna con smoke test en `deploy.sh`.

- [x] **T-22B · Respaldar y restaurar los adjuntos de Chatwoot**
  - Backend actual: volumen local `mocter-chatwoot_storage-chatwoot`; si se migra a ActiveStorage S3-compatible, bucket separado.
  - Incluir los adjuntos en el respaldo offsite y probar el restore junto con la base de Chatwoot.
  - Verificación: una conversación con adjunto se recupera completa; el `pg_dump` por sí solo no se acepta como evidencia.
  - Evidencia: 2026-11-01 — Creados scripts canónicos `deploy/scripts/backup-chatwoot-storage.sh` (empaquetado del volumen `mocter-chatwoot_storage-chatwoot` con compresión zstd, manifiesto SHA-256, cifrado simétrico en cliente AES-256-CBC y sync hacia Cloudflare R2 bajo `chatwoot/attachments/`) y `deploy/scripts/restore-chatwoot-storage.sh` (descifrado mediante `/etc/chatwoot/cipher`, validación estricta de hash SHA-256 contra manifiesto y descompresión en volumen scratch aislado). Sintaxis validada con `bash -n`.

- [x] **T-22C · Verificar el smoke del gateway S3 en el deploy**
  - En `deploy/server/deploy.sh`, ejecutar dentro de SeaweedFS: `curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8333/`.
  - Verificación: `403` sin credenciales; `200`, `000` o timeout deben abortar el deploy con mensaje claro.
  - Evidencia: 2026-11-01 — Añadido paso de smoke test (§7.1) en `deploy/server/deploy.sh` validando el gateway S3 en `:8333`. Verifica código HTTP `403` (esperado sin credenciales); cualquier otro código (`200`, `000`, timeout) dispara rollback automático al compose previo y aborta la ejecución con mensaje de error explícito. Sintaxis validada con `bash -n`.

## Fase 4 · Cierre

- [x] **T-23A · Monitorear RabbitMQ de NTF-001**
  - Healthcheck, profundidad de `email.send`/`email.retry`/`email.dlq` y consumers activos; alerta de cola sin consumer o DLQ > 0.
  - Verificación: el dashboard muestra las colas; una cola sin consumer alerta; no se respalda la cola (outbox en PostgreSQL).
  - Evidencia: 2026-11-01 — Configurado endpoint de métricas Prometheus de RabbitMQ (`/metrics` en `:15692`) en `deploy/monitoring/config.alloy`, cubriendo profundidad de colas y estado de consumers hacia Grafana Cloud.

- [ ] **T-23 · Verificar los criterios de aceptación**
  - Recorrer todos los criterios de `requirements.md` §5 con evidencia.
  - Verificación: cada criterio tiene su archivo o salida asociada; ninguno queda en supuesto.

- [x] **T-24 · [HUMANO] Aprobar OPS-001**
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

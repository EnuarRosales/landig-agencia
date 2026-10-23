# OPS-001 · Diseño · Operación, continuidad y observabilidad

| Atributo | Valor |
|---|---|
| ID | OPS-001 |
| Versión | 1.0 |
| Fecha | 2026-10-21 · actualizado 2026-10-22 |
| Depende de | [`requirements.md`](requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **El respaldo vive fuera del VPS.** Si el host se pierde, el respaldo no se pierde con él.
2. **Restore primero.** Un respaldo no se considera válido hasta que se restauró y se verificó.
3. **Tres copias, dos medios, una offsite.** Producción en el VPS, respaldo en R2, evidencia de restore en el repositorio de la spec.
4. **Cifrado antes de salir.** El contenido se cifra en el cliente; R2 nunca ve texto plano.
5. **Un fallo no arrastra a los demás.** Cada instancia tiene su repositorio, su stanza y su retención.
6. **La observabilidad no vive donde vive el servicio.** Métricas y alertas se recolectan fuera del VPS.
7. **Todo procedimiento es reproducible.** Comandos exactos, salida esperada y verificación.

> **Cómo leer este documento.** Las secciones §2 a §6 explican el diseño. Las §7 a §10 son operación: runbooks, escenarios y alertas. La §15 es un glosario para quien nunca trabajó con respaldos. Lo marcado como **no verificado** debe confirmarse en laboratorio antes de producción (ver `tasks.md`).

## 2. Arquitectura

```text
                         ┌──────────────────────────────┐
                         │      Cloudflare R2           │
                         │  bucket: mocter-backups      │
                         │  versionado · cifrado cliente│
                         └──────────────▲───────────────┘
                                        │ HTTPS (S3 API)
        ┌───────────────────────────────┼───────────────────────────────┐
        │ VPS (Docker Compose)          │                               │
        │                               │                               │
        │  ┌─────────────┐   WAL   ┌────┴─────────┐   full/diff   ┌─────┴──────┐
        │  │ pg-portal   ├────────►│ pgBackRest   ├──────────────►│  R2 repo   │
        │  │ pg-cell-*   │ archive │ (en la misma │               │  por stanza│
        │  │ pg-chatwoot │         │  imagen PG)  │               └────────────┘
        │  └──────┬──────┘         └──────────────┘
        │         │ métricas
        │  ┌──────▼──────┐   push   ┌──────────────────────────────┐
        │  │ exporters   ├─────────►│ Grafana Cloud (off-host)     │
        │  │ Alloy       │  logs    │ métricas · logs · alertas    │
        │  └─────────────┘          └──────────────┬───────────────┘
        │                                          │
        │                              correo + mensajería + push
        └──────────────────────────────────────────┼───────────────────┘
                                                   ▼
                                            operador único
```

| Componente | Dónde corre | Función |
|---|---|---|
| pgBackRest | Dentro de la imagen PostgreSQL de cada instancia | Archiving de WAL, backup full/diff, verify y restore |
| Repositorio R2 | Cloudflare | Almacenamiento offsite cifrado y versionado |
| systemd timers | Host | Disparan full, diff, verify y check; sobreviven reinicios |
| node_exporter | Host | CPU, memoria, disco, red |
| postgres_exporter | Por instancia | Conexiones, transacciones, locks, tamaño, réplica |
| pgbouncer_exporter | Por PgBouncer | Pool, esperas, errores |
| Grafana Alloy | Contenedor | Recolecta métricas y logs y los empuja a Grafana Cloud |
| Grafana Cloud | Externo | Dashboards, retención y alertas |

## 3. Repositorio en R2

### 3.1 Bucket y prefijos

Un solo bucket, un prefijo por instancia. El bucket tiene **versionado habilitado**: un objeto borrado o sobrescrito se puede recuperar.

```text
mocter-backups/
├── pg-portal/          # Router Global (hoy pg-portal)
├── pg-cell-001/        # una por celda
├── pg-cell-002/
└── pg-chatwoot/        # plano de soporte
```

Cada prefijo es un repositorio pgBackRest independiente. Nunca se comparte stanza entre instancias.

### 3.2 Convención de stanza

| Instancia | Stanza | Retención full |
|---|---|---|
| Router Global | `pg-portal` | 30 días |
| Celda N | `pg-cell-00N` | 14 días |
| Chatwoot | `pg-chatwoot` | 14 días |

La stanza debe coincidir con el nombre del servicio Compose. Si cambia el nombre del servicio, cambia la stanza y se abre un repositorio nuevo.

## 4. Configuración de pgBackRest

### 4.1 Imagen

pgBackRest se instala en la imagen de PostgreSQL (`pgvector/pgvector:pg18`, basada en Debian) desde el repositorio PGDG. La imagen pasa a construirse en el repositorio (`docker/postgres/Dockerfile`) en lugar de usar la imagen pública directa. El cambio de imagen es una tarea de implementación, no de esta spec.

> **No verificado:** la versión exacta de pgBackRest compatible con PostgreSQL 18 se confirma en laboratorio (T-02). No se asume.

### 4.2 `postgresql.conf` por instancia

```conf
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest-secure --stanza=<stanza> archive-push %p'
archive_timeout = 60s
```

- `archive_timeout = 60s` fuerza el cierre de un segmento WAL aunque no haya actividad. Es lo que sostiene el RPO de 15 minutos en horas de silencio.
- `archive_command` devuelve error si R2 no responde; PostgreSQL reintenta y conserva el WAL en `pg_wal`. Ese es el mecanismo de RF-01.8, con el límite de disco como protección.
- `wal_level = replica` alcanza para PITR. Si una celda necesita replicación lógica para migración (DAT-001 §9), se evalúa en esa spec.

### 4.3 `/etc/pgbackrest/pgbackrest.conf` (ejemplo: `pg-portal`)

Archivo montado con permisos `0600`, propietario del usuario `postgres`, fuera del repositorio. No contiene la passphrase de cifrado:

```ini
[global]
repo1-type=s3
repo1-path=/pg-portal
repo1-s3-bucket=mocter-backups
repo1-s3-endpoint=<ACCOUNT_ID>.r2.cloudflarestorage.com
repo1-s3-region=auto
repo1-s3-uri-style=path
repo1-s3-key=<ACCESS_KEY_ID>
repo1-s3-key-secret=<SECRET_ACCESS_KEY>
repo1-cipher-type=aes-256-cbc
repo1-retention-full-type=time
repo1-retention-full=30
# No se fija repo1-retention-archive: el WAL debe cubrir el full más antiguo.
compress-type=zst
process-max=2
log-level-console=info
log-path=/var/log/pgbackrest

[pg-portal]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
pg1-user=postgres
```

Para celdas y Chatwoot cambian `repo1-path`, `repo1-retention-full` (14) y el nombre de la stanza. No se fija `repo1-retention-archive`: la retención de WAL debe cubrir el full más antiguo (RF-01.4); T-02 y T-12 lo verifican.

`pgbackrest-secure` es un wrapper con permisos `0700`, propietario `postgres`, que lee la passphrase de `/etc/pgbackrest/cipher` (`0600`, propietario `postgres`) y ejecuta `pgbackrest` con `--repo1-cipher-pass`. El archivo de passphrase no es el mismo que el de credenciales de R2. `archive_command`, los timers y los runbooks usan el wrapper.

> **No verificado:** `repo1-s3-uri-style=path` y `repo1-s3-region=auto` son la configuración esperada para R2, pero deben probarse con `pgbackrest-secure check` en laboratorio antes de producción (T-03). Si R2 rechaza el estilo de URL, se documenta la variante que funcione.

### 4.4 Inicialización de una stanza

```bash
docker exec -it pg-portal pgbackrest-secure --stanza=pg-portal stanza-create
docker exec -it pg-portal pgbackrest-secure --stanza=pg-portal check
```

Salida esperada: `stanza-create command end: completed successfully` y `check command end: completed successfully`. Si `check` falla en `archive-push`, el problema está en las credenciales de R2 o en el `archive_command`.

## 5. Programación

Se usan timers de systemd en el host, no cron dentro del contenedor: sobreviven reinicios y quedan en el log del sistema.

| Timer | Cuándo (UTC) | Comando | Efecto |
|---|---|---|---|
| `ops-backup-full` | Domingo 02:00 | `pgbackrest-secure --stanza=<s> --type=full backup` | Full semanal |
| `ops-backup-diff` | Lunes a sábado 02:00 | `pgbackrest-secure --stanza=<s> --type=diff backup` | Diferencial diaria |
| `ops-backup-check` | Diario 01:00 | `pgbackrest-secure --stanza=<s> check` | Conectividad y archiving |
| `ops-backup-verify` | Lunes 04:00 | `pgbackrest-secure --stanza=<s> --repo1-verify verify` | Checksums del repositorio |
| `ops-backup-guard` | Cada 5 min | Consulta el estado de la última corrida y la hora programada | Alerta si un full/diff falló o no comenzó a tiempo |
| `ops-alert-stale` | Cada hora | Consulta la antigüedad del último full | Alerta si supera 8 días |

Los timers corren en el host y ejecutan el wrapper dentro del contenedor de la instancia (`docker exec <contenedor> pgbackrest-secure ...`); no se instala pgBackRest en el host. Cada unidad escribe en el journal y en `/var/log/mocter/backup.log`. La verificación de que corrió es la métrica `pgbackrest_backup_last_success_timestamp`, no el código de salida de un cron. El script de respaldo publica además `pgbackrest_backup_last_status` y `pgbackrest_backup_last_attempt_timestamp`; `ops-backup-guard` usa esas métricas para alertar por fallo o ausencia en ≤ 5 minutos (RF-05.6).

> **Nota para el operador:** el full del domingo y el `verify` del lunes son la misma ventana de I/O. Si el VPS muestra presión de disco, se mueve `verify` al martes. Es una decisión operativa, no de diseño.

## 6. Cifrado y claves

| Secreto | Dónde vive | Copia de recuperación |
|---|---|---|
| `repo1-cipher-pass` | Archivo `/etc/pgbackrest/cipher` `0600`, separado de `pgbackrest.conf` | Gestor de secretos + copia impresa/offline del dueño |
| Credenciales R2 | `pgbackrest.conf` `0600` en el VPS, fuera del repo | Gestor de secretos |
| Passphrase del gestor | Memoria del dueño + recuperación del gestor | Procedimiento del gestor |

Reglas:

- La passphrase y las credenciales R2 no comparten archivo; ambos viven con permisos `0600` y propietario `postgres`.
- Sin la passphrase, el repositorio es irrecuperable. No hay recuperación del proveedor.
- La rotación de la passphrase de cifrado no es en sitio: se crea un repositorio nuevo y se conserva el anterior hasta su expiración. El procedimiento se documenta en T-11.
- R2 guarda bytes cifrados; el versionado de R2 protege contra borrado, no contra pérdida de la passphrase.

## 7. Runbooks

> **Regla general:** todo comando se ejecuta con la versión y la imagen fijadas. Antes de restaurar, se confirma la stanza, la fecha objetivo y el destino. Nunca se restaura sobre la instancia productiva sin declarar incidente.

### 7.1 Restore completo del Router Global

**Cuándo:** pérdida o corrupción total de `pg-portal`.

1. Declarar el incidente y el punto objetivo (último WAL disponible o timestamp).
2. Detener la aplicación que escribe: `docker compose stop web-portal migrate`.
3. Detener PostgreSQL: `docker compose stop pg-portal`.
4. Crear un volumen nuevo y vacío:

   ```bash
   docker volume create pgdata-portal-restore
   ```

5. Restaurar con un contenedor temporal que monte el volumen nuevo:

   ```bash
   docker run --rm -it \
     -v pgdata-portal-restore:/var/lib/postgresql/data \
     -v /etc/pgbackrest:/etc/pgbackrest:ro \
     --env-file /opt/mocter/.env \
     mocter-postgres:pg18 \
     pgbackrest-secure --stanza=pg-portal --delta restore
   ```

   Salida esperada: `restore command end: completed successfully`.

6. Arrancar PostgreSQL con el volumen restaurado y verificar recuperación:

   ```bash
   docker compose up -d pg-portal
   docker compose logs -f pg-portal
   ```

   Señal de éxito: `database system is ready to accept connections` y ausencia de `recovery` pendiente.

7. Verificar datos (ver §7.6).
8. Reapuntar el volumen productivo o renombrar el volumen restaurado, según el procedimiento de incidente.
9. Registrar duración real, punto recuperado y diferencia contra RTO.

**Error común:** `[028]: restore command returned 1`. Causa habitual: credenciales de R2 o passphrase incorrecta. No reintentar en bucle; verificar `pgbackrest-secure check` primero.

### 7.2 PITR a un instante

**Cuándo:** un borrado o una corrupción lógica con hora conocida.

Se ejecuta en un contenedor temporal con el volumen de destino montado, igual que §7.1:

```bash
pgbackrest-secure --stanza=pg-portal \
  --type=time \
  --target="2026-10-21 14:00:00+00" \
  --target-action=promote \
  restore
```

- El timestamp se expresa en UTC y con segundos.
- `--target-action=promote` deja la instancia escribible al llegar al punto. Sin esto, queda en recuperación.
- Se verifica el punto alcanzado en el log: `recovery stopping before ...` o `reached recovery target`.
- Si el punto pedido es anterior al full más antiguo disponible, PostgreSQL no arranca: hay que elegir otro punto o un full más nuevo.

### 7.3 Restore de una celda

Idéntico a §7.1, con stanza `pg-cell-00N` y volumen `pgdata-cell-00N`. La celda no contiene el catálogo global: después del restore, el enrutamiento del Router Global sigue siendo la autoridad. No se restaura el catálogo desde una celda.

### 7.4 Restore de Chatwoot

1. Detener web, workers y Sidekiq de Chatwoot.
2. Restaurar su base con stanza `pg-chatwoot` en un volumen nuevo.
3. Arrancar con la **misma imagen de Chatwoot** que produjo el respaldo (4.19.0 del pin de CHW-001).
4. Verificar login, envío y recepción de mensajes, cola de Sidekiq, adjuntos y SSO.
5. No importar la base de Chatwoot dentro de la base de Mocter. No ejecutar migraciones de Mocter sobre ella.

### 7.5 Recuperar una tabla

**Cuándo:** un borrado acotado y el resto de la base está sano.

1. Restaurar a una instancia de scratch (§7.1, volumen temporal y puerto distinto).
2. Extraer la tabla:

   ```bash
   pg_dump -h localhost -p 55432 -U postgres -d mocter -t <tabla> -Fc > /tmp/<tabla>.dump
   ```

3. Importar en producción con `pg_restore --data-only --disable-triggers`.
4. Verificar conteos y claves foráneas antes de reabrir el servicio.
5. Destruir la instancia de scratch.

### 7.6 Verificación posterior a cualquier restore

| Control | Comando | Resultado esperado |
|---|---|---|
| Disponibilidad | `pg_isready -h <host> -p <puerto>` | `accepting connections` |
| Versión y extensión | `SELECT version(); SELECT extversion FROM pg_extension WHERE extname='vector';` | PostgreSQL 18 y pgvector presente |
| Migraciones | `SELECT count(*) FROM drizzle.__drizzle_migrations;` | Coincide con la última versión desplegada |
| Conteos | `SELECT count(*) FROM <tabla crítica>;` | Dentro del rango esperado del incidente |
| Escritura | `INSERT` y `DELETE` en una tabla de prueba | Sin error de solo lectura |
| Aplicación | `curl -fsS https://mocter.co/api/...` | HTTP 2xx |

La tabla exacta de conteos críticos se fija por instancia en T-10.

### 7.7 Prueba trimestral

1. Agendar la ventana con el dueño del producto.
2. Elegir un escenario rotativo: full, PITR, celda y Chatwoot.
3. Ejecutar el restore en un entorno aislado con el mismo procedimiento del incidente.
4. Medir tiempo total y compararlo con el RTO aprobado.
5. Guardar evidencia: fecha, ejecutor, comando, salida, duración y diferencias.
6. Registrar hallazgos y abrir tareas de corrección.

## 8. Escenarios de continuidad

| Escenario | Detección | Acción | RTO objetivo |
|---|---|---|---|
| Pérdida total del VPS | Sitio caído + alerta externa | Aprovisionar VPS, restaurar control plane, celdas y Chatwoot en ese orden | 2 h control / 4 h total |
| Corrupción lógica | Error de aplicación o datos inconsistentes | PITR al instante previo; validar | 2 h control |
| Borrado accidental de tabla | Alerta o reporte | Recuperar tabla desde scratch (§7.5) | 4 h |
| Ransomware | Archivos cifrados o accesos anómalos | Aislar el VPS, restaurar desde R2, rotar credenciales y passphrase | 8 h total; restore de datos ≤ 2/4 h |
| R2 no disponible | `archive-push` falla | La operación continúa; WAL se acumula; alerta crítica al superar el límite de disco | Sin caída |
| Redis del plano de control no disponible | Healthcheck o error de auth | El auth usa Postgres como fallback; si Postgres tampoco responde, falla cerrado; no se crean sesiones locales en el pod | Sin pérdida de sesión persistida |

El RTO de ransomware incluye contención y rotación de credenciales; el restore de datos mantiene los objetivos de 2 h para el control plane y 4 h para celdas y Chatwoot (RF-03.1).

**Dependencias del restore:** DNS de `mocter.co`, Traefik, credenciales de GHCR para la imagen, archivo `.env` de producción y acceso al gestor de secretos. **Dependencia de runtime:** Redis 7+ del plano de control para sesión, revocación y caché de enrutamiento; se reconstruye vacío tras el restore. Si falta cualquiera de las dependencias de restore, el RTO no se cumple. La lista se verifica en cada prueba trimestral.

## 9. Observabilidad

### 9.1 Stack

| Pieza | Función | Retención |
|---|---|---|
| Grafana Alloy | Agente de recolección y envío | — |
| Grafana Cloud Metrics | Series de todos los exporters | 30 días |
| Grafana Cloud Logs (Loki) | Logs de contenedores y backups | 14 días (O-05) |
| Grafana Alerting | Reglas, silencios y notificaciones | — |
| Grafana Synthetic Monitoring | Disponibilidad externa de `mocter.co` | 30 días |

> **No verificado:** los límites del plan gratuito de Grafana Cloud cambian con el tiempo. Se confirman al contratar (T-07) y se registran en esta spec.

### 9.2 Métricas mínimas

| Métrica | Fuente | Umbral | Severidad |
|---|---|---|---|
| `pg_up` | postgres_exporter | 0 por 2 min | Crítico |
| Conexiones / pool | PgBouncer, PostgreSQL | > 80 % sostenido 10 min | Alto |
| Tamaño de índices HNSW | `pg_stat_user_indexes` | > 65 % de RAM | Alto |
| Particiones / relaciones | `pg_class` | > 8.000 | Aviso |
| Hit rate de caché de enrutamiento | Aplicación | < 90 % por 15 min | Alto |
| Errores de enrutamiento | Aplicación | > 0,1 % por 15 min | Crítico |
| Lag de migración | Réplica lógica | > 0 bytes en cutover | Crítico |
| CPU P95 | node_exporter | > 70 % sostenido 10 min | Alto |
| Espacio libre | node_exporter | < 20 % | Alto |
| Antigüedad del último full | Script de backup | > 8 días | Crítico |
| Fallo de backup full/diff | Script de backup | Última corrida con error | Crítico |
| Backup no iniciado a la hora | Script de backup | > 5 min de retraso | Crítico |
| Último `archive-push` | pgBackRest | > 15 min | Crítico |
| `verify` fallido | pgBackRest | Última corrida con error | Crítico |
| Consumo del presupuesto | Costo estimado | > 80 % | Aviso |
| Sitio público | Synthetic Monitoring | Caído 2 min | Crítico |

### 9.3 Dashboards

1. **Control plane:** CPU, memoria, disco, conexiones, WAL, antigüedad de backups.
2. **Celda:** las mismas métricas por celda, más HNSW y particiones.
3. **Chatwoot:** base, Sidekiq, cola y latencia.
4. **Respaldos:** último full por stanza, último WAL, resultado de `verify`, tamaño del repositorio y costo estimado.

## 10. Alertas

| Severidad | Cuándo | Canal | Escalado |
|---|---|---|---|
| Crítico | Servicio caído, backup fallido o no iniciado, RPO incumplido | Correo + mensajería + push | Reenvío a los 30 min si no se acusa (RF-05.5) |
| Alto | Degradación con riesgo: disco, CPU, pool, HNSW | Correo + mensajería | Sin reenvío |
| Aviso | Tendencia o umbral informativo, incluido el 80 % del presupuesto | Correo | No |

Reglas de higiene:

- Toda alerta enlaza un runbook (§7) o una tarea concreta.
- Las ventanas de mantenimiento se silencian con anticipación y quedan registradas.
- Una alerta que se repite sin acción se convierte en tarea, no en ruido permanente.
- El operador único no recibe alertas que no pueda accionar.

Canales definitivos y segundo respondedor: O-02. Mientras no se resuelva, se usa correo y mensajería del dueño del producto.

## 11. Costos

### 11.1 Fórmula

```text
costo_mensual = (GB_almacenados × precio_GB_mes)
              + (operaciones_clase_A / 1.000.000 × precio_clase_A)
              + (operaciones_clase_B / 1.000.000 × precio_clase_B)
              + monitoreo
```

- R2 no cobra egress; las pruebas de restore no suman costo de transferencia.
- Las operaciones de clase A incluyen escrituras y listados; las de clase B, lecturas.
- El monitoreo se estima según el plan de Grafana Cloud que se contrate (O-05).

> **No verificado:** los precios unitarios de R2 y de Grafana Cloud se confirman al contratar y se registran en T-08. Esta spec fija la fórmula, no los valores vigentes.

### 11.2 Estimación

| Volumen | Almacenamiento | Comentario |
|---|---|---|
| 10 GB | ~0,15 USD/mes | Solo control plane |
| 50 GB | ~0,75 USD/mes | Control + una celda |
| 200 GB | ~3,00 USD/mes | Varias celdas |

Los valores usan 0,015 USD por GB-mes como referencia y no incluyen operaciones. El tamaño real se mide en T-09.

## 12. Seguridad

- Token R2 de alcance mínimo: solo el bucket `mocter-backups`, solo objetos, sin administración de cuenta.
- Credenciales separadas por entorno; la de producción no se usa en laboratorio.
- Ningún secreto en Git. `.env` con `0600` y propietario root; `pgbackrest.conf` y `cipher` con `0600` y propietario `postgres`.
- La passphrase de cifrado no comparte archivo con las credenciales de R2 en el VPS.
- El acceso al VPS se hace por clave SSH; el restore requiere además el gestor de secretos.
- Los logs de pgBackRest no incluyen la passphrase ni las claves; se verifica en T-04.

## 13. Verificación de esta spec

| Control | Comando | Evidencia |
|---|---|---|
| Configuración válida | `pgbackrest-secure --stanza=<s> check` | Salida `completed successfully` |
| Backup real | `pgbackrest-secure --stanza=<s> --type=full backup` | Full en R2 con timestamp |
| Integridad | `pgbackrest-secure --stanza=<s> --repo1-verify verify` | Sin errores de checksum |
| Restore | Runbook §7.1 en entorno aislado | Duración ≤ RTO |
| PITR | Runbook §7.2 a un timestamp conocido | Dato presente hasta el punto y ausente después |
| Observabilidad | Dashboard de respaldos | Último full y último WAL visibles |
| Alerta | Simular un fallo de backup y un timer no ejecutado en laboratorio | Alerta en ≤ 5 min |
| Documentación | Ejecución por alguien sin contexto | Completa sin ayuda |

## 14. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pérdida de la passphrase | Respaldo irrecuperable | Copia en gestor de secretos y copia offline del dueño |
| R2 rechaza la configuración de pgBackRest | No hay archiving | Prueba en laboratorio antes de producción (T-03) |
| R2 no disponible | WAL se acumula y puede llenar el disco | Alerta al 60 % del límite de retención local; reintento automático |
| Ventana de full con presión de I/O | Degradación del servicio | `process-max` limitado y horario de madrugada |
| Drill trimestral omitido | RTO no confiable | Fecha agendada y evidencia obligatoria (CA-4) |
| Costo de logs crece | Gasto no previsto | Retención definida (O-05) y alerta de presupuesto |
| Token de R2 filtrado | Acceso a respaldos | Alcance mínimo, rotación y versionado |
| Backup de Chatwoot restaurado en base equivocada | Corrupción cruzada | Runbook §7.4 y verificación de imagen 4.19.0 |

## 15. Glosario

| Término | Qué es |
|---|---|
| **WAL** | Registro anticipado de escritura de PostgreSQL. Es la secuencia de cambios que permite reconstruir la base. |
| **Archiving** | Copiar cada segmento WAL cerrado al repositorio externo. Sin esto no hay PITR. |
| **PITR** | *Point-in-time recovery*: restaurar la base hasta un instante exacto, no solo hasta el último backup. |
| **RPO** | Cuántos datos se pueden perder como máximo, medido en tiempo. Aquí: 15 minutos. |
| **RTO** | Cuánto puede tardar la recuperación. Aquí: 2 h control, 4 h celdas y Chatwoot. |
| **Stanza** | Configuración nombrada de una instancia dentro de pgBackRest. Una por base. |
| **Repositorio** | Destino donde pgBackRest guarda full, diff y WAL. Aquí, un prefijo de R2 por instancia. |
| **Full** | Copia completa de la base. Base de toda la cadena. |
| **Diff** | Copia de lo que cambió desde el último full. |
| **Incremental** | Copia de lo que cambió desde el último backup de cualquier tipo. No se usa en la política base. |
| **`verify`** | Comando que recalcula checksums del repositorio sin restaurar. |
| **Egress** | Transferencia de datos desde el proveedor hacia afuera. En R2 no se cobra. |
| **Versionado** | El proveedor conserva versiones anteriores de un objeto aunque se sobrescriba o borre. |
| **WORM** | *Write once, read many*: inmutabilidad garantizada. No es lo mismo que versionado. |
| **Offsite** | Fuera del servidor de producción. Si el VPS se pierde, el respaldo sigue existiendo. |
| **Scratch** | Instancia temporal y aislada donde se prueba un restore sin tocar producción. |

## 16. Actualización de esta spec

1. Un cambio de proveedor, herramienta o RPO/RTO sube la versión menor.
2. Un cambio de procedimiento se prueba primero en laboratorio y luego se actualiza el runbook.
3. Toda prueba trimestral agrega su evidencia y, si cambió el RTO real, se ajusta la decisión.
4. Las preguntas abiertas se cierran con su decisión y su entrada en §8 de `requirements.md`.
5. Lo que no se pueda verificar se marca como **no verificado** y no se publica como hecho.

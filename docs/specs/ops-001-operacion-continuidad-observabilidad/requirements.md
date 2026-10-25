# OPS-001 · Requisitos · Operación, continuidad y observabilidad

| Atributo | Valor |
|---|---|
| ID | OPS-001 |
| Versión | 1.1 |
| Estado | Aprobada |
| Fecha | 2026-10-21 · actualizado 2026-10-24 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |
| Depende de | [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) · [CD-001](../cd-001-despliegue-continuo/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) |
| Directivas | `.agents/AGENTS.md` |

## 1. Propósito

Definir cómo Mocter **protege los datos, los recupera y sabe que la plataforma está sana**. Cubre tres tipos de instancia PostgreSQL:

1. Router Global (`pg-portal`), que hoy comparte base con la landing.
2. Celdas (`pg-cell-*`), una por grupo de inquilinos.
3. Chatwoot (`pg-chatwoot`), en el plano de soporte.

El sistema se despliega en todos sus ambientes en Docker con **Docker Compose**, donde **Traefik** actúa como reverse proxy único para todo el tráfico de la plataforma. Bajo esta misma topología, **Chatwoot (`chatwoot/chatwoot:v4.19.1`)** y **SeaweedFS (`seaweedfs/seaweedfs:4.49`)** corren como contenedores administrados por Traefik (sin publicar puertos en el host, cumpliendo R-10), proveyendo la bandeja de atención omnicanal y el almacenamiento de archivos multimedia de los inquilinos respectivamente.

La necesidad nace de una contradicción documental: DAT-001 §9.1 delega destino, retención y prueba de restore en CD-001, y CD-001 excluye de su alcance las copias fuera del host y el monitoreo externo. Hoy el único respaldo es un `pg_dump` previo al despliegue, guardado en el mismo VPS (`deploy/server/deploy.sh`, retención 10). Si el VPS se pierde, se pierde el respaldo con él.

Esta especificación también es material de aprendizaje: el respaldo y la observabilidad son campos nuevos para el equipo, así que cada decisión se explica y cada procedimiento se puede ejecutar sin contexto previo (§4, RF-08).

## 2. Alcance

### Incluye

1. Respaldo físico con archiving continuo de WAL hacia almacenamiento de objetos S3 compatible (Cloudflare R2).
2. Restore completo y recuperación a un punto en el tiempo (PITR) por instancia.
3. Respaldo y restore de la multimedia de producto en SeaweedFS hacia R2.
4. Continuidad: escenarios de pérdida, orden de recuperación, RPO/RTO y dependencias.
5. Observabilidad: métricas de infraestructura, PostgreSQL, PgBouncer y respaldos, con retención y dashboards.
6. Alertas: umbrales, severidades, canales, silencios y escalado.
7. Costos: fórmula, estimación y control del gasto.
8. Runbooks, glosario y verificación reproducible.

### Excluye

- Código de aplicación, migraciones y cambios de esquema.
- Alta disponibilidad, réplica en caliente y despliegue sin caída (blue/green).
- Kubernetes y CloudNativePG, diferidos por DAT-001 D-12.
- Respaldo de N8N, fuera del alcance del programa.
- Análisis forense y respuesta a incidentes de seguridad.

## 3. Actores

| Actor | Rol |
|---|---|
| Operador único | Ejecuta respaldos, restore y atiende alertas. Es el dueño del producto; no hay segundo respondedor en v1 |
| Dueño del producto | Aprueba presupuesto, canales de alerta y ventana de la prueba trimestral |
| Agente LLM | Ejecuta runbooks y verifica resultados siguiendo esta especificación; no decide por su cuenta (§4, RF-08.4) |
| Cloudflare R2 | Destino offsite de los respaldos |
| Grafana Cloud | Métricas, logs, dashboards y alertas fuera del VPS |

## 4. Requisitos funcionales

### RF-01 · Respaldo

| ID | Requisito |
|---|---|
| RF-01.1 | El destino es un bucket dedicado en Cloudflare R2, con versionado de objetos habilitado y credenciales de mínimo privilegio limitadas a ese bucket. |
| RF-01.2 | Cada instancia tiene su propio repositorio y su propia *stanza*: `pg-portal`, `pg-cell-*` y `pg-chatwoot`. Un respaldo nunca mezcla datos de instancias distintas. |
| RF-01.3 | La política base es: full semanal, diferencial diaria y archiving continuo de WAL. El RPO resultante es ≤ 15 minutos (D-02). |
| RF-01.4 | La retención base es: Router Global 30 días; celdas y Chatwoot 14 días. El WAL se conserva mientras exista el full más antiguo que lo requiera. |
| RF-01.5 | El cifrado es del lado del cliente con AES-256 y una passphrase que nunca vive en el repositorio. R2 almacena bytes cifrados. |
| RF-01.6 | Cada corrida registra fecha, tipo, duración, tamaño, resultado y RPO alcanzado, y su fallo genera una alerta (RF-05). |
| RF-01.7 | La verificación semanal del repositorio (`verify`) comprueba checksums e integridad sin restaurar. |
| RF-01.8 | Si R2 no está disponible, la instancia sigue operando y acumula WAL localmente con un límite declarado; al superarlo, alerta crítica. |
| RF-01.9 | El `pg_dump` previo al despliegue de CD-001 se conserva como respaldo de migración, no como estrategia de continuidad (D-10). |
| RF-01.10 | SeaweedFS se respalda a R2 con snapshot/versionado y restore probado; el procedimiento y la retención se documentan en OPS-001 y no dependen de ADM-001. |
| RF-01.11 | **No se exige WORM en v1.** R2 usa versionado, cifrado en cliente y credenciales de alcance mínimo; WORM se evalúa si aparece un requisito de cumplimiento. |

### RF-02 · Restore

| ID | Requisito |
|---|---|
| RF-02.1 | Se puede recuperar cualquier instancia a un punto en el tiempo dentro de su retención (PITR). |
| RF-02.2 | El restore se ejecuta sobre una instancia nueva o aislada, nunca sobre la productiva, salvo que se declare un incidente y el operador lo documente. |
| RF-02.3 | Existe un runbook por instancia con comandos exactos, tiempos esperados, verificación y errores comunes (RF-08). |
| RF-02.4 | La verificación posterior comprueba: disponibilidad (`pg_isready`), versión y extensiones, conteos mínimos por tabla crítica, integridad de migraciones y una operación funcional de lectura y escritura. |
| RF-02.5 | El restore de Chatwoot se hace en su propia instancia y nunca se importa dentro de la base de Mocter. |
| RF-02.6 | Se mide el RTO real de cada prueba y se registra la diferencia contra el objetivo. |

### RF-03 · Continuidad

| ID | Requisito |
|---|---|
| RF-03.1 | RPO ≤ 15 minutos en las tres instancias. RTO ≤ 2 horas para el Router Global y ≤ 4 horas para celdas y Chatwoot. |
| RF-03.2 | Se documentan y ensayan cinco escenarios: pérdida total del VPS, corrupción lógica, borrado accidental, ransomware y indisponibilidad de R2. |
| RF-03.3 | El orden de recuperación es: Router Global → celdas → Chatwoot. Sin control plane no hay enrutamiento ni autenticación. |
| RF-03.4 | Se documentan las dependencias externas del restore: DNS, Traefik, credenciales de GHCR y acceso a R2. |
| RF-03.5 | La pérdida del VPS no pierde el respaldo: el repositorio vive en R2 y la passphrase en un gestor de secretos externo. |
| RF-03.6 | La prueba de restore es trimestral, con fecha, ejecutor, duración, resultado y evidencia adjunta. |
| RF-03.7 | El Redis 7+ del plano de control es una dependencia de autenticación y enrutamiento. Su indisponibilidad se monitorea y se trata como incidente del plano de control; el store de sesiones no vive en el pod y no se degrada a sesiones locales. Si Redis cae, el auth usa Postgres como fallback; si Postgres tampoco responde, falla cerrado. |

### RF-04 · Observabilidad

| ID | Requisito |
|---|---|
| RF-04.1 | Se recolectan las métricas de DAT-001 §9.2: conexiones y pool, tamaño de índices HNSW, particiones, hit rate y errores de enrutamiento, lag de migración, CPU P95 y espacio libre. |
| RF-04.2 | La recolección es off-host: si el VPS se pierde, las métricas y las alertas siguen disponibles. |
| RF-04.3 | Existe un dashboard por plano (control, celda, Chatwoot) y uno de respaldos con la antigüedad del último full, el último WAL archivado y el resultado del último `verify`. |
| RF-04.4 | La retención mínima es de 30 días para métricas y 14 días para logs. |
| RF-04.5 | Se monitorean los healthchecks de los contenedores y la disponibilidad del sitio público desde fuera del VPS. |

### RF-05 · Alertas

| ID | Requisito |
|---|---|
| RF-05.1 | Las alertas tienen tres severidades: **crítico** (servicio caído o respaldo roto), **alto** (degradación con riesgo) y **aviso** (tendencia). |
| RF-05.2 | Toda alerta enlaza el runbook que la resuelve. |
| RF-05.3 | Los canales son correo electrónico y mensajería instantánea. Lo crítico requiere notificación push. |
| RF-05.4 | Hay deduplicación, agrupación y silencios programados para ventanas de mantenimiento. |
| RF-05.5 | Con operador único, una alerta crítica no acusada en 30 minutos se reenvía. **No hay segundo respondedor en v1**; el riesgo se documenta y se revisa cuando el SLA lo exija. |
| RF-05.6 | Un respaldo fallido o ausente alerta en ≤ 5 minutos. |

### RF-06 · Seguridad

| ID | Requisito |
|---|---|
| RF-06.1 | El token de R2 se limita al bucket de respaldos; no tiene permisos de administración ni acceso a otros buckets. |
| RF-06.2 | Las credenciales de R2 y la passphrase de cifrado se rotan al menos una vez al año y ante cualquier sospecha de compromiso. |
| RF-06.3 | Ningún secreto vive en el repositorio. Los archivos de configuración con credenciales tienen permisos `0600`. |
| RF-06.4 | La passphrase de cifrado se guarda en un gestor de secretos y en una copia offsite; sin ella el respaldo es irrecuperable. |
| RF-06.5 | Restaurar exige dos secretos distintos: acceso a R2 y passphrase. Cada uno vive en un archivo separado con permisos `0600` en el VPS; ninguno se guarda en el repositorio ni en el mismo archivo. |

### RF-07 · Costos

| ID | Requisito |
|---|---|
| RF-07.1 | Existe una fórmula de costo mensual: almacenamiento (GB-mes) más operaciones de clase A y B, con el egress de R2 en cero. |
| RF-07.2 | El presupuesto mensual máximo es **≤ USD 50/mes** para R2 + observabilidad; se alerta al 80 % del consumo. |
| RF-07.3 | El costo se revisa en cada prueba trimestral junto con el tamaño real de los respaldos. |

### RF-08 · Documentación para humanos y para LLM

| ID | Requisito |
|---|---|
| RF-08.1 | Cada comando del runbook declara propósito, entrada, salida esperada y error común con su causa. |
| RF-08.2 | Existe un glosario de los términos del dominio (WAL, PITR, RPO, RTO, stanza, repositorio, full/diff, egress, versionado). |
| RF-08.3 | Los runbooks se pueden ejecutar sin contexto previo y sin decisiones implícitas. |
| RF-08.4 | La spec distingue explícitamente **verificado**, **supuesto** y **no verificado**. Un agente no convierte un supuesto en hecho. |
| RF-08.5 | Los procedimientos destructivos declaran su efecto, su reversión y la confirmación que exigen. |

## 5. Criterios de aceptación

1. Existe un respaldo offsite, cifrado y versionado de las tres instancias, y su ausencia genera alerta.
2. El RPO medido en una prueba es ≤ 15 minutos.
3. Un restore completo se ejecuta dentro del RTO y deja evidencia con duración y resultado.
4. La prueba trimestral está agendada, tiene dueño y su primera ejecución quedó registrada.
5. Las métricas de DAT-001 §9.2 se ven en un dashboard off-host.
6. Toda alerta crítica enlaza un runbook ejecutable.
7. Un fallo de respaldo alerta en ≤ 5 minutos.
8. El costo mensual se calcula con datos reales y respeta el presupuesto aprobado.
9. Ningún secreto de R2 ni la passphrase aparecen en el repositorio.
10. Un operador sin contexto previo puede ejecutar el runbook de restore siguiendo solo la spec.
11. La indisponibilidad del Redis del plano de control se detecta y no degrada a sesiones locales; el auth usa Postgres como fallback y, si tampoco responde, falla cerrado.
12. SeaweedFS tiene respaldo en R2 y restore probado; la pérdida del VPS no deja la multimedia de los inquilinos sin recuperación.

## 6. Decisiones

| ID | Decisión | Motivo |
|---|---|---|
| D-01 | Cloudflare R2 como destino de respaldos. | S3 compatible, versionado y egress sin costo, lo que abarata las pruebas de restore. Wasabi impone 90 días mínimos de retención, incompatible con 14 días en celdas y Chatwoot; AWS S3 cobra el egress de cada restore. |
| D-02 | RPO ≤ 15 minutos; RTO ≤ 2 horas para el Router Global y ≤ 4 horas para celdas y Chatwoot. | El RPO obliga a archiving continuo de WAL; el RTO del control plane se justifica porque su caída bloquea enrutamiento y login de todos los inquilinos. |
| D-03 | Respaldo físico con PITR, no solo lógico. | Un `pg_dump` diario no alcanza un RPO de 15 minutos ni permite recuperar hasta el último WAL. |
| D-04 | Cifrado del lado del cliente antes de subir. | R2 no debe ver el contenido en claro; el cifrado sobrevive a un cambio de proveedor. |
| D-05 | Un repositorio y una *stanza* por instancia. | Aísla el fallo, permite retención distinta y evita mezclar el catálogo global con las celdas. |
| D-06 | Observabilidad off-host con Grafana Cloud. | Si el VPS cae, el monitoreo local cae con él. No hay VPS alterno disponible (CD-001, staging diferido). |
| D-07 | Alertas por correo y mensajería, con push para lo crítico. | El operador es una sola persona y no hay guardia 24/7 contratada. |
| D-08 | Operador único con guardia *best-effort*. | Refleja la realidad actual; no hay segundo respondedor en v1 y el riesgo se revisa cuando el SLA lo exija. |
| D-09 | Prueba de restore trimestral con evidencia. | Un respaldo no probado no es un respaldo; el ensayo mide el RTO real. |
| D-10 | El `pg_dump` de `deploy.sh` se conserva como respaldo de migración. | Protege el despliegue, pero no cumple RPO/RTO ni es offsite. No se elimina para no romper CD-001. |
| D-11 | Presupuesto ≤ USD 50/mes; full semanal, diff diario, logs de 14 días. | Mantiene el costo bajo y cubre el RPO con WAL continuo. |
| D-12 | Sin WORM en v1; R2 con versionado y cifrado. | Cubre borrado accidental sin el costo y la complejidad de object lock. |
| D-13 | Operador único con guardia best-effort; sin segundo respondedor en v1. | Refleja la realidad actual; el riesgo se revisa cuando el SLA lo exija. |
| D-14 | El respaldo de SeaweedFS entra en OPS-001. | Centraliza backup/restore y evita que la multimedia quede sin protección. |

## 7. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
No quedan decisiones abiertas en OPS-001.

**Cerradas el 2026-10-24:** O-01 (presupuesto ≤ USD 50/mes), O-02 (operador único best-effort, sin segundo respondedor), O-03 (sin WORM; versionado y cifrado), O-04 (full semanal + diff diario), O-05 (logs de 14 días) y O-06 (SeaweedFS entra en OPS-001).

## 8. Trazabilidad

- 2026-10-21: se crea OPS-001 por contradicción entre DAT-001 §9.1 y el alcance excluido de CD-001. Decisiones D-01 (R2) y D-02 (RPO/RTO) aprobadas por el dueño del producto; alcance ampliado a observabilidad y alertas por la misma exclusión de CD-001.
- 2026-10-22: **OPS-001 aprobada** por el dueño del producto. Las decisiones O-01 a O-06 quedan diferidas a la implementación y las tareas de laboratorio T-02, T-03, T-08 y T-18 se ejecutan antes de producción. El planeamiento global del SDD queda cerrado; la implementación y RDD requieren autorización explícita aparte.
- 2026-10-22: alineación con AUTH-D-06; Redis es dependencia de runtime con fallback a Postgres y fallo cerrado. Se agrega guardia de backup cada 5 minutos, alerta de fallo/ausencia, alerta de presupuesto al 80 % y se corrige la retención de WAL para que cubra el full más antiguo. La passphrase de cifrado queda en un archivo separado de las credenciales R2 y se inyecta con el wrapper `pgbackrest-secure`.
- 2026-10-24: O-01 a O-06 cerradas — presupuesto ≤ USD 50/mes, operador único best-effort, sin WORM, full semanal + diff diario, logs 14 días y SeaweedFS incluido en OPS-001. Se agregan RF-01.10, RF-01.11 y el criterio 12.

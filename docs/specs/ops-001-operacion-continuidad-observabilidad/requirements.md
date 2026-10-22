# OPS-001 · Requisitos · Operación, continuidad y observabilidad

| Atributo | Valor |
|---|---|
| ID | OPS-001 |
| Versión | 1.0 |
| Estado | Borrador |
| Fecha | 2026-10-21 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |
| Depende de | [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) · [CD-001](../cd-001-despliegue-continuo/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) |
| Directivas | `.agents/AGENTS.md` |

## 1. Propósito

Definir cómo Mocter **protege los datos, los recupera y sabe que la plataforma está sana**. Cubre tres tipos de instancia PostgreSQL:

1. Router Global (`pg-portal`), que hoy comparte base con la landing.
2. Celdas (`pg-cell-*`), una por grupo de inquilinos.
3. Chatwoot (`pg-chatwoot`), en el plano de soporte.

La necesidad nace de una contradicción documental: DAT-001 §9.1 delega destino, retención y prueba de restore en CD-001, y CD-001 excluye de su alcance las copias fuera del host y el monitoreo externo. Hoy el único respaldo es un `pg_dump` previo al despliegue, guardado en el mismo VPS (`deploy/server/deploy.sh`, retención 10). Si el VPS se pierde, se pierde el respaldo con él.

Esta especificación también es material de aprendizaje: el respaldo y la observabilidad son campos nuevos para el equipo, así que cada decisión se explica y cada procedimiento se puede ejecutar sin contexto previo (§4, RF-08).

## 2. Alcance

### Incluye

1. Respaldo físico con archiving continuo de WAL hacia almacenamiento de objetos S3 compatible (Cloudflare R2).
2. Restore completo y recuperación a un punto en el tiempo (PITR) por instancia.
3. Continuidad: escenarios de pérdida, orden de recuperación, RPO/RTO y dependencias.
4. Observabilidad: métricas de infraestructura, PostgreSQL, PgBouncer y respaldos, con retención y dashboards.
5. Alertas: umbrales, severidades, canales, silencios y escalado.
6. Costos: fórmula, estimación y control del gasto.
7. Runbooks, glosario y verificación reproducible.

### Excluye

- Código de aplicación, migraciones y cambios de esquema.
- Alta disponibilidad, réplica en caliente y despliegue sin caída (blue/green).
- Kubernetes y CloudNativePG, diferidos por DAT-001 D-12.
- Respaldo del almacenamiento de objetos de media (SeaweedFS), que pertenece a la especificación de archivos.
- Respaldo de N8N, fuera del alcance del programa.
- Análisis forense y respuesta a incidentes de seguridad.

## 3. Actores

| Actor | Rol |
|---|---|
| Operador único | Ejecuta respaldos, restore y atiende alertas. Es el dueño del producto mientras no exista un segundo respondedor |
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
| RF-05.5 | Con operador único, una alerta crítica no acusada en 30 minutos se reenvía. El escalado a una segunda persona es una decisión abierta (O-02). |
| RF-05.6 | Un respaldo fallido o ausente alerta en ≤ 5 minutos. |

### RF-06 · Seguridad

| ID | Requisito |
|---|---|
| RF-06.1 | El token de R2 se limita al bucket de respaldos; no tiene permisos de administración ni acceso a otros buckets. |
| RF-06.2 | Las credenciales de R2 y la passphrase de cifrado se rotan al menos una vez al año y ante cualquier sospecha de compromiso. |
| RF-06.3 | Ningún secreto vive en el repositorio. Los archivos de configuración con credenciales tienen permisos `0600`. |
| RF-06.4 | La passphrase de cifrado se guarda en un gestor de secretos y en una copia offsite; sin ella el respaldo es irrecuperable. |
| RF-06.5 | Restaurar exige dos secretos distintos: acceso a R2 y passphrase. Ninguno de los dos se guarda junto al otro en el VPS. |

### RF-07 · Costos

| ID | Requisito |
|---|---|
| RF-07.1 | Existe una fórmula de costo mensual: almacenamiento (GB-mes) más operaciones de clase A y B, con el egress de R2 en cero. |
| RF-07.2 | Se define un presupuesto mensual y una alerta al 80 % del consumo. |
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
| D-08 | Operador único con guardia *best-effort*. | Refleja la realidad actual; el escalado a un segundo respondedor queda abierto (O-02). |
| D-09 | Prueba de restore trimestral con evidencia. | Un respaldo no probado no es un respaldo; el ensayo mide el RTO real. |
| D-10 | El `pg_dump` de `deploy.sh` se conserva como respaldo de migración. | Protege el despliegue, pero no cumple RPO/RTO ni es offsite. No se elimina para no romper CD-001. |

## 7. Decisiones abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| O-01 | ¿Cuál es el presupuesto mensual máximo para R2 y monitoreo? | Define retención, frecuencia de full y si se contrata un plan pago de observabilidad. |
| O-02 | ¿Hay un segundo respondedor o la guardia es solo del dueño del producto? | Cambia el escalado de RF-05.5 y el RTO real fuera del horario laboral. |
| O-03 | ¿Se exige inmutabilidad tipo WORM además del versionado? | Si se exige, hay que evaluar un destino adicional con object lock. R2 ofrece versionado, no WORM. |
| O-04 | ¿La frecuencia de full es semanal o diaria? | Más full mejora el RTO y aumenta el costo y la ventana de I/O. |
| O-05 | ¿Qué retención de logs se necesita: 14, 30 o 90 días? | Afecta el plan y el costo de Grafana Cloud. |
| O-06 | ¿El respaldo de SeaweedFS entra en esta spec o en la de archivos? | Define el alcance del respaldo de multimedia; hoy queda fuera. |

## 8. Trazabilidad

- 2026-10-21: se crea OPS-001 por contradicción entre DAT-001 §9.1 y el alcance excluido de CD-001. Decisiones D-01 (R2) y D-02 (RPO/RTO) aprobadas por el dueño del producto; alcance ampliado a observabilidad y alertas por la misma exclusión de CD-001.

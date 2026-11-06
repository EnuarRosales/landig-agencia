# CEL-001 — Despliegue, ubicación y multimedia de celdas

**Versión:** 1.0  
**Estado:** Aprobada como especificación canónica por el usuario · 2026-11-06  
**Propósito:** Definir en una sola fuente los contratos de despliegue celular, ubicación física, capacidad y acceso de `tenant-app` a multimedia.  
**Autoridad:** CEL-001 es la fuente canónica para despliegue, placement y multimedia celular. DAT-001 conserva los invariantes generales del plano de datos; ADM-001, los contratos comerciales y de producto; OPS-001, continuidad, backups y observabilidad.

## Fuentes y documentos relacionados

- [DAT-001 — Arquitectura de datos multi-inquilino](../dat-001-arquitectura-datos-multiinquilino/requirements.md): modelo de datos, routing, RLS, particionamiento y capacidad.
- [ADM-001 — mocter-admin](../adm-001-mocter-admin/requirements.md): catálogo, formatos, cuotas y comportamiento de producto multimedia.
- [OPS-001 — Operación, continuidad y observabilidad](../ops-001-operacion-continuidad-observabilidad/requirements.md): backups, restore, observabilidad, runbooks y seguridad operacional.
- [Producción observada](../../reference/production-services.md): inventario documentado de endpoints y redes; no acredita conectividad desde hosts celulares.
- [ODD de implementación celular](../../../odd/tasks/cell-handshake-implementation.md): ledger de decisiones y estado de implementación; no sustituye esta especificación.

## 1. Objetivo y límites

Esta especificación consolida los requisitos para hacer operativa una celda Mocter en tres perfiles: desarrollo local, producción en un VPS del Control Plane y producción en un VPS externo. Separa el modelo lógico celular de su host, conserva el límite nominal de 100 inquilinos por celda e integra la persistencia privada de archivos en SeaweedFS con su entrega segura por imgproxy.

La especificación define requisitos y criterios de aceptación. No demuestra que la implementación actual, redes, endpoints o despliegues estén operativos; esas evidencias se registran en las tareas y verificaciones de implementación.

### Dentro del alcance

- Registro de `cell_id` y `host_id`, capacidad y placement.
- Una especificación neutral `CellDeploymentSpec` y un renderer Compose.
- Los tres perfiles de despliegue y sus límites de red, imagen, build y puertos.
- Los cuatro servicios de cada celda y el orden one-shot del migrador.
- Routing `client_id → cell_id → host_id → application endpoint`.
- Persistencia de multimedia de producto en SeaweedFS y lectura por URLs firmadas de imgproxy.
- Handshake, probes, secretos y controles necesarios para activar una celda.
- Compatibilidad controlada con los valores existentes `local_compose` y `remote_vps`.

### Fuera de alcance

- Implementar Kubernetes, Helm, Kustomize, GitOps, operadores o service mesh.
- Implementar un scheduler automático de CPU/RAM, balanceo dinámico o migración automática de inquilinos.
- Crear SeaweedFS o imgproxy por celda; son servicios compartidos de plataforma.
- Administrar VPN, WireGuard, firewall o infraestructura cloud externa desde el Compose celular.
- Cambiar el almacenamiento de adjuntos de Chatwoot, que conserva su dominio y política propios.

## 2. Invariantes de arquitectura

| Invariante | Requisito |
|---|---|
| Planos | Se preservan los planos de soporte, Control Plane y Datos compuestos por celdas autónomas. |
| Tenencia | `client_id → cell_id` permanece como relación de routing autoritativa; no se trasladan inquilinos automáticamente. |
| Host | Se incorpora la relación `cell_id → host_id` en el modelo de placement. Host y celda tienen identidades separadas. |
| Claves entre planos | No se agregan claves foráneas entre planos; el routing se resuelve mediante los contratos del Control Plane. |
| Capacidad | `max_clients` nominal por celda es 100. La capacidad física de un host es independiente y puede reducir la capacidad efectiva de las celdas que aloja. |
| Topología | Cada celda contiene exactamente `pg-cell`, `cell-migrator`, `pgbouncer-cell` y `tenant-app`. |
| Aislamiento | PostgreSQL, su volumen, secretos y red privada pertenecen a una celda. RLS, particionamiento y handshake dual existentes se preservan conforme a DAT-001. |
| Multimedia | Los binarios de producto viven en SeaweedFS; PostgreSQL conserva metadatos y referencias. La entrega al cliente pasa por imgproxy firmado. |

## 3. Requisitos funcionales y de infraestructura

### 3.1 Registro, placement y capacidad

| ID | Requisito |
|---|---|
| CEL-RF-001 | El Control Plane conserva `client_id → cell_id` y agrega `cell_id → host_id`; la resolución termina en el endpoint de aplicación. Un registro `cell_hosts` en el Control Plane contiene `host_id`, código, clase/perfil de host, estado (`ready`, `maintenance`, `disabled`) y una referencia no secreta a su configuración de conectividad. Solo un host `ready` puede recibir nuevas celdas; `ready` es una declaración auditable del operador tras verificar manualmente la capacidad disponible. No se define un umbral numérico ni se implementa scheduler automático en esta fase. `cells.host_id` puede ser nulo en `draft`, pero se exige antes de `provisioning`. La relación interna Control Plane puede usar FK; no se crean FKs entre planos. |
| CEL-RF-002 | Toda celda nueva inicia con `max_clients = 100`. Ninguna asignación puede superar `max_clients`; la reserva de capacidad y el alta del inquilino son atómicas. La capacidad efectiva puede ser menor por límites operativos ya definidos en DAT-001. |
| CEL-RF-003 | La cantidad de celdas por host no es fija. La decisión de crear una celda se separa de elegir su host. La selección debe respetar capacidad operativa verificada manualmente, sin inventar un número fijo de celdas por VPS. El host debe estar `ready` y admitir el perfil seleccionado; ante un desacuerdo el renderer falla explícitamente y no cambia de perfil automáticamente. |
| CEL-RF-004 | La primera versión no implementa un scheduler automático de CPU/RAM ni mueve celdas o inquilinos cuando cambia la capacidad/estado de un host. El placement y cualquier cambio de host son explícitos y auditables; cambiar el estado de un host no reescribe `client_routing`. |
| CEL-RF-005 | El código de celda, los recursos y las rutas públicas son únicos por celda. Celdas diferentes en un mismo daemon no pueden colisionar en volumen, red, router, servicio o referencias de secretos. |

### 3.2 Perfiles de despliegue

La selección del perfil pertenece al modelo neutral. Los valores persistidos o expuestos `local_compose` y `remote_vps` se conservan; su mapping normativo se fija en CEL-RF-026.

| Perfil | Imagen y build | Redes y exposición |
|---|---|---|
| `local_development` | `tenant-app` se construye desde el Dockerfile real y el código fuente. No requiere imagen publicada, GHCR, TAG ni release. Ni construir ni ejecutar la celda puede acceder a Internet o a un registry; todas las dependencias deben estar disponibles en el workspace o en un caché local precargado, y las instalaciones en línea están prohibidas. | Puertos publicados solo en `127.0.0.1`; red interna exclusiva de la celda y redes locales requeridas configuradas explícitamente. No genera labels Traefik de producción. |
| `control_plane_vps` | Usa una imagen productiva explícita e inmutable; sin `build`, `latest` ni bind mount del código fuente. | No publica puertos en el host. Solo `tenant-app` se conecta a las redes externas necesarias. PostgreSQL, migrador y PgBouncer permanecen en la red interna celular, fuera de Traefik, Chatwoot y redes multimedia. El routing de Traefik usa labels únicas por `cell_code` y `traefik_network` como red de descubrimiento. |
| `external_vps` | Usa una imagen productiva explícita e inmutable; sin `build`, `latest` ni bind mount del código fuente. | Usa el Traefik local del host externo y no referencia redes Docker exclusivas del VPS principal. Los endpoints privados de Control Plane, Chatwoot y SeaweedFS y la URL pública de imgproxy son configurables. VPN/WireGuard/red privada/firewall son prerequisitos externos cuando no estén administrados por este repositorio. |

La excepción sin TAG aplica solo al build local de desarrollo: no es un artefacto de release ni una imagen productiva. La regla del repositorio que prohíbe `latest` y exige una referencia explícita sigue aplicando a ambos perfiles de producción.

Los nombres de redes indicados por el requerimiento —incluidos `mocter-core_default`, `mocter-chatwoot_default`, `media_network`, `traefik_network`, `mocter-admin-prod_backend` y `mocter-chatwoot_chatwoot_network`— son valores esperados de configuración, no evidencia de que existan en un host concreto. Cada despliegue valida las redes necesarias y falla con diagnóstico explícito si faltan.

### 3.3 Modelo neutral y renderer

| ID | Requisito |
|---|---|
| CEL-RF-006 | La generación parte de `CellDeploymentSpec`, independiente del renderer. Representa identidad, `cell_id`, `cell_code`, `host_id`, capacidad, perfil, fuente de `tenant-app`, puerto interno, probes, PostgreSQL persistente, migración one-shot, pool, configuración, referencias de secretos, integraciones, intención de conectividad, placement, endpoints y TLS. |
| CEL-RF-007 | `CellDeploymentSpec` no contiene primitivas Compose como `container_name`, `depends_on`, `restart`, `external: true`, `network_mode`, labels de Traefik, nombres físicos de redes, rutas `/opt`, sintaxis de volúmenes, secrets Compose ni publicación Compose de puertos. |
| CEL-RF-008 | `ComposeCellManifestRenderer` es responsable de producir `docker-compose.cell.yml` para el perfil seleccionado. Los tres perfiles conservan la misma topología lógica de cuatro servicios; las propiedades de build/imagen, redes, puertos y routing pueden variar según el perfil. Este contrato aclara DAT-001 RF-03.10: mismo contrato/servicios celulares, no YAML byte-a-byte idéntico entre perfiles. |
| CEL-RF-009 | No se implementa renderer Kubernetes en esta etapa. La abstracción solo queda preparada para una futura traducción de intenciones a recursos de orquestación; no se afirma compatibilidad Kubernetes como garantía. |

### 3.4 Migraciones, arranque y health

| ID | Requisito |
|---|---|
| CEL-RF-010 | `pg-cell` debe estar saludable antes del migrador. `cell-migrator` conecta directamente a PostgreSQL y ejecuta exclusivamente migraciones de celda mediante `drizzle.cell.config.ts`/el target celular explícito; aplica migraciones, termina con código 0 o falla explícitamente y no reinicia ni permanece como servicio. En `local_development`, las dependencias del migrador se precargan localmente y su inicio no ejecuta instalaciones en línea. |
| CEL-RF-011 | PgBouncer y `tenant-app` solo inician después del éxito de `cell-migrator`; `tenant-app` debe comprobar disponibilidad real de PgBouncer, no depender solo de `service_started`. `tenant-app` usa PgBouncer; el migrador no. |
| CEL-RF-012 | El lifecycle conserva estados y transiciones aprobados en DAT-001. Solo el handshake dual satisfactorio puede habilitar `verifying → active`; PATCH u otras rutas no pueden establecer `active` directamente. Las sondas nunca reactivan una celda ni mueven rutas de inquilinos. |
| CEL-RF-013 | El handshake de datos comprueba TLS donde corresponda, credencial `mocter_healthcheck` de mínimo privilegio, migraciones, tablas base y RLS habilitado/forzado sin leer filas de negocio. El handshake HTTP valida `X-Mocter-Handshake-Secret` en tiempo constante y no sigue redirecciones. |
| CEL-RF-014 | Los destinos remotos se resuelven y validan contra `CELL_PRIVATE_ALLOWED_CIDRS`; se rechazan destinos públicos, link-local/metadata y cambios DNS fuera del conjunto permitido. En local solo se admite loopback o la red celular explícitamente configurada. Una sonda liviana ejecuta `SELECT 1` y health HTTP cada 60 segundos; tres fallos consecutivos cambian `active → error_connection`. Recuperar una celda requiere handshake manual completo; ninguna probe reactiva ni mueve inquilinos. |
| CEL-RF-015 | Ningún secreto se incrusta en imágenes, Compose versionado, respuestas generales, logs o URLs visibles. El paquete incluye credenciales de `mocter_app`, `mocter_migrator`, `mocter_healthcheck` y `handshake_secret`, generadas criptográficamente con al menos 32 bytes cada una; se cifra AES-256-GCM con AAD ligado a `cell_id` y propósito. El Control Plane conserva solo ciphertext e identificador de clave. Los modelos neutrales contienen referencias de secretos. |

### 3.5 Persistencia y entrega de multimedia

| ID | Requisito |
|---|---|
| CEL-RF-016 | `tenant-app` debe poder escribir los bytes de multimedia de producto en SeaweedFS v4.51 (baseline aprobado) mediante S3-compatible privado, con path-style y el bucket `media`. SeaweedFS no se publica a Internet ni forma parte del Compose celular. La versión efectiva del host debe verificarse; el inventario de producción no prueba la conectividad de una celda. |
| CEL-RF-017 | PostgreSQL guarda metadatos, hash, clave de objeto y vínculos por producto/inquilino; no almacena los binarios. Se conserva el catálogo global y el modelo de referencias/deduplicación de DAT-001/ADM-001; la autorización de escritura y lectura siempre verifica el `client_id` dueño. |
| CEL-RF-018 | Las credenciales S3 se obtienen por referencias de secretos de servidor con mínimo privilegio. Nunca se envían al navegador, se incorporan a la imagen ni se exponen en manifiestos públicos. Las credenciales del servicio compartido son responsabilidad de la plataforma. |
| CEL-RF-019 | La lectura servida a usuarios se realiza con URLs HMAC-SHA256 firmadas por el backend hacia imgproxy. El backend limita fuentes a `s3://media/<key>` y a las transformaciones permitidas, e incluye `expires` en la firma. Las imágenes públicas pueden usar firma de larga duración; medios privados requieren autorización backend en cada emisión y `expires = 900` segundos, sin caché `immutable`. Una firma vencida responde 404. Renovar una URL requiere volver a autorizar el recurso para el `client_id` solicitante. El navegador recibe únicamente la URL pública de imgproxy; nunca recibe endpoint ni credenciales S3. |
| CEL-RF-020 | imgproxy v4.0.20 (baseline aprobado) es el único componente público del plano multimedia. Se conservan los límites aprobados de ADM-001: bucket `media`, origen máximo 100 MB, dimensión resultante máxima 4096 px, cola máxima 100 (429 al llenarse) y máximo un frame animado. Las claves key/salt las gestiona y rota la plataforma; no las contiene la imagen. La versión y reachability efectivas se verifican en el host, no se presumen desde la spec. |
| CEL-RF-021 | El almacenamiento/transformación multimedia es compartido entre celdas. El Compose celular no crea ni administra SeaweedFS o imgproxy. Las variantes al vuelo no se guardan como binarios celulares salvo una necesidad aprobada y documentada. |
| CEL-RF-022 | Para un VPS externo, SeaweedFS se alcanza mediante un endpoint privado configurable y imgproxy mediante una URL pública configurable. La existencia y conectividad de la red privada son prerequisitos verificables; no se presumen por el hecho de que el manifiesto genere la configuración. |
| CEL-RF-023 | En producción, cada celda reside en `/opt/<name-cell>` derivado de `cell_code` y Compose se opera como usuario no privilegiado `deploy:1000`; ningún servicio celular corre como root en el host. Los paths concretos los introduce el renderer, no `CellDeploymentSpec`. |
| CEL-RF-024 | La exportación explícita y auditada de `.env.cell` para Platform Owner usa `Cache-Control: no-store`; no persiste ni registra secretos. El operador instala el archivo con permisos `0600`, fuera del repositorio, y lo elimina/rota según OPS-001. |
| CEL-RF-025 | Región no forma parte del modelo de negocio ni del placement celular/host. El modelo neutral, el registro de host y los contratos de routing no deben exponer un atributo `region` para celda o host. Por decisión del usuario, el campo legado actual permanece temporalmente en código/BD; su retiro requiere aprobación de CEL-001, auditoría de uso y una migración compatible autorizada por separado. |
| CEL-RF-026 | `topology_type` conserva los valores compatibles `local_compose` y `remote_vps`. `local_compose` se traduce al perfil `local_development`; `remote_vps` permanece genérico y no determina si el destino es `control_plane_vps` o `external_vps`. Para generar un manifiesto, toda celda requiere `host_id` explícito y un registro de host con `deployment_profile` definido y compatible. Los registros ambiguos fallan con diagnóstico; no se remapean silenciosamente ni se migran automáticamente. |

## 4. Compatibilidad y precedencia

1. DAT-001 continúa siendo fuente para RLS, particionamiento, estado de routing por inquilino, transacciones de asignación y pool por celda; CEL-001 es fuente detallada para despliegue, host placement y el camino multimedia consumido por `tenant-app`.
2. ADM-001 conserva formatos, cuotas, comportamiento del catálogo y políticas de producto. Los detalles de conexión celular a SeaweedFS/imgproxy quedan centralizados aquí.
3. OPS-001 conserva backup/restore de SeaweedFS, manejo/rotación de secretos, monitoreo, operación del host y los runbooks. Los contratos de perfil, probes y salida Compose se referencian desde aquí.
4. Los valores públicos/persistidos `local_compose` y `remote_vps` no se eliminan en esta especificación. La nueva selección de perfil no puede reescribirlos hasta contar con un mapeo y migración compatibles.
5. CEL-001 v1.0 es la fuente canónica aprobada para despliegue, placement y multimedia celular. Su aprobación no autoriza cambios de código, migraciones, commits ni despliegues; esas tareas requieren autorización y verificaciones separadas.

## 5. Criterios de aceptación

- AC-01 — El registro conserva `client_id → cell_id`, agrega `cell_id → host_id` y resuelve el endpoint de aplicación sin FKs entre planos.
- AC-02 — `max_clients` es 100 por defecto y no se acepta una asignación que supere el límite; la ocupación física del host se calcula por separado.
- AC-03 — Se pueden generar los tres perfiles sin `latest`; desarrollo no requiere imagen publicada/GHCR y solo publica puertos en loopback; producción no usa build, bind mounts ni puertos host.
- AC-04 — Cada perfil conserva los cuatro servicios; los nombres de recursos, secretos y routers no colisionan entre dos celdas del mismo host.
- AC-05 — El renderer Compose recibe el modelo neutral y produce una salida que pasa `docker compose config` para cada perfil. El modelo neutral no contiene claves de Compose.
- AC-06 — El migrador local y de producción aplican solo migraciones celulares, directamente a PostgreSQL, una vez y antes de PgBouncer y `tenant-app`.
- AC-07 — Ninguna ruta puede saltar el handshake para activar una celda; health HTTP valida el secreto y las probes cumplen el contrato de datos/red.
- AC-08 — Una carga persiste bytes en SeaweedFS y solo metadatos/referencias en PostgreSQL; lectura desde cliente usa imgproxy firmado y no revela endpoint/credenciales S3. Una firma expirada responde 404 y no procesa el objeto.
- AC-09 — SeaweedFS permanece privado y ausente de Compose celular; imgproxy es el único servicio multimedia público.
- AC-10 — Para el perfil de Control Plane solo `tenant-app` se une a redes externas necesarias y PgBouncer/PostgreSQL no publican puertos. El perfil externo no usa redes Docker del host principal.
- AC-11 — La Etapa 1 incluye evidencia de equivalencia semántica separada de la conformidad con CEL-001/DAT-001. La Etapa 2 no empieza hasta aprobar la puerta de Etapa 1.
- AC-12 — Las pruebas documentan código de salida y resultados, no presumen existencia de redes, conectividad, restore o despliegue sin evidencia de runtime.
- AC-13 — El modelo neutral y el registro de hosts no incluyen `region`; el campo legado no participa en placement ni routing nuevo.

## 6. Etapas y puerta de salida

### Etapa 1 — Extracción neutral, sin cambio funcional

Implementar `CellDeploymentSpec`, `ComposeCellManifestRenderer` y delegar el servicio actual en el renderer. Capturar salidas anteriores y demostrar equivalencia semántica por las topologías legadas, normalizando únicamente valores dinámicos. Reportar por separado los defectos previos del baseline; equivalencia no equivale a conformidad.

La Etapa 1 queda validada solo si el modelo neutral no contiene primitivas Compose, el renderer genera y valida las salidas legadas, las pruebas existentes mantienen su resultado y no cambia el comportamiento observable.

### Etapa 2 — Perfiles y cambios funcionales

Solo después de validar Etapa 1, implementar las diferencias aprobadas de los tres perfiles, placement por host, capacity 100, conexión celular a SeaweedFS/imgproxy, health/handshake y routing efectivo. Si falla la puerta, Etapa 2 no inicia.

## 7. Evidencia inicial y requisitos externos

- Evidencia del repositorio al redactar: el generador Compose, el migrador local, la ruta health, el acceso a la base de celda y el upload SeaweedFS presentan brechas consignadas en `odd/tasks/cell-handshake-implementation.md` L11–L14.
- No se ha validado en runtime la disponibilidad de redes, conectividad al S3 privado, endpoint/credenciales de SeaweedFS desde un host celular, acceso de imgproxy a los objetos ni un despliegue real.
- La conectividad privada entre VPS y la disponibilidad de los servicios compartidos son prerequisitos externos si no están administrados por este repositorio.
- El código/esquema actual conserva un campo legado `cells.region`; CEL-RF-025 lo excluye del nuevo modelo. Retirarlo de implementación y de interfaces requiere una migración compatible posterior, fuera de esta tarea documental.

## 8. Parámetros por cerrar antes de implementación

| Tema | Estado |
|---|---|
| TTL numérico para URLs firmadas privadas de imgproxy | **Resuelto:** el usuario confirmó 15 minutos (900 segundos) para `expires`; el requisito queda en CEL-RF-019. Las imágenes públicas conservan la política existente de firma larga duración. |
| Compatibilidad de filas legadas `remote_vps` con host/profile | **Decisión resuelta:** conservar `local_compose`/`remote_vps`; asignar perfil local a `local_compose` y requerir un perfil compatible explícito para `remote_vps`. Antes de generar un manifiesto de un registro remoto existente, auditarlo y asignar host/perfil; ambiguos fallan cerrado, sin remapeo ni borrado automático. |
| Retiro del campo legado `cells.region` | **Diferido:** el nuevo modelo no lo usa; el código/BD actual lo conserva hasta aprobar CEL-001, auditar su uso en APIs/datos y autorizar una migración compatible independiente. |
| Capacidad disponible en un host | **Resuelto:** preflight manual del operador; `ready` es una declaración auditada. No se fijan umbrales CPU/RAM ni scheduler automático en esta fase. |
| Redes/credenciales/endpoints externos | Los nombres del requerimiento son configuración esperada, no evidencia de existencia. Deben verificarse por perfil antes del despliegue; VPN/red privada permanece prerequisito externo si está fuera del repositorio. |
| Build local sin Internet | **Decisión resuelta:** build y ejecución no usan Internet ni registry; dependencias/cache se precargan localmente y `cell:up` no instala online. La disponibilidad efectiva del cache queda como verificación técnica previa al uso. |

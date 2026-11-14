# SPEC-00 · Requisitos · Remediación de Persistencia Multimedia (SeaweedFS / imgproxy) y Healthcheck de PgBouncer

## 1. Identificación

| Atributo | Valor |
|---|---|
| **ID** | `SPEC-00` |
| **Nombre** | Remediación: persistencia multimedia (SeaweedFS/imgproxy) y healthcheck de PgBouncer |
| **Tipo de intervención** | `REMEDIACIÓN` |
| **Prioridad** | `P0` (Bloqueante de plataforma e infraestructura) |
| **Versión** | `1.0` |
| **Estado** | `Aprobado` |

---

## 2. Trazabilidad

- **IDs de observación cubiertos (dueño):** `PRD-09`, `INC-01`.
- **Specs previas relacionadas (intactas):** `CEL-001`, `DAT-001`, `OPS-001`, `TNT-001`.
- **Specs dependientes:** `SPEC-04` (carga de voucher Bre-B), `SPEC-05` (carga de logo comercial en onboarding/perfil), `SPEC-07` (renderizado de logo y activos de marca blanca), `SPEC-08` (galería multimedia de productos: imágenes, videos, audios y PDFs), `SPEC-11` (carga de guías de despacho en PDF/imagen).
- **Directivas vinculantes:** `.agents/AGENTS.md §3 (R-01, R-03, R-07, R-10)`, `.agents/AGENTS.md §4.12 (@t3-oss/env-nextjs)`, `.agents/AGENTS.md §4.13 (logging estructurado)`, `.agents/AGENTS.md §4.14 (excepciones y RFC 9457)`, `.agents/AGENTS.md §4.16 (compatibilidad Traefik)`, `.agents/AGENTS.md §4.18 (compilación, reinicio y healthcheck)`.

---

## 3. Problema / Situación Actual (Con Evidencia y Diagnóstico Reproducible)

### 3.1 Diagnóstico de `INC-01` (Healthcheck de `pgbouncer-cell`)

- **Evidencia observada en log (`2026-11-13 03:52 UTC` en `pgbouncer-cell`):**
  - `FATAL: database "-d" does not exist`
  - `-d/(nouser)@127.0.0.1 closing because: server login has been failing, cached error: database "-d" does not exist (server_login_retry)`
  - `-d/mocter_healthcheck@172.21.0.2:5432 new connection to server`
- **Archivos de configuración inspeccionados:**
  - `data-cell-dev/docker-compose.yml` (líneas 43–64).
  - `packages/domain/src/services/compose-cell-manifest-renderer.ts` (líneas 173 para `control_plane_vps`, 275 para `external_vps` y 372 para `local_development`).
- **Pasos y comandos de verificación reproducibles:**
  ```bash
  docker logs --tail 50 mocter-cell-01-pgbouncer-cell-1
  docker inspect --format '{{json .Config.Env}}' mocter-cell-01-pgbouncer-cell-1
  docker inspect --format '{{json .Config.Healthcheck}}' mocter-cell-01-pgbouncer-cell-1
  docker exec mocter-cell-01-pgbouncer-cell-1 env
  ```
- **Causa raíz confirmada:**
  El servicio `pgbouncer-cell` (`edoburu/pgbouncer:v1.26.1-p0`) define las variables de entorno `DB_HOST=pg-cell`, `DB_PORT=5432`, `DB_NAME=${POSTGRES_DB}`, `DB_USER=${POSTGRES_USER}` y `DATABASE_URLS="...,postgres://mocter_healthcheck:...@pg-cell:5432/*"`, pero **no** define `POSTGRES_USER` ni `POSTGRES_DB` dentro del contenedor. Sin embargo, el bloque `healthcheck.test` en los 3 perfiles de `compose-cell-manifest-renderer.ts` y en `data-cell-dev/docker-compose.yml` ejecuta:
  `pg_isready -h 127.0.0.1 -p 6432 -U $$POSTGRES_USER -d $$POSTGRES_DB`
  Al evaluarse en el shell del contenedor con ambas variables vacías, el comando expandido resulta en:
  `pg_isready -h 127.0.0.1 -p 6432 -U -d`
  `pg_isready` interpreta `-d` como el argumento de `-U` (usuario) y, al no quedar valor para `-d`, termina solicitando a PgBouncer la base de datos `"-d"`. PgBouncer intenta autenticar contra `pg-cell:5432` usando la regla comodín `/*` con el usuario `mocter_healthcheck` hacia la base de datos inexistente `"-d"`, provocando fallos continuos cada 5 segundos y estado `unhealthy`.

### 3.2 Diagnóstico de `PRD-09` (Fallo de persistencia en SeaweedFS y entrega en imgproxy)

- **Evidencia observada en UI y backend:**
  Al subir un archivo multimedia desde `/workspace/products`, la API `/api/tenant/media/upload` responde HTTP 500 con el mensaje `"Error interno al procesar y almacenar el archivo multimedia"`, originado en `S3StorageService.putObject` (`TypeError: fetch failed`).
- **Archivos de configuración y código inspeccionados:**
  - `docker-compose.yml` (líneas 121–186) y `docker-compose.prod.yml` (líneas 141–179).
  - `packages/domain/src/services/s3-storage.service.ts` (líneas 98–114).
  - `packages/domain/src/services/tenant-workspace.service.ts` (líneas 41–47).
  - `packages/domain/src/utils/env.ts` y `.env.example`.
- **Pasos y comandos de verificación reproducibles:**
  ```bash
  docker inspect --format '{{json .NetworkSettings.Networks}}' mocter-core-admin-portal-1
  docker exec mocter-core-admin-portal-1 env | grep -E "S3_|IMGPROXY_"
  curl -s "http://127.0.0.1:8888/buckets/?pretty=y"
  docker inspect --format '{{json .Config.Env}}' mocter-media-local-imgproxy-1
  ```
- **Causas raíz confirmadas (4 fallos concatenados):**
  1. **Variables `S3_*` e `IMGPROXY_*` ausentes en el entorno del contenedor `admin-portal` y lectura directa de `process.env`:** Ni `docker-compose.yml` ni `docker-compose.prod.yml` inyectan `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT` ni `IMGPROXY_PUBLIC_URL` al servicio `admin-portal`. Además, `createS3StorageFromEnv()` / `S3StorageService` en `s3-storage.service.ts` (líneas 109–113) lee `process.env` directamente (violando `.agents/AGENTS.md §4.12`) y hace fallback a `http://localhost:8333`, causando `ECONNREFUSED` dentro de la red Docker del contenedor.
  2. **Aislamiento de red Docker:** `admin-portal` solo está conectado a `default` y `chatwoot-net`, pero **no** está unido a la red donde operan `seaweedfs:8333` e `imgproxy:8080` (`media_network`).
  3. **Ausencia de inicialización idempotente del bucket `media` en SeaweedFS:** SeaweedFS arranca únicamente con `.system` y sin el bucket `media` pre-creado (`PUT /media` devuelve `NoSuchBucket` cuando `S3StorageService.putObject` intenta escribir).
  4. **Desalineación de llaves HMAC y prioridad de URL en `imgproxy`:** `IMGPROXY_DEFAULTS` en `tenant-workspace.service.ts` (líneas 41–47) tiene valores de fallback distintos a los del servicio `imgproxy` real y prioriza `IMGPROXY_BASE_URL` sobre `IMGPROXY_PUBLIC_URL`, generando firmas inválidas (HTTP 403 en `imgproxy`) o URLs no resolubles desde el navegador del cliente.
- **Análisis de relación causal (`INC-01` vs. `PRD-09`):** Ambos defectos son **100 % independientes técnicamente**: `INC-01` proviene del healthcheck de `pgbouncer-cell` sobre `pg-cell`, mientras que `PRD-09` proviene del cableado de entorno, red Docker, bucket S3 y firma HMAC hacia SeaweedFS e `imgproxy`. Sin embargo, ambos comparten prioridad `P0` para estabilizar la operación del comercio.

---

## 4. Objetivo y Valor de Negocio

Garantizar la salud continua del pooler transaccional de las celdas (`pgbouncer-cell`) sin falsos fallos ni errores de login en PostgreSQL, y restablecer de extremo a extremo el pipeline de almacenamiento y entrega optimizada de archivos multimedia (SeaweedFS S3 + imgproxy HMAC-SHA256) para desbloquear la carga de logos, catálogo de productos, vouchers Bre-B y guías de envío.

---

## 5. Alcance

### Incluye
- Corrección del comando `healthcheck` de `pgbouncer-cell` en `data-cell-dev/docker-compose.yml` y en los 3 perfiles de `compose-cell-manifest-renderer.ts` (`control_plane_vps`, `external_vps`, `local_development`) más actualización de sus *golden snapshots* de pruebas.
- Centralización tipada y validada de todas las variables `S3_*` e `IMGPROXY_*` en `env.ts` y `.env.example` (`.agents/AGENTS.md §4.12`).
- Inyección explícita de las variables de entorno y conexión a la red `media_network` para `admin-portal` (y `web-portal` cuando requiera medios) en `docker-compose.yml` y `docker-compose.prod.yml` respetando `.agents/AGENTS.md R-03` y `R-10`.
- Auto-inicialización idempotente del bucket S3 privado (`ensureBucketExists`) antes de ejecutar `putObject` en `S3StorageService`, con soporte para reintentos y manejo tipado `Result` (`.agents/AGENTS.md §4.14`).
- Corrección de firma HMAC-SHA256 y URL pública firmada en `tenant-workspace.service.ts` (`IMGPROXY_PUBLIC_URL` para navegador y verificación desde `env.ts`).
- Criterio formal de cierre del incidente y pruebas de regresión automatizadas.

### Fuera de Alcance
- Cambio de motores de almacenamiento o eliminación de SeaweedFS / imgproxy.
- Modificación de nombres de imágenes Docker, redes de Traefik o exposición de puertos de SeaweedFS en producción (`.agents/AGENTS.md R-03`, `R-10`).
- Ampliación funcional del CRUD de productos o cuotas de audio (cubierto en `SPEC-03` y `SPEC-08`).

---

## 6. Actores y Permisos

| Actor / Rol | Operación sobre Multimedia y Healthcheck | Permiso / Restricción |
|---|---|---|
| `tenancy_owner` | Subir y visualizar archivos multimedia de su comercio (logo, productos, guías, vouchers) | Permitido únicamente dentro de su `client_id` y cuotas del plan vigente. |
| `tenancy_users` (`tenant_agent`) | Visualizar medios de catálogo/pedidos y subir medios según módulo autorizado | Permitido únicamente dentro de su `client_id` asignado. |
| `platform_owner` / `platform_admin` | Auditar salud de celdas, conectividad S3/imgproxy y logs de almacenamiento | Acceso exclusivo desde `/admin/cells` y `/api/health`; sin acceso directo no auditado a binarios privados sin registro. |
| Sistema (`S3StorageService` / `CellHealthcheck`) | Verificar salud de `pgbouncer-cell`, inicializar bucket `media`, firmar URLs `imgproxy` | Ejecución automatizada servidor-a-servidor con credenciales validadas vía `@t3-oss/env-nextjs`. |

---

## 7. Modelo de Datos

Esta especificación no crea tablas nuevas; garantiza la integridad operativa de las tablas existentes:
- **Control Plane (`db-portal`):**
  - `admin.media_catalog` (`packages/domain/src/db/schemas/admin/chatwoot-media-onboarding.ts`): `id` (`uuid` PK), `content_hash` (`text`, SHA-256), `storage_pool_id` (`text`, default `'seaweedfs-main'`), `storage_key` (`text`, obligatorio), `size_bytes` (`bigint`), `media_kind` (`'image' | 'audio' | 'video' | 'pdf'`), `mime_type` (`text`), `processing_status` (`'uploaded' | 'processing' | 'ready' | 'failed' | 'external'`). Deduplicación global mediante índice único `(content_hash, storage_pool_id)`.
- **Data Plane Celular (`pg-cell-XX`, RLS estricto por `app.current_client_id`):**
  - `admin.client_media` (`packages/domain/src/db/schemas/tenant/tenancy-catalog.ts`): PK compuesta `(client_id, id)`, única por `(client_id, media_id)` para contabilizar cuota real del comercio.
  - `admin.client_usage`: PK compuesta `(client_id, id)`, contabiliza `dimension = 'storage_bytes'` de forma atómica.
  - `admin.product_media`: PK compuesta `(client_id, id)`, vincula producto y medio del inquilino.
- **Estrategia de eliminación:** La desvinculación en celda elimina la relación en `admin.product_media` y `admin.client_media` recalculando `client_usage.storage_bytes`; el objeto físico en SeaweedFS y `admin.media_catalog` solo se purga por tarea de recolección de basura cuando no existan referencias activas en ninguna celda (`reference_count = 0`), justificando la deduplicación segura sin pérdida de archivos compartidos o clonados.

---

## 8. Reglas de Negocio

- **RN-SPEC-00-01 (Healthcheck parametrizado con variables reales de PgBouncer):** Todo manifiesto generado o estático que ejecute `edoburu/pgbouncer` debe usar `$$DB_USER` y `$$DB_NAME` (variables nativas del contenedor) en el comando `pg_isready`, prohibiendo `$$POSTGRES_USER` y `$$POSTGRES_DB` en el servicio `pgbouncer-cell`.
- **RN-SPEC-00-02 (Independencia de fallos y cero tolerancia a `database "-d"`):** El contenedor `pgbouncer-cell` debe responder `accepting connections` y registrar cero ocurrencias de `FATAL: database "-d" does not exist` en PostgreSQL durante al menos 60 segundos de operación continua.
- **RN-SPEC-00-03 (Configuración centralizada y sin `process.env` directo):** `S3StorageService` y el firmador de `imgproxy` deben recibir sus parámetros exclusivamente desde el módulo tipado `env.ts` (`@t3-oss/env-nextjs` / `@t3-oss/env-core`), fallando en el arranque de la aplicación si faltan credenciales requeridas en lugar de usar fallbacks locales inseguros.
- **RN-SPEC-00-04 (Conectividad interna S3 e inicialización idempotente del bucket):** Antes de persistir un archivo, `S3StorageService` debe garantizar de forma idempotente y con caché en memoria la existencia del bucket configurado (`HEAD /{bucket}` → si HTTP 404, ejecutar `PUT /{bucket}` firmado con SigV4).
- **RN-SPEC-00-05 (Separación de origen interno S3 vs. URL pública imgproxy):** La subida de binarios se realiza por red interna (`S3_ENDPOINT=http://seaweedfs:8333`), mientras que las URLs firmadas devueltas al navegador usan `IMGPROXY_PUBLIC_URL` (compatible con desarrollo local y `https://media.mocter.co` en producción bajo Traefik, sin puertos hardcodeados en código).
- **RN-SPEC-00-06 (Integridad y validación previa a escritura S3):** Todo archivo recibido en `/api/tenant/media/upload` se valida por **magic bytes reales** y tamaño máximo antes de invocar a SeaweedFS; nunca se incrementa `client_usage` ni se registra `client_media` si `putObject` falla.

---

## 9. Contratos de Interfaz

### 9.1 `POST /api/tenant/media/upload` (Existente — Remediado)
- **Autenticación:** Cookie de sesión válida (`mocter_sid` / `__Host-mocter_sid`) con contexto `tenant` activo (`client_id`).
- **Request:** `multipart/form-data` con `file` (binario), `productId` (UUID opcional si es logo/voucher/guía) y `purpose` (`'product' | 'logo' | 'guide' | 'voucher'`, default `'product'`).
- **Response `201 Created`:**
  ```json
  {
    "ok": true,
    "data": {
      "mediaId": "019...",
      "storageKey": "products/2026/11/...",
      "mediaKind": "image",
      "sizeBytes": 184320,
      "signedUrl": "https://media.mocter.co/<sig>/rs:fit:800:800/plain/s3://media/products/2026/11/..."
    }
  }
  ```
- **Errores (RFC 9457 `application/problem+json`):**
  - `400 Bad Request`: Magic bytes inválidos o extensión no admitida.
  - `401 Unauthorized` / `403 Forbidden`: Sesión ausente o sin permisos de inquilino.
  - `409 Conflict` / `422 Unprocessable Entity`: Cuota del plan (`storage_bytes` o cantidad de archivos) superada.
  - `503 Service Unavailable`: SeaweedFS no alcanzable tras reintentos; **sin revelar detalles internos de host/puerto/llaves al cliente** (correlación registrada por `requestId` en logs estructurados).

### 9.2 `GET /api/health` (Extensión de verificación)
- Incluye verificación no bloqueante de conectividad hacia el plano de medios (`mediaStorage: "ok" | "degraded"`) sin exponer secretos.

---

## 10. Especificación de UI/UX

- Si la subida falla por indisponibilidad temporal del almacenamiento, el mensaje visible para el inquilino debe ser claro y libre de jerga técnica: *"No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos."* (prohibido mencionar `SeaweedFS`, `imgproxy`, `S3`, `bucket` o `ECONNREFUSED`).
- Las vistas que renderizan miniaturas y logotipos deben mostrar un estado de carga (*skeleton*) y un fallback visual limpio cuando aún no exista imagen asignada.

---

## 11. Criterios de AAceptación en Gherkin (Español)

### Escenarios satisfactorios
```gherkin
Escenario: Subida exitosa de imagen a SeaweedFS y entrega firmada con imgproxy
  Dado que un propietario de comercio está autenticado y tiene cuota de almacenamiento disponible
  Y los servicios SeaweedFS e imgproxy están conectados en la red de medios con el bucket "media" inicializado
  Cuando sube una imagen PNG válida desde el catálogo de productos
  Entonces el sistema almacena el objeto en SeaweedFS bajo la clave generada
  Y registra el archivo en media_catalog, client_media y product_media actualizando client_usage
  Y responde HTTP 201 con una URL firmada por HMAC-SHA256 que devuelve HTTP 200 al solicitarla desde imgproxy
```

```gherkin
Escenario: Healthcheck limpio y continuo en pgbouncer-cell
  Dado que la celda local o productiva está desplegada con el manifiesto corregido
  Cuando Docker ejecuta el healthcheck de pgbouncer-cell con DB_USER y DB_NAME durante al menos 60 segundos
  Entonces el contenedor pgbouncer-cell reporta estado healthy de forma estable
  Y los registros de pgbouncer-cell y pg-cell muestran cero errores de tipo database "-d" does not exist
```

### Validaciones de entrada
```gherkin
Escenario: Rechazo de archivo con extensión falsificada mediante validación de magic bytes
  Dado que un usuario autenticado intenta subir un archivo renombrado a ".png" cuyo contenido real es texto plano o script
  Cuando envía la solicitud a POST /api/tenant/media/upload
  Entonces el sistema rechaza el archivo antes de contactar a SeaweedFS con código HTTP 400
  Y no incrementa el contador client_usage de almacenamiento del inquilino
```

### Errores de regla de negocio
```gherkin
Escenario: No consumo de cuota cuando SeaweedFS no puede completar la escritura
  Dado que ocurre un corte temporal de conectividad hacia el servicio de almacenamiento S3 durante una carga
  Cuando el cliente intenta subir una imagen válida para un producto
  Entonces el servicio realiza los reintentos configurados y al persistir el fallo retorna HTTP 503 con formato Problem Details
  Y la transacción celular no registra client_media ni incrementa storage_bytes en client_usage
```

### Seguridad y autorización
```gherkin
Escenario: Aislamiento de medios entre inquilinos y ausencia de fugas de credenciales
  Dado que el comercio A sube una imagen asociada a un producto de su catálogo
  Cuando un usuario autenticado del comercio B intenta vincular o eliminar el media_id mediante rutas de producto del comercio B sin pertenencia ni clonación autorizada
  Entonces el sistema bloquea la operación por aislamiento RLS con app.current_client_id
  Y ninguna respuesta HTTP ni mensaje de error expone credenciales S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY ni llaves HMAC de imgproxy
```

### Escenarios de borde
```gherkin
Escenario: Creación automática e idempotente del bucket "media" en SeaweedFS recién inicializado
  Dado que SeaweedFS inicia con almacenamiento limpio y sin el bucket "media" creado previamente
  Cuando el primer inquilino ejecuta una subida de archivo multimedia
  Entonces S3StorageService detecta que el bucket "media" no existe vía HEAD y ejecuta PUT para crearlo automáticamente
  Y completa el almacenamiento del archivo del inquilino en el mismo flujo sin intervención manual
```

---

## 12. Requisitos No Funcionales

- **Seguridad:** Las credenciales `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `IMGPROXY_KEY` e `IMGPROXY_SALT` solo existen en variables de entorno validadas en servidor, nunca se exponen en `NEXT_PUBLIC_*` ni en logs JSON.
- **Observabilidad:** Cada operación de subida S3 y error de conectividad registra evento estructurado en Pino con `requestId`, `clientId`, `mediaKind`, `sizeBytes` y latencia en ms (`.agents/AGENTS.md §4.13`).
- **Rendimiento:** `ensureBucketExists` cachea la confirmación por instancia de proceso para evitar peticiones `HEAD` redundantes en cada `putObject`; timeout acotado de 10s por intento S3 con backoff exponencial (máx. 3 intentos).
- **Auditoría:** Registro en `media_catalog` con hash SHA-256 (`content_hash`) y marca temporal de auditoría.

---

## 13. Dependencias y Riesgos

- **Dependencias:** Ninguna spec bloqueante (SPEC-00 es raíz P0).
- **Riesgos y Mitigación:**
  - *Riesgo:* Desincronización de secretos entre el stack de medios externo (`mocter-media-local`) y `mocter-core` en despliegues locales o VPS. *Mitigación:* Documentar en `.env.example` y verificar variables en el arranque vía `env.ts`.
  - *Riesgo:* Regeneración de manifiestos de celdas ya existentes. *Mitigación:* Actualizar `compose-cell-manifest-renderer.ts` y documentar la regeneración/aplicación del `docker-compose.yml` en `cell-01`.

---

## 14. Definition of Done (DoD)

- [ ] `data-cell-dev/docker-compose.yml` y los 3 perfiles de `compose-cell-manifest-renderer.ts` actualizados con `$$DB_USER` y `$$DB_NAME` en el healthcheck de `pgbouncer-cell`.
- [ ] `env.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `s3-storage.service.ts` y `tenant-workspace.service.ts` actualizados y alineados con `.agents/AGENTS.md §4.12`.
- [ ] **Prueba de regresión y criterio de cierre del incidente cumplidos:**
  1. `pnpm test` pasando incluyendo `compose-cell-manifest-renderer.test.ts` y `s3-storage.service.test.ts` (con caso de auto-creación de bucket e HMAC).
  2. `docker compose config -q` válido en local y producción (`TAG=test docker compose -f docker-compose.prod.yml config -q`).
  3. Verificación en vivo tras recompilación/reinicio (`.agents/AGENTS.md §4.18`): subida de archivo real por `/api/tenant/media/upload` -> objeto presente en SeaweedFS -> URL de `imgproxy` respondiendo HTTP 200 -> `mocter-cell-01-pgbouncer-cell-1` en estado `healthy` con 0 líneas `database "-d" does not exist` durante >= 60 segundos.

---

## 15. Propuestas a Validar (PV)

- No existen propuestas abiertas; todas las causas raíz y criterios técnicos fueron verificados directamente en la infraestructura y código fuente del repositorio.


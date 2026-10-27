# Servicios de producción · inventario observado

> **Fuente:** `docker inspect` ejecutado en el host de producción el **2026-10-27**.
> **Alcance:** estado observado de los servicios ya desplegados. No es una guía de despliegue ni reemplaza las specs.
> **Secretos:** las credenciales, claves HMAC y contraseñas están redactadas. No se documentan valores reales.

## 1. Resumen

| Stack | Proyecto Compose | Ruta del compose | Servicios observados | Ingress público |
|---|---|---|---|---|
| Medios | `mocter-media` | `/opt/mocter-media/docker-compose.prod.yaml` | `seaweedfs`, `imgproxy` | `media.mocter.co` |
| Chatwoot | `mocter-chatwoot` | `/opt/mocter-chatwoot/docker-compose.prod.yaml` | `rails` observado; `sidekiq`, `pg-chatwoot` y `redis-chatwoot` declarados en el compose | `chatapp.mocter.co` |

Los contenedores inspeccionados **no publican puertos en el host**. El tráfico público entra exclusivamente por Traefik.

**Capacidad del host:** 4 vCPU, 16 GB de RAM, sin swap; ~8 GB usados y ~7,7 GB disponibles al momento de la observación. Los límites de medios se fijaron sobre esa capacidad.

## 2. SeaweedFS

| Atributo | Valor observado |
|---|---|
| Contenedor | `mocter-media-seaweedfs-1` |
| Imagen | `chrislusf/seaweedfs:4.51` |
| Digest del manifiesto | `sha256:3a522c379599e163433a636e75022630848b63a74f08ea37bf06f8d776e9a707` |
| Estado | `running`, `healthy`, sin OOM, `RestartCount=0` |
| Comando | `weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json -master.telemetry=false` |
| Volumen | `mocter-media_seaweedfs-data` → `/data` |
| Configuración S3 | bind read-only `/opt/mocter-media/seaweedfs/s3.json` → `/etc/seaweedfs/s3.json` |
| Redes | `media_network` (172.16.5.2, alias `seaweedfs`) y `mocter-admin-prod_backend` (172.16.3.4, alias `seaweedfs`) |
| Puertos publicados | Ninguno |
| Healthcheck | `wget -q -O /dev/null http://127.0.0.1:9333/cluster/status`; intervalo 15 s, timeout 5 s, start 30 s, 10 reintentos |
| Reinicio | `unless-stopped` |
| Logs | `json-file`, 3 archivos × 10 MB |
| Límites de recursos | 1.0 CPU · 1.5 GB RAM; uso actual ~86 MiB |
| Bucket | `media` (confirmado por `IMGPROXY_S3_ALLOWED_BUCKETS=media`) |

**Uso desde código:** el S3 interno está en `http://seaweedfs:8333`, con path-style (`forcePathStyle: true`) y región `us-east-1`. Es alcanzable desde `media_network` y desde `mocter-admin-prod_backend`. No tiene ruta de Traefik.

**Bucket y credenciales:** el bucket es `media`; las credenciales de mínimo privilegio están dentro de `s3.json` y no se documentan. El código debe leer el nombre del bucket desde configuración, no hardcodearlo.

**Observación:** el healthcheck valida el master en `:9333`, no el gateway S3 en `:8333`. El gateway tiene su propio smoke de deploy: `GET http://127.0.0.1:8333/` debe devolver **403** sin credenciales; cualquier otro resultado falla el despliegue.

## 3. imgproxy

| Atributo | Valor observado |
|---|---|
| Contenedor | `mocter-media-imgproxy-1` |
| Imagen | `ghcr.io/imgproxy/imgproxy:v4.0.20` |
| Digest del manifiesto | `sha256:33ee7afd862c4bdb96f84e25488d217aefc818c8a7fff43ede6fef66bd764b4c` |
| Estado | `running`, `healthy`, sin OOM, `RestartCount=0` |
| Redes | `media_network` (172.16.5.3, alias `imgproxy`) y `traefik_network` (172.20.0.12, alias `imgproxy`) |
| Puertos publicados | Ninguno |
| Volúmenes | Ninguno; es stateless |
| Healthcheck | `imgproxy health`; intervalo 15 s, timeout 5 s, start 10 s, 5 reintentos |
| Reinicio | `unless-stopped` |
| Logs | `json-file`, 3 archivos × 10 MB |
| Límites de recursos | 2.0 CPU · 1.5 GB RAM; uso actual ~19 MiB |

**Variables observadas (valores sensibles redactados):**

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: presentes.
- `IMGPROXY_KEY`, `IMGPROXY_SALT`: presentes.
- `IMGPROXY_USE_S3=true`.
- `IMGPROXY_S3_ENDPOINT=http://seaweedfs:8333`.
- `IMGPROXY_S3_ENDPOINT_USE_PATH_STYLE=true`.
- `IMGPROXY_S3_REGION=us-east-1`.
- `IMGPROXY_BASE_URL=https://media.mocter.co`.
- `IMGPROXY_S3_ALLOWED_BUCKETS=media`.
- `IMGPROXY_MAX_SRC_FILE_SIZE=104857600` (100 MB).
- `IMGPROXY_MAX_RESULT_DIMENSION=4096`.
- `IMGPROXY_REQUESTS_QUEUE_SIZE=100`; al llenarse, imgproxy responde `429`.
- `IMGPROXY_MAX_ANIMATION_FRAMES=1`; una imagen animada se entrega como primer frame.
- `AWS_LWA_READINESS_CHECK_PATH=/health`, `AWS_LWA_INVOKE_MODE=response_stream`, `AWS_LWA_ASYNC_INIT=true` (provienen de la imagen base; no cambian el contrato en Docker).
- `IMGPROXY_MALLOC=malloc`, `VIPS_VECTOR=167772160`, `MALLOC_ARENA_MAX=2`, `VIPS_WARNING=0`.

**Etiquetas de Traefik:** router `media`, host `media.mocter.co`, entrypoint `websecure`, resolver `mytlschallenge`, service port `8080`.

**No se observaron explícitamente:** `IMGPROXY_ALLOWED_PROCESSING_OPTIONS`, `IMGPROXY_WORKERS` ni `IMGPROXY_MAX_SRC_RESOLUTION`. Aplican los defaults de la imagen; el backend solo debe firmar opciones permitidas y el hardening de workers/allowlist sigue pendiente.

**Paridad prod/local:** estas variables se aplican también al compose local; no debe haber deriva entre entornos.

**Nota de producto:** el límite de ingreso de imágenes sigue siendo 10 MB; `IMGPROXY_MAX_SRC_FILE_SIZE=100 MB` es un techo del servicio, no una ampliación del límite de subida. Con `IMGPROXY_MAX_ANIMATION_FRAMES=1`, una animación se sirve como primer frame; si se necesita animación, hay que subir el límite y validar costo/CPU.

## 4. Chatwoot (rails)

| Atributo | Valor observado |
|---|---|
| Contenedor | `mocter-chatwoot-rails-1` |
| Imagen | `chatwoot/chatwoot:v4.19.1` |
| Digest del manifiesto | `sha256:de91ebbe04cef408e88697ccaee44cb6f33ea87330c826880790c0eec656c610` |
| Estado | `running`, `healthy`, sin OOM, `RestartCount=0` |
| Comando | `docker/entrypoints/rails.sh bundle exec rails s -p 3000 -b 0.0.0.0` |
| Volumen | `mocter-chatwoot_storage-chatwoot` → `/app/storage` |
| Redes | `mocter-chatwoot_chatwoot_network` (172.16.4.4) y `traefik_network` (172.20.0.3) |
| Puertos publicados | Ninguno |
| Healthcheck | `GET http://127.0.0.1:3000/health`; intervalo 15 s, timeout 5 s, start 60 s, 10 reintentos |
| Reinicio | `always` |
| Logs | `json-file`, 3 archivos × 10 MB |
| Límites de recursos | Sin límites explícitos (decisión vigente para Chatwoot) |

**Variables relevantes observadas:**

- `RAILS_ENV=production`, `NODE_ENV=production`, `INSTALLATION_ENV=docker`.
- `FRONTEND_URL=https://chatapp.mocter.co`, `CHATWOOT_DOMAIN=chatapp.mocter.co`.
- `POSTGRES_HOST=pg-chatwoot`, `POSTGRES_DATABASE=chatwoot`, `POSTGRES_USERNAME=chatwoot`, `POSTGRES_PORT=5432`.
- `REDIS_URL=redis://redis-chatwoot:6379`.
- `CHATWOOT_VERSION=v4.19.1`, `POSTGRES_IMAGE_TAG=pg18`, `REDIS_IMAGE_TAG=8.8.3-alpine`.
- `CW_EDITION=ee`.
- `POSTGRES_HOST_AUTH_METHOD=trust`.
- `REDIS_PASSWORD=` (vacío en el entorno de `rails`).

**Almacenamiento actual:** Chatwoot usa **volumen local** (`mocter-chatwoot_storage-chatwoot`). No hay variables `ACTIVE_STORAGE_SERVICE`, `STORAGE_*` ni bucket S3 observadas. Por lo tanto, en producción **Chatwoot no está usando SeaweedFS** para adjuntos hoy.

Chatwoot soporta ActiveStorage sobre S3-compatible, pero esa capacidad **no está activa** en este despliegue. Si se migra, debe usar un bucket separado (por ejemplo `chatwoot-attachments`), credenciales propias y la red interna de SeaweedFS; no entra en `media_catalog` ni en la cuota de producto. Validar CORS y la entrega a canales: hay casos conocidos de WhatsApp Cloud API que no aceptan URLs S3 firmadas.

**No inspeccionados:** `sidekiq`, `pg-chatwoot` y `redis-chatwoot` no forman parte de este `docker inspect`; el compose los declara. No se afirma su estado de salud ni su configuración efectiva.

## 5. Smoke de despliegue del gateway S3

`deploy/vps-deploy.sh` valida que el gateway S3 no quede anónimo:

```bash
S3_STATUS="$(compose exec -T seaweedfs curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8333/)"
# debe ser 403 sin credenciales; si no, el deploy falla con mensaje claro
```

- `403`: correcto; el gateway está cerrado sin credenciales.
- `200`: el bucket/gateway quedó público; el deploy debe fallar.
- `000` o timeout: el gateway no responde; el deploy debe fallar.

El smoke se ejecuta dentro del contenedor de SeaweedFS, no desde el host, y no requiere credenciales.

## 6. Topología de redes

```text
traefik_network (ingress público)
  ├─ mocter-chatwoot-rails-1 :3000  →  chatapp.mocter.co
  └─ mocter-media-imgproxy-1 :8080  →  media.mocter.co

media_network (interno de medios)
  ├─ mocter-media-seaweedfs-1 :8333
  └─ mocter-media-imgproxy-1

mocter-admin-prod_backend (interno de la app)
  └─ mocter-media-seaweedfs-1 :8333

mocter-chatwoot_chatwoot_network (interno de Chatwoot)
  └─ mocter-chatwoot-rails-1 (y los servicios declarados en su compose)
```

**Reglas que se desprenden:**

- SeaweedFS **no** está en `traefik_network`; no recibe tráfico del navegador.
- La app accede a S3 por `mocter-admin-prod_backend` o `media_network`, no por Traefik.
- imgproxy es el único servicio de medios con ruta pública.
- Chatwoot rails está en `traefik_network` solo para el ingress de `chatapp.mocter.co`.
- Chatwoot y la app no comparten una red interna; se hablan por API HTTPS.

## 7. Contrato de integración para código

### Subida y lectura de multimedia de producto

1. El navegador sube al backend de Mocter, no a SeaweedFS.
2. El backend valida el archivo y lo escribe por S3 en `http://seaweedfs:8333`.
3. El backend registra `media_catalog` y el vínculo del producto.
4. La lectura pública se hace por `https://media.mocter.co/<firma>/...`.
5. El navegador nunca recibe `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `IMGPROXY_KEY` ni `IMGPROXY_SALT`.
6. El bucket es `media`; el nombre se lee de configuración y no debe quedar hardcodeado en varios lugares.

### Firma de imgproxy

- Algoritmo: HMAC-SHA256 con el par key/salt de la plataforma.
- La firma cubre el path posterior a la firma, incluidas las opciones, `plain/`, la fuente S3 y la extensión de salida.
- La fuente debe ser `s3://media/<key>`; `IMGPROXY_S3_ALLOWED_BUCKETS=media` impide firmar otro bucket.
- `expires` es una opción firmada; una URL vencida responde 404.
- No se deben firmar fuentes HTTP(S) arbitrarias ni opciones fuera de la allowlist que defina la plataforma.

### Chatwoot

- Base API: `https://chatapp.mocter.co`.
- La integración es por API/SSO/webhooks; no se accede a la base PostgreSQL de Chatwoot.
- Los adjuntos de conversación **no** están en `media_catalog` y no consumen cuota de producto.
- En el estado actual, los adjuntos están en el volumen local de Chatwoot. No asumir que están en SeaweedFS.
- Si se activa ActiveStorage S3-compatible: bucket separado, credenciales separadas, `rails` y `sidekiq` en la red interna de SeaweedFS, y validación de CORS/URLs de canal.

## 8. Riesgos y verificaciones pendientes

| Tema | Estado observado | Acción recomendada |
|---|---|---|
| Adjuntos de Chatwoot | Volumen local `mocter-chatwoot_storage-chatwoot`; el `pg_dump` no los cubre | Incluirlo en el backup o migrar a S3-compatible con bucket propio |
| `POSTGRES_HOST_AUTH_METHOD` | `trust` en producción | Verificar; preferir password y red interna estricta |
| Redis de Chatwoot | `REDIS_PASSWORD` vacío en `rails` y URL sin auth | Verificar la configuración efectiva de Redis |
| `CW_EDITION` | `ee` observado | Confirmar licenciamiento; no usar capacidades enterprise |
| imgproxy | Bucket, tamaño de origen, dimensión, cola y frames definidos; sin allowlist de opciones, workers ni límite de resolución de origen observados | Completar hardening y validar en staging |
| SeaweedFS | Healthcheck apunta al master `:9333`, no al S3 `:8333` | Agregar healthcheck del gateway S3 |
| Bucket S3 | `media`, confirmado por `IMGPROXY_S3_ALLOWED_BUCKETS`; credenciales dentro de `s3.json` | Mantener el bucket y las credenciales fuera del código |
| Límites de recursos | imgproxy 2 CPU / 1.5 GB; SeaweedFS 1 CPU / 1.5 GB; Chatwoot sin límites | Medir y ajustar si el consumo o la latencia lo justifican |
| Digests | Tags fijados, pero no en formato `@sha256` | Evaluar pin por digest para producción |

## 9. Referencias

- [ADM-001 · diseño §11.6](../specs/adm-001-mocter-admin/design.md)
- [DAT-001 · diseño §2](../specs/dat-001-arquitectura-datos-multiinquilino/design.md)
- [OPS-001 · diseño §7.8 y §9](../specs/ops-001-operacion-continuidad-observabilidad/design.md)
- [CHW-001 · inventario de Chatwoot](chatwoot/README.md)

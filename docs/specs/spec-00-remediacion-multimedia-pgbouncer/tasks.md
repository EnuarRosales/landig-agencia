# SPEC-00 · Tareas de Implementación

> Ejecutar estrictamente en orden. Marcar `[x]` únicamente cuando la verificación de la tarea haya pasado.

## Tareas

- [x] **T-01 · Actualizar healthcheck de `pgbouncer-cell` en manifiestos y compose local (`INC-01`)**
  - **Archivos:** `packages/domain/src/services/compose-cell-manifest-renderer.ts` (líneas 173, 275, 372), `data-cell-dev/docker-compose.yml` (línea 60) y fixtures en `packages/domain/src/services/__fixtures__/cell-manifest/*.golden.json`.
  - **Acción:** Cambiar `$$POSTGRES_USER` y `$$POSTGRES_DB` por `$$DB_USER` y `$$DB_NAME` en el comando `pg_isready` de `pgbouncer-cell`.
  - **Verificación:** `pnpm --filter @mocter/domain test compose-cell-manifest-renderer` y `docker compose -f data-cell-dev/docker-compose.yml config -q`.

- [x] **T-02 · Centralizar variables `S3_*` e `IMGPROXY_*` en `env.ts` y `.env.example` (`PRD-09`)**
  - **Archivos:** `packages/domain/src/utils/env.ts`, `apps/admin/env.ts`, `.env.example`.
  - **Acción:** Registrar y documentar `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT`, `IMGPROXY_PUBLIC_URL` con validación Zod estricta.
  - **Verificación:** `pnpm --filter @mocter/domain test env`.

- [x] **T-03 · Conectar `admin-portal` a `media_network` e inyectar variables en Docker Compose (`PRD-09`)**
  - **Archivos:** `docker-compose.yml`, `docker-compose.prod.yml`.
  - **Acción:** Agregar red externa `media_network` a `admin-portal` e inyectar las variables `S3_*` e `IMGPROXY_*` sin valores secretos fijos.
  - **Verificación:** `docker compose config -q` y `TAG=test docker compose -f docker-compose.prod.yml config -q`.

- [x] **T-04 · Implementar `ensureBucketExists` y eliminar `process.env` directo en `S3StorageService` (`PRD-09`)**
  - **Archivos:** `packages/domain/src/services/s3-storage.service.ts`, `packages/domain/src/services/s3-storage.service.test.ts`.
  - **Acción:** Consumir configuración desde `env.ts`, implementar `ensureBucketExists()` con caché en memoria antes de `putObject`, y añadir pruebas unitarias para creación automática del bucket ante HTTP 404.
  - **Verificación:** `pnpm --filter @mocter/domain test s3-storage.service`.

- [x] **T-05 · Corregir firma HMAC y URL pública en `IMGPROXY_DEFAULTS` (`PRD-09`)**
  - **Archivos:** `packages/domain/src/services/tenant-workspace.service.ts`, `packages/domain/src/services/tenant-workspace.service.test.ts`.
  - **Acción:** Tomar `IMGPROXY_KEY`, `IMGPROXY_SALT` e `IMGPROXY_PUBLIC_URL` desde `env.ts` sin fallbacks divergentes.
  - **Verificación:** `pnpm --filter @mocter/domain test tenant-workspace.service`.

- [x] **T-06 · Verificación integral en caliente y cierre del incidente (Protocolo `AGENTS.md §4.18`)**
  - **Acción:** Compilar `@mocter/domain` y `@mocter/admin`, reiniciar `mocter-cell-01-pgbouncer-cell-1` y `mocter-core-admin-portal-1`, validar `/api/health` con HTTP 200, subir una imagen en `/workspace/products`, comprobar su renderizado con `imgproxy` (HTTP 200) y confirmar en `docker logs mocter-cell-01-pgbouncer-cell-1` durante 60s cero errores `database "-d" does not exist`.
  - **Verificación:** `pnpm lint` y `pnpm test` completos en verde, más evidencia de logs limpios y HTTP 200.

- [ ] **T-07 · [HUMANO] Verificar sincronización de secretos `.env` en el servidor VPS de producción**
  - **Acción:** Confirmar antes del próximo release que las variables `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT` e `IMGPROXY_PUBLIC_URL=https://media.mocter.co` existen en el entorno productivo del VPS.


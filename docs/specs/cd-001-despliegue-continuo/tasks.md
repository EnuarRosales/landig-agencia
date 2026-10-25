# CD-001 · Tareas · Despliegue continuo de Mocter

| Atributo | Valor |
|---|---|
| ID | CD-001 |
| Versión | 1.1 |
| Requisitos | [`requirements.md`](requirements.md) |
| Diseño | [`design.md`](design.md) |
| Rama base acordada | `feature/mocter-nextjs-migration` |

---

## Fase 0 · Descubrimiento y diagnóstico
- [x] **T-01 · Verificar estructura del monorepo**
  - Paquetes verificados: `@mocter/web` y `@mocter/domain`.
- [x] **T-02 · Verificar `packageManager` y scripts raíz**
  - `pnpm@12.14.0` detectado; scripts ajustados en raíz.
- [x] **T-03 · Verificar driver y dependencias de Drizzle**
  - `@mocter/domain` utiliza `postgres` (`postgres-js`).
- [x] **T-04 · Verificar versión de pnpm para `pnpm deploy`**
  - pnpm 12 requiere `--legacy` (`PNPM_DEPLOY_FLAGS="--legacy"`).
- [x] **T-05 · Verificar configuración y migraciones de Drizzle**
  - Snapshot versionado en `packages/domain/drizzle`.
- [x] **T-06 · Inventario de workflows y `.dockerignore`**
  - Workflows y `.dockerignore` analizados.
- [x] **T-07 · Verificar ruta raíz de la app**
  - Landing accesible públicamente sin autenticación.

---

## Fase 1 · Paquete de dominio
- [x] **T-10 · Ajustar dependencias de `@mocter/domain`**
  - Dependencias confirmadas con `postgres` y `drizzle-orm`.
- [x] **T-11 · Agregar scripts `db:*`**
  - `db:generate`, `db:migrate`, `db:check`, `db:push` configurados.
- [x] **T-12 · Crear `packages/domain/scripts/migrate.mjs`**
  - Implementado con driver `postgres-js` (Variante B) y sintaxis validada.

---

## Fase 2 · Imagen Docker
- [x] **T-20 · Actualizar `Dockerfile`**
  - `NODE_ENV=production` en build; `pnpm deploy` con `--legacy`; migrador en `/app/migrator`.
- [x] **T-21 · Crear o fusionar `.dockerignore`**
  - No excluye `packages/domain/drizzle` ni `packages/domain/scripts`.
- [x] **T-22 · Validar imagen localmente**
  - Cumplida en el primer release: la imagen construyó y se publicó en GHCR.
- [x] **T-23 · Validar migrador contra Postgres efímero**
  - Cumplida en el primer release: el migrador corrió contra la base del entorno.

---

## Fase 3 · Compose
- [x] **T-30 · Estandarizar `docker-compose.prod.yml`**
  - Sin puertos expuestos en el host; servicio `migrate`; labels Traefik.
- [x] **T-31 · Estandarizar `docker-compose.test.yml`**
  - Estructura análoga para staging con `APP_DOMAIN`.
- [x] **T-32 · Validar sintaxis de compose**
  - Validado con `docker compose config -q` para prod y test.

---

## Fase 4 · Workflows de CI/CD
- [x] **T-40 · Estandarizar `.github/workflows/ci.yml`**
  - Calidad de código, `drizzle-kit check` y verificación de no cambios no versionados.
- [x] **T-41 · Estandarizar `.github/workflows/cd.yml`**
  - Reutilización de CI, `verify-tag`, build-and-push GHCR, verificación interna del migrador.
- [x] **T-42 · Estandarizar `.github/workflows/deploy.yml`**
  - Despliegue SSH parametrizado con verificación de imagen y healthcheck.
- [x] **T-44 · Validar workflows YAML**
  - Estructura y sintaxis verificadas.

---

## Fase 5 · Servidor (Artefactos versionados)
- [x] **T-50 · Crear `deploy/server/deploy.sh`**
  - Permiso ejecutable en git y sintaxis validada con bash.
- [x] **T-51 · Crear plantillas de configuración (`deploy.conf.example`, `env.prod.example`, `env.test.example`)**
  - Modelos parametrizados sin credenciales quemadas.

---

## Fase 6 · Documentación operativa
- [x] **T-60 · Crear `docs/deployment.md`**
  - Guía paso a paso, baseline de Drizzle y runbooks de rollback.
- [x] **T-61 · Actualizar índice en `AGENTS.md`**
  - Índices sincronizados para MIG-001 y CD-001.

---

## Fase 7 · Entrega y verificación integral
- [x] **T-70 · Ejecutar verificaciones del proyecto**
  - Cumplida en el primer release: CI, build y verificación de la imagen pasaron.
- [x] **T-71 · Consolidar commits convencionales**
  - Cumplida en el primer release: la versión desplegada quedó consolidada con tag.

---

## Fase 8 · Tareas [HUMANO] (pendientes en el entorno de despliegue)
| ID | Tarea |
|---|---|
| H-1 | Configurar Workflow permissions en *Read repository contents*. |
| H-2 | Configurar variable de repositorio `STAGING_ENABLED=false`. |
| H-3 | Crear environment `production` en GitHub con aprobación obligatoria. |
| H-4 | Cargar secretos `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_KNOWN_HOSTS` en environment `production`. |
| H-5 | Cargar variable `APP_URL=https://mocter.co` en environment `production`. |
| H-6 | Crear environment `staging` en GitHub. |
| H-7 | Configurar DNS de `mocter.co` y `www.mocter.co` apuntando a la IP del VPS. |
| H-8 | Aprovisionar en el VPS usuario `deploy`, `/opt/mocter-admin/`, llave SSH restringida y `.env`. |
| H-9 | Tras el primer push a `develop`, cambiar visibilidad del paquete `mocter-web` en GitHub a **Public** (o configurar `GHCR_READ_TOKEN` en `deploy.conf`). |

---

## Cierre

- **2026-10-24:** primer release desplegado satisfactoriamente. CD-001 queda cerrada: la imagen se construyó y publicó, el migrador corrió contra la base, el despliegue por SSH completó y el healthcheck pasó.
- T-22, T-23, T-70 y T-71 quedan cumplidas por el release. Las tareas humanas de producción (H-1 a H-5, H-7 a H-9) quedaron configuradas; H-6 (staging) sigue diferida por `STAGING_ENABLED=false`.

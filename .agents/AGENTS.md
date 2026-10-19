# AGENTS.md · Constitución del proyecto Mocter

> Reglas permanentes para cualquier agente de IA (Claude Code, OpenCode, Antigravity u otro)
> que trabaje en este repositorio. Prevalecen sobre cualquier instrucción de una especificación
> individual. Si una tarea exige violar una regla, **detente y reporta**.

## 1. Contexto del proyecto

| Elemento | Valor |
|---|---|
| Repositorio | `EnuarRosales/landig-agencia` (público) |
| Tipo | Monorepo pnpm + Turborepo |
| Aplicación | `apps/web` (`@mocter/web`) · Next.js 16 en modo `standalone` |
| Dominio / datos | `packages/domain` (`@mocter/domain`) · Drizzle ORM |
| Base de datos | PostgreSQL 18 con pgvector (`pgvector/pgvector:pg18`) |
| Runtime | Node.js 24 (alpine en contenedor) |
| Imagen | `ghcr.io/enuarrosales/mocter-web` (única: aplicación + migrador) |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`, `cd.yml`, `deploy.yml`) |
| Producción | VPS Hostinger · Traefik v2.11 · `mocter.co` |
| Pruebas | VPS proyectado, despliegue desactivado (`STAGING_ENABLED=false`) |

## 2. Metodología: Spec-Driven Development (SDD)

1. Todo cambio no trivial nace de una especificación en `docs/specs/<id>-<nombre>/`:
   - `requirements.md` → **qué** y **por qué** (requisitos y criterios de aceptación).
   - `design.md` → **cómo** (decisiones, arquitectura, contratos).
   - `tasks.md` → **pasos** ejecutables, en orden, con verificación.
2. Orden de lectura obligatorio: `AGENTS.md` → `requirements.md` → `design.md` → `tasks.md`.
3. Ejecuta las tareas **en el orden de `tasks.md`**. Marca `[x]` solo cuando su verificación pase.
4. Si encuentras una contradicción entre documentos, prevalece: `AGENTS.md` > `requirements.md` > `design.md` > `tasks.md`. Reporta la contradicción.
5. No amplíes el alcance. Lo que no esté en `requirements.md` va a la sección *Hallazgos* del reporte, no al código.
6. Las tareas marcadas **[HUMANO]** no se ejecutan; se documentan como pendientes.

## 3. Restricciones (no negociables)

| ID | Restricción |
|---|---|
| R-01 | No versionar secretos, `.env` reales, llaves SSH ni contraseñas. |
| R-02 | No modificar código de la aplicación (`apps/web`, `packages/domain/src`) salvo que una especificación lo indique explícitamente. |
| R-03 | No cambiar nombre de imagen, redes Docker, routers de Traefik ni rutas del servidor definidos en las especificaciones. |
| R-04 | No usar la etiqueta `latest` para desplegar. El servidor siempre ejecuta una etiqueta explícita (`vX.Y.Z` o `sha-xxxxxxx`). |
| R-05 | No ampliar permisos de workflows más allá de los declarados. No cambiar *Workflow permissions* a *Read and write*. |
| R-06 | No agregar acciones de terceros distintas de `actions/*`, `docker/*` y `pnpm/action-setup`. |
| R-07 | No modificar el compose de desarrollo local (`docker-compose.yml`) salvo solicitud expresa. |
| R-08 | No usar `drizzle-kit push` en workflows, scripts de despliegue ni imágenes. Solo se permite en desarrollo local. |
| R-09 | No editar ni eliminar migraciones SQL ya versionadas en `packages/domain/drizzle`. Para corregir, generar una nueva. |
| R-10 | Ningún servicio Docker de Mocter publica puertos en el host; todo el tráfico entra por Traefik. |

## 4. Convenciones

### 4.1 Ramas y versiones

| Rama / ref | Uso |
|---|---|
| `feat/*`, `fix/*` | Trabajo; PR hacia `develop` |
| `develop` | Integración; despliega a pruebas (cuando esté habilitado) |
| `main` | Estable; no despliega por sí sola |
| Tag `vX.Y.Z` sobre `main` | Libera a producción (con aprobación manual) |
| Tag `vX.Y.Z-rc.N` | Construye imagen, no despliega |

Mensajes de commit: Conventional Commits (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`, `refactor:`).

### 4.2 Migraciones (estándar Drizzle)

1. Editar el esquema en `packages/domain`.
2. Iterar en local con `pnpm --filter @mocter/domain db:push` (opcional, solo BD local).
3. Generar la migración: `pnpm --filter @mocter/domain db:generate`.
4. Revisar el SQL generado (renombres, `DROP`, datos existentes).
5. Validar en local: `pnpm --filter @mocter/domain db:migrate`.
6. Commit del esquema **y** de la carpeta `drizzle/` en el mismo PR.
7. Cambios destructivos se dividen en dos versiones (expandir → contraer).

### 4.3 Comandos de verificación

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm e2e
pnpm --filter @mocter/domain exec drizzle-kit check
docker build -t mocter-web:local .
bash -n deploy/server/deploy.sh
TAG=test docker compose -f docker-compose.prod.yml config -q
```

## 5. Formato del reporte del agente

Al terminar una especificación, entrega:
1. Resultado de las tareas de descubrimiento.
2. Tareas completadas `[x]` y pendientes `[ ]` de `tasks.md`.
3. Archivos creados / modificados y desviaciones (con justificación).
4. Resultado de los comandos de verificación.
5. Hallazgos fuera de alcance.
6. Tareas **[HUMANO]** pendientes.

## 6. Índice de especificaciones

| ID | Nombre | Estado |
|---|---|---|
| MIG-001 | [Migración Next.js 16](docs/specs/mig-001-nextjs-migration/requirements.md) | Implementada · Estable |
| CD-001 | [Despliegue continuo](docs/specs/cd-001-despliegue-continuo/requirements.md) | Implementada · Pendiente de primer release |


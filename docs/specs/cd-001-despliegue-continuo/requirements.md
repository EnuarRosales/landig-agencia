# CD-001 · Requisitos · Despliegue continuo de Mocter

| Atributo | Valor |
|---|---|
| ID | CD-001 |
| Versión | 1.1 |
| Estado | Aprobada |
| Fecha | 2026-10-18 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |

## 1. Propósito

Automatizar la integración y el despliegue continuo de Mocter usando la capa gratuita de GitHub (Actions + Container Registry), con despliegue a producción controlado por versiones y migraciones de base de datos bajo el estándar Drizzle `generate` + `migrate`.

## 2. Alcance

### Incluye
- Workflows de CI (calidad y consistencia de migraciones) y CD (build, publicación y despliegue).
- Imagen única `mocter-web` con migrador embebido (/app/migrator con driver `postgres-js`).
- Compose de producción y de pruebas (proyectado) integrados con Traefik v2.11.
- Script de despliegue en servidor con respaldo preventivo (`pg_dump`), migraciones atómicas y rollback.
- Documentación operativa (`docs/deployment.md`).

### Excluye
- Monitoreo, alertas y métricas externas.
- Copias de seguridad externas automatizadas fuera del host.
- Endpoint `/api/health` dedicado.
- Despliegue sin caída (blue/green).
- Reversión automática de migraciones SQL en base de datos.
- Aprovisionamiento del VPS de pruebas.

## 3. Actores

| Actor | Rol |
|---|---|
| Desarrollador | Realiza cambios, genera migraciones y abre PR |
| Responsable de liberación | Crea tags de versión y aprueba despliegues a producción |
| GitHub Actions | Ejecuta pipelines de CI/CD |
| Servidor (`deploy.sh`) | Aplica el despliegue de forma controlada y segura |

## 4. Requisitos funcionales

### RF-01 · Integración continua
| ID | Requisito |
|---|---|
| RF-01.1 | Cuando se abra o actualice un PR hacia `develop` o `main`, el sistema debe ejecutar `lint`, `test`, `migrations` y `e2e`. |
| RF-01.2 | Cuando se haga push a `main`, el sistema debe ejecutar CI y **no** debe construir ni publicar imagen. |
| RF-01.3 | Cuando el esquema de Drizzle cambie sin su migración SQL versionada, el job `migrations` debe fallar. |
| RF-01.4 | Cuando las migraciones versionadas sean inconsistentes entre sí, el job `migrations` debe fallar (`drizzle-kit check`). |

### RF-02 · Construcción y publicación
| ID | Requisito |
|---|---|
| RF-02.1 | Cuando se haga push a `develop` y CI sea exitoso, el sistema debe publicar `mocter-web:develop` y `mocter-web:sha-<7>`. |
| RF-02.2 | Cuando se publique un tag `vX.Y.Z` sobre un commit de `main` y CI sea exitoso, el sistema debe publicar `vX.Y.Z`, `latest` y `sha-<7>`. |
| RF-02.3 | Cuando se publique un tag `vX.Y.Z-<prerelease>`, el sistema debe publicar `vX.Y.Z-<prerelease>` y `sha-<7>`, sin `latest`. |
| RF-02.4 | Cuando un tag apunte a un commit que no pertenece a `main`, el sistema debe fallar y no publicar imagen (`verify-tag`). |
| RF-02.5 | Cuando se publique una imagen, el sistema debe verificar que contiene el migrador funcional con driver `postgres-js`. |

### RF-03 · Despliegue
| ID | Requisito |
|---|---|
| RF-03.1 | Cuando se publique una imagen desde un tag estable, el sistema debe esperar aprobación manual antes de desplegar a producción. |
| RF-03.2 | Cuando se publique una imagen desde `develop` y `STAGING_ENABLED` sea `true`, el sistema debe desplegar a pruebas. |
| RF-03.3 | Cuando `STAGING_ENABLED` no sea `true`, el despliegue a pruebas debe quedar omitido (no fallido). |
| RF-03.4 | Cuando se ejecute *Run workflow* desde un tag existente, el sistema debe desplegar esa versión sin reconstruir. |
| RF-03.5 | Antes de reemplazar la aplicación, el servidor debe respaldar la base de datos (`pg_dump`, retención 10). |
| RF-03.6 | Antes de reemplazar la aplicación, el servidor debe aplicar solo las migraciones pendientes y registrarlas en `drizzle.__drizzle_migrations`. |
| RF-03.7 | Cuando una migración falle, el servidor debe abortar sin reemplazar la versión en ejecución. |
| RF-03.8 | Cuando la nueva versión no alcance estado `healthy`, el servidor debe volver a la versión anterior. |
| RF-03.9 | Tras desplegar, el sistema debe verificar que la URL pública responde 2xx/3xx. |
| RF-03.10 | `www.mocter.co` debe redirigir (301) a `mocter.co` con certificado válido. |

## 5. Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Costo | Uso eficiente de capa gratuita: GHCR público (con soporte opcional de token privado en deploy.conf). |
| RNF-02 | Seguridad | Llave SSH restringida a `deploy.sh` (`restrict,command=`). |
| RNF-03 | Seguridad | Ningún servicio de Mocter publica puertos en el host; Postgres solo en red interna `backend`. |
| RNF-04 | Seguridad | Workflows con permisos mínimos declarados por job (`contents: read`, `packages: write` solo donde aplica). |
| RNF-05 | Trazabilidad | Cada despliegue queda registrado en `releases.log` con fecha, ambiente, etiqueta y ref. |
| RNF-06 | Reproducibilidad | La ref exacta descarga el compose versionado correspondiente a la imagen. |
| RNF-07 | Concurrencia | Concurrencia bloqueada por ambiente (un solo despliegue a la vez). |
| RNF-08 | Aislamiento | Nombres Traefik con prefijos unívocos (`mocter-prod-`, `mocter-test-`). |

## 6. Criterios de aceptación

| ID | Requisito | Criterio | Verificación |
|---|---|---|---|
| CA-01 | RF-01.1 | PR a `develop` ejecuta `lint`, `test`, `migrations`, `e2e` | Checks de GitHub Actions |
| CA-02 | RF-01.3 | Cambio de esquema sin migración hace fallar `migrations` | CI job `migrations` |
| CA-03 | RF-01.2 | Push a `main` no publica imagen | GHCR sin etiquetas nuevas |
| CA-04 | RF-02.1, RF-03.3 | Push a `develop` publica `develop` + `sha-<7>` y omite `deploy-staging` | GHCR + paso skipped |
| CA-05 | RF-02.5 | La imagen contiene `/app/migrator` funcional | Paso de verificación en build-and-push |
| CA-06 | RF-02.4 | Tag fuera de `main` falla en `verify-tag` | Job `verify-tag` |
| CA-07 | RF-02.2, RF-03.1 | Tag `vX.Y.Z` publica 3 etiquetas y espera aprobación | GHCR + environment waiting |
| CA-08 | RF-02.3 | Tag `-rc` no publica `latest` ni despliega | GHCR sin latest |
| CA-09 | RF-03.10 | `https://mocter.co` responde y `www` redirige con 301 | Smoke test |
| CA-10 | RF-03.6 | Solo migraciones pendientes registradas en tabla de control | Logs de migración |
| CA-11 | RF-03.7 | Migración fallida no tumba versión activa | Aborto controlado en deploy.sh |
| CA-12 | RF-03.5 | Respaldo `.dump` generado en `backups/` antes de cada deploy | Verificación de archivos |
| CA-13 | RF-03.8 | Contenedor no saludable dispara rollback automático | Verificación en deploy.sh |
| CA-14 | RNF-02 | Llave SSH no abre sesión interactiva | Validación restrictiva |
| CA-15 | RNF-03 | Sin puertos publicados por Mocter en el host | Red interna Traefik |
| CA-16 | RF-03.4 | Rollback por *Run workflow* sin reconstruir | Despliegue vía dispatch |
| CA-17 | R-01, R-08 | Sin secretos ni `drizzle-kit push` en el pipeline | Verificación estática |

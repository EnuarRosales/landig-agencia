# CHW-001 · Tareas · Inventario técnico de Chatwoot

| Atributo | Valor |
|---|---|
| ID | CHW-001 |
| Versión | 1.0 |
| Fecha | 2026-10-20 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Fuente fijada | commit `042b438fe31d2a2ef00c396379b7064ab6d0034f` · release `4.19.0` |

## Convenciones

- Ejecutar en orden. `[x]` solo cuando la verificación pase.
- Toda afirmación publicada debe citar `archivo:línea`.
- Las tareas **[HUMANO]** no se ejecutan; se reportan como pendientes.

## Tareas

- [x] **T-01 · Fijar el checkout de referencia**
  - Clonar `chatwoot/chatwoot` con `--depth 1 --single-branch`.
  - Registrar commit y versión.
  - Verificación: `git rev-parse HEAD` = `042b438fe31d2a2ef00c396379b7064ab6d0034f` y `package.json.version` = `4.19.0`.
  - Evidencia: commit verificado el 2026-10-20.

- [x] **T-02 · Extraer el inventario de rutas**
  - Parsear `config/routes.rb` (838 líneas) y contrastar con `swagger/swagger.json` (96 paths).
  - Producir `api-surface.md` con método, path, controlador#acción y superficie.
  - Verificación: los 96 paths del swagger figuran; las rutas sin documentar se listan como hallazgo.

- [x] **T-03 · Separar las tres superficies de API**
  - Clasificar cada ruta en `/api/v1`, `/platform/api/v1` o `/public/api/v1`.
  - Verificación: ninguna ruta queda sin superficie asignada.

- [x] **T-04 · Inventariar la Platform API**
  - Documentar los cinco controladores: `accounts`, `account_users`, `users`, `agent_bots`, `email_channel_migrations`.
  - Incluir payloads permitidos, códigos de respuesta y precondiciones.
  - Verificación: `permitted_params` de cada controlador citado con línea.

- [x] **T-05 · Extraer el esquema actual**
  - Parsear `db/schema.rb`: 104 tablas, columnas, tipos, PK, FK e índices.
  - Verificación: el conteo de tablas coincide con `create_table` del archivo fijado.

- [x] **T-06 · Clasificar tenencia y autoridad**
  - Aplicar los dos ejes del diseño (§5) a las 104 tablas.
  - Verificación: ninguna tabla queda sin valor en ambos ejes.

- [x] **T-07 · Documentar autenticación y autorización**
  - Cubrir `AccessTokenAuthHelper`, `PlatformController`, `Api::BaseController`, `dashboard_bearer_token?` y Pundit.
  - Verificación: cada regla de auth cita el método que la implementa.

- [x] **T-08 · Documentar SSO**
  - `generate_sso_link`, TTL de 5 minutos, single-use e impersonación.
  - Verificación: se citan `generate_sso_auth_token`, `consume_sso_auth_token` y `generate_sso_link_with_impersonation`.

- [x] **T-09 · Documentar la frontera enterprise**
  - Inventariar `enterprise/` y `app/helpers/super_admin/features.yml`.
  - Verificación: cada capacidad premium tiene archivo de origen y efecto documentado.

- [x] **T-10 · Construir la matriz de capacidades**
  - Completar la matriz del diseño (§6) con tablas y endpoints verificados.
  - Verificación: cada fila cita al menos un controlador y un modelo.

- [x] **T-11 · Producir el ERD**
  - Generar `erd.mmd` con los dos grafos definidos en el diseño (§7).
  - Verificación: el diagrama renderiza y las relaciones coinciden con el esquema.

- [x] **T-12 · Publicar el README de la referencia**
  - Declarar pin, alcance, estructura y procedimiento de regeneración.
  - Verificación: el commit declarado coincide con el checkout.

- [x] **T-13 · Revisión de impacto sobre `ADM-001`**
  - Identificar qué decisiones de `ADM-001` quedan habilitadas o bloqueadas.
  - Consumir `DAT-001`: PostgreSQL 18 + pgvector, Redis 7+ y Sidekiq en el plano de soporte; el esquema de Chatwoot no se particiona ni usa RLS.
  - Verificación: las decisiones abiertas O-04 y O-05 figuran con impacto explícito.
  - Evidencia: `design.md` §10.1 con O-04 y O-05 como bloqueantes y el resto de las decisiones clasificado.

- [x] **T-16 · Documentar el modelo multi-cuenta**
  - Describir `account_users`, la ausencia de lectura cross-account y las opciones de acceso para líderes de comunidad.
  - Verificación: se cita el índice único `(account_id, user_id)` y la consecuencia de O-04.
  - Evidencia: `design.md` §6.1; la unicidad por par cuenta–usuario se cita en `auth.md` §6 con `db/schema.rb:55`.

- [x] **[HUMANO] T-14 · Aprobar la especificación**
  - Cambiar el estado de `requirements.md` de `Borrador` a `Aprobada`.
  - Responsable: dueño del producto.
  - Evidencia: aprobación humana del 2026-10-21.

- [x] **[HUMANO] T-15 · Registrar CHW-001 en el índice**
  - Agregar la fila en `.agents/AGENTS.md` §6.
  - Responsable: mantenedor del repositorio.
  - Evidencia: fila registrada en `.agents/AGENTS.md` §6 (DAT-001 T-15).

## Reporte de cierre

Al terminar, entregar:

1. Tareas completadas y pendientes.
2. Archivos creados.
3. Conteos verificados: tablas, paths, controladores.
4. Hallazgos fuera de alcance.
5. Tareas **[HUMANO]** pendientes.

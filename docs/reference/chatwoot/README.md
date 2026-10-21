# Referencia técnica de Chatwoot

| Atributo | Valor |
|---|---|
| Fuente | `chatwoot/chatwoot` |
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Rails | `7.2.3.1` (`Gemfile.lock`) |
| Ruby | `3.4.4` (`.ruby-version`) |
| Extraído | 2026-10-20 |
| Especificación | [CHW-001](../../specs/chw-001-inventario-chatwoot/requirements.md) |
| Método | Lectura del checkout fijado. **No** se ejecutó la aplicación ni el resolutor de rutas de Rails. |

## 1. Alcance

Estos documentos describen Chatwoot desde la perspectiva de `mocter-admin`: qué datos posee, qué puede sembrarse por API, qué no debe tocarse y dónde termina la frontera entre el código libre y el enterprise.

No son documentación de usuario, de instalación ni de operación.

## 2. Cifras verificadas

| Métrica | Valor | Fuente |
|---|---|---|
| Tablas | 104 | sentencias `create_table` en `db/schema.rb` |
| Claves foráneas | 17 | sentencias `add_foreign_key` en `db/schema.rb` |
| Migraciones | 199 | archivos en `db/migrate/` |
| Líneas de `config/routes.rb` | 838 | conteo directo |
| Paths en `swagger/swagger.json` | 96 | parseo del JSON |
| Controladores bajo `app/controllers/api/v1` | 102 archivos | conteo recursivo |
| Controladores de Platform API | 5 | conteo recursivo |
| Controladores públicos | 10 archivos | conteo recursivo |
| Policies Pundit | 27 | archivos en `app/policies/` |
| Modelos de primer nivel | 58 | archivos en `app/models/*.rb` |
| Archivos `.rb` en `enterprise/` | 488 | conteo recursivo |

## 3. Estructura

| Documento | Contenido |
|---|---|
| [`architecture.md`](architecture.md) | Tenencia, modelo de ejecución, `app/` frente a `enterprise/`, consecuencias para `mocter-admin` |
| [`auth.md`](auth.md) | Las tres superficies, token polimórfico, Pundit, SSO e impersonación |
| [`api-surface.md`](api-surface.md) | Inventario de rutas, Platform API con sus payloads, hallazgos de cobertura |
| [`data-model.md`](data-model.md) | Las 104 tablas clasificadas por tenencia y autoridad de escritura |
| [`capability-matrix.md`](capability-matrix.md) | Capacidad, tablas, endpoints y quién siembra |
| [`enterprise-boundary.md`](enterprise-boundary.md) | Frontera real del código enterprise y su interruptor |
| [`erd.mmd`](erd.mmd) | Dos grafos Mermaid: administrativo y operativo |

## 4. Cómo regenerar

1. Clonar el repositorio en el commit fijado:

   ```bash
   git clone --depth 1 --single-branch https://github.com/chatwoot/chatwoot.git chatwoot-ref
   git -C chatwoot-ref fetch --depth 1 origin 042b438fe31d2a2ef00c396379b7064ab6d0034f
   git -C chatwoot-ref checkout 042b438fe31d2a2ef00c396379b7064ab6d0034f
   ```

2. Verificar el pin:

   ```bash
   git -C chatwoot-ref rev-parse HEAD
   grep '"version"' chatwoot-ref/package.json
   ```

3. Re-ejecutar la extracción descrita en [`../../specs/chw-001-inventario-chatwoot/design.md`](../../specs/chw-001-inventario-chatwoot/design.md) §3.

4. Diferenciar los artefactos contra la versión anterior y subir la versión menor de CHW-001 si cambian autenticación, rutas o esquema.

5. Abrir una revisión de impacto sobre `ADM-001`.

No se editan a mano los artefactos generados.

## 5. Regla de honestidad

Toda afirmación publicada cita `archivo:línea` relativo a la raíz del checkout. Lo que no pudo citarse se marca como **no verificado** y no se publica como hecho.

En particular:

- El inventario de rutas se deriva de la lectura estructural de `config/routes.rb` y del contraste con `swagger/swagger.json`. **No** se resolvió la tabla de rutas en ejecución.
- El esquema se toma de `db/schema.rb`, que es el estado consolidado. Las migraciones solo explican evolución y no se usan como fuente de verdad.
- Las capacidades premium se identifican por ruta y por el archivo `app/helpers/super_admin/features.yml`, no por suposición.

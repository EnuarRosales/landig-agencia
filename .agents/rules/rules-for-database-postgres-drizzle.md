# Directiva · Base de datos PostgreSQL y Drizzle ORM

> Regla permanente para toda base de datos propia de Mocter (`mocter-admin`, `mocter-core` y aplicaciones derivadas).
> **No aplica** a la base de datos de Chatwoot, que se rige por su propio esquema y su sincronización con upstream.

Referencia oficial: [Drizzle ORM · PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new)

## 1. Nomenclatura

| Regla | Ejemplo |
|---|---|
| Tablas y columnas en minúscula, sin excepción | `organization_members` |
| Palabras compuestas separadas por `_` | `created_at`, `source_product_id` |
| Nombre de tabla en plural y consistente | `products`, `media_files` |
| Clave primaria siempre `id` | `id` |
| Clave foránea `<entidad>_id` | `client_id`, `product_id` |
| Sin prefijos redundantes ni abreviaturas ambiguas | `description`, no `desc_txt` |

En TypeScript se escribe `camelCase` y el mapeo a `snake_case` lo hace el builder `snakeCase` de `drizzle-orm/pg-core` (`snakeCase.table(...)`). Prohibido declarar alias por columna de forma manual cuando el builder resuelve el mapeo.

## 2. Comentarios obligatorios

1. Toda tabla lleva `COMMENT ON TABLE` con su propósito de negocio en una línea.
2. Toda columna cuyo significado no sea evidente lleva `COMMENT ON COLUMN`, indicando unidades, formato o regla de negocio.
3. El comentario se agrega en la migración SQL versionada.
   - Verificado el 2026-10-20: la documentación de declaración de esquema de Drizzle no expone comentarios en el builder. Si la versión instalada incorpora soporte nativo, se usa esa vía y el resultado en la base debe ser idéntico.
4. Verificación: no debe existir tabla sin comentario.

## 3. Integridad referencial

1. Toda relación exigida por la lógica de negocio se declara como clave foránea con `references()`.
2. El comportamiento `ON DELETE` es explícito: `restrict` por defecto; `cascade` solo cuando el hijo no tiene vida propia.
3. Prohibido modelar por convención relaciones que la lógica exige íntegras.
4. En tablas particionadas, la clave foránea y todo índice único deben incluir la clave de partición.

## 4. Índices

1. Se crean por **camino de acceso conocido**, no por intuición: claves foráneas usadas en joins, columnas de filtro y de ordenamiento en consultas reales, claves de búsqueda.
2. El índice de tenencia es **compuesto y comienza por la clave de inquilino**: `(client_id, ...)`.
3. Todo índice adicional encarece la escritura y el mantenimiento: se prohíbe indexar por reflejo.
4. La frecuencia real de consulta se mide con `pg_stat_user_indexes` y `pg_stat_statements`, y se revisa en cada release.
   - Antes de producción la frecuencia no se conoce. El punto de partida son los caminos de acceso declarados; el ajuste llega con datos de uso, no con suposiciones.
5. Los índices parciales y de expresión se documentan junto con la consulta que los justifica.

## 5. Normalización y rendimiento

1. El modelo lógico se normaliza, con tercera forma normal como base.
2. La desnormalización es una decisión explícita y documentada, con su invariante y su mecanismo de mantenimiento.
3. Normalización y particionado no se mezclan: la normalización es **lógica**, el particionado es **físico**. Se normaliza primero y se particiona después, sin alterar el modelo lógico.
4. Toda tabla con datos de inquilino lleva `client_id NOT NULL` e índice compuesto, se particione o no.
5. Regla de particionado: los objetos que requieren vectorización se particionan por `client_id`; el resto solo lleva `client_id`.

## 6. Drizzle: esquema y migraciones

1. El esquema en TypeScript es la fuente de verdad de la estructura.
2. Las migraciones se generan con `drizzle-kit generate` y se revisan antes de aplicar.
3. `drizzle-kit push` se permite **solo** contra base local. En workflows, despliegues e imágenes está prohibido (R-08 de la constitución).
4. Una migración ya versionada no se edita ni se elimina; se genera una nueva (R-09 de la constitución).
5. Los cambios destructivos se dividen en dos versiones: expandir y contraer.

## 7. Verificación

Antes de cerrar cualquier cambio de esquema:

```bash
pnpm --filter <paquete> exec drizzle-kit check
```

Además:

1. Consulta de control que detecta tablas sin comentario.
2. `EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas críticas antes de agregar índices.
3. Revisión de `pg_stat_user_indexes` para detectar índices sin uso.

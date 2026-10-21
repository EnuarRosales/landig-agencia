# DAT-001 · Diseño · Arquitectura de datos multi-inquilino basada en celdas

| Atributo | Valor |
|---|---|
| ID | DAT-001 |
| Versión | 1.0 |
| Estado | Aprobada |
| Fecha | 2026-10-20 |
| Depende de | [`requirements.md`](requirements.md) |
| Relacionado | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) |

## 1. Principio rector

**Tres planos, una clave de tenencia, cero claves foráneas cruzadas.**

```text
                         ┌──────────────────────────────┐
                         │      PLANO DE SOPORTE        │
                         │  Chatwoot (web + workers)    │
                         │  Redis 7+ · pg-chatwoot      │
                         │  PostgreSQL 18 + pgvector    │
                         └──────────────┬───────────────┘
                                        │ APIs (sin acceso a la base)
                                        │
┌──────────────────────────────┐        │
│     PLANO DE CONTROL         │◀───────┘
│  Router Global               │
│  landing + mocter-admin      │
│  clients · plans · routing   │
│  media_catalog · audits      │
│  PostgreSQL 18 + pgvector    │
│  Redis 7+ (dedicado)         │
└──────────────┬───────────────┘
               │ client_id → cell_id
               │ routing_version
     ┌─────────┴─────────┐
     ▼                   ▼
┌──────────────┐   ┌──────────────┐
│   CELDA 01   │   │   CELDA N    │
│ PgBouncer    │   │ PgBouncer    │
│ PG18+pgvector│   │ PG18+pgvector│
│ RLS + LIST   │   │ RLS + LIST   │
└──────────────┘   └──────────────┘

  N8N (externo, fuera de alcance) ──▶ API ──▶ Mocter
```

Reglas del principio rector:

1. `client_id` es la única clave de tenencia. No se usa `tenant_id`.
2. La entidad inquilino es `clients.id` (UUIDv7). Las tablas hijas la referencian como `client_id`.
3. Chatwoot conserva `account_id` y su propio esquema. La correlación vive en una tabla de Mocter.
4. No hay claves foráneas entre bases. Las referencias son identificadores.
5. N8N no forma parte de la arquitectura de datos: solo se lo nombra como actor externo.

## 2. Topología

| Plano | Componentes | Motor | Responsabilidad |
|---|---|---|---|
| Soporte | Chatwoot web, workers/Sidekiq, Redis 7+, `pg-chatwoot` | PostgreSQL 18 + pgvector | Conversaciones, mensajes, adjuntos operativos y SSO |
| Control | Router Global, landing, `mocter-admin`, Redis 7+ dedicado, caché de enrutamiento | PostgreSQL 18 + pgvector | Inquilinos, planes, cuotas, enrutamiento, catálogo global de archivos y auditoría |
| Datos | Celdas `cell_01`…`cell_n`, PgBouncer | PostgreSQL 18 + pgvector | Usuarios, productos, embeddings, vínculos de archivos y datos operativos del inquilino |

### 2.1 Aislamiento

- Cada plano tiene su propia instancia PostgreSQL. No se comparte una instancia entre planos.
- El plano de control tiene su propia instancia Redis 7+, separada de la de Chatwoot. No comparten instancia, credenciales ni política de evicción.
- Cada celda tiene su propia instancia y su propio PgBouncer.
- Chatwoot no accede a la base de Mocter y Mocter no accede a la base de Chatwoot.
- N8N, si existe, se conecta por API. No comparte base, esquema ni credenciales con Mocter.

### 2.2 Versiones

| Componente | Versión | Nota |
|---|---|---|
| PostgreSQL | 18 | Todas las instancias, incluida Chatwoot |
| pgvector | 0.8+ | Versión incluida en `pgvector/pgvector:pg18`, validada en laboratorio |
| Chatwoot | 4.19.0 | Fijado por CHW-001 |
| Redis | 7+ | Chatwoot y plano de control (instancias separadas) |
| Node.js | 24 | Runtime de `mocter-admin` y la landing |

> **Validado en laboratorio.** Chatwoot 4.19.0 funciona sobre PostgreSQL 18 + pgvector y las migraciones pasaron satisfactoriamente. Se mantiene el rollback como precaución operativa; su procedimiento está en §9.7.

## 3. Plano de control: Router Global

### 3.1 Responsabilidades

- Registrar la existencia y el ciclo de vida de cada inquilino.
- Registrar los planes y sus overrides.
- Resolver `client_id` → `cell_id` y mantener la versión de enrutamiento.
- Auditar altas, migraciones y cambios de plan.
- Mantener el catálogo global de archivos.
- Mantener las correlaciones con sistemas externos, incluida Chatwoot.
- Mantener las organizaciones y sus membresías.

### 3.2 Esquema propuesto

Todas las tablas siguen la directiva: nombre plural, PK `id`, FK `<entidad>_id`, `snake_case`, comentarios obligatorios en la migración. En las tablas particionadas por `client_id`, la PK es `(client_id, id)` porque PostgreSQL exige la clave de partición en la PK; la regla de PK `id` se mantiene en las tablas no particionadas.

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `cells` | Catálogo de celdas | `id`, `code`, `tier`, `status`, `pgbouncer_host`, `pgbouncer_port`, `database_name`, `max_clients`, `current_clients`, `region` |
| `clients` | Inquilinos | `id` (UUIDv7), `slug`, `display_name`, `lifecycle_status`, `plan_id`, `quota_version`, `created_at`, `updated_at` |
| `client_routing` | Enrutamiento vigente | `id`, `client_id`, `cell_id`, `routing_status`, `routing_version`, `updated_at` |
| `client_migrations` | Auditoría de migraciones | `id`, `client_id`, `source_cell_id`, `target_cell_id`, `state`, `started_at`, `completed_at` |
| `plans` | Catálogo de planes | `id`, `code`, `name`, `is_public`, `price`, `currency`, `created_at` |
| `plan_limits` | Topes por plan | `id`, `plan_id`, `dimension`, `value`, `created_at` |
| `client_plan_overrides` | Topes negociados | `id`, `client_id`, `dimension`, `value`, `valid_from`, `valid_to`, `negotiated_by`, `updated_by`, `created_at`, `updated_at` |
| `media_catalog` | Catálogo global de archivos | `id`, `content_hash`, `storage_pool_id`, `storage_key`, `size_bytes`, `media_kind`, `created_at` |
| `chatwoot_accounts` | Correlación con Chatwoot | `id`, `client_id`, `chatwoot_account_id`, `state`, `idempotency_key`, `last_error`, `synced_at` |
| `organizations` | Comunidades u organizaciones | `id`, `name`, `created_at` |
| `organization_members` | Membresías | `id`, `organization_id`, `client_id`, `role`, `created_at` |

Reglas:

- `clients.id` es la PK del inquilino y se expone como `client_id` en las tablas hijas. Las tablas hijas no generan un `client_id` nuevo: copian el valor de `clients.id`. En el plano de control es una FK física; en las celdas es una clave lógica porque no hay FK entre bases. En tablas particionadas, la PK es `(client_id, id)`; en las no particionadas, la PK es `id`.
- `client_routing.client_id` es único.
- `chatwoot_accounts.client_id` es único; `chatwoot_accounts.chatwoot_account_id` es único.
- `media_catalog` tiene unicidad por `(content_hash, storage_pool_id)` y no tiene `client_id` ni atributos de negocio. `storage_pool_id` referencia un pool de almacenamiento (SeaweedFS) definido en la implementación; su catálogo no se detalla en esta spec.
- `plan_limits` tiene una fila por `(plan_id, dimension)`.
- `client_plan_overrides` tiene vigencia y auditoría (`negotiated_by`, `updated_by`); el tope efectivo se calcula en una sola función de lectura.
- La retención mínima legal se valida en la capa de servicio contra `legal_floor_days`; un override no puede reducirla.
- El contador autoritativo de consumo vive en la celda (`client_usage`); el plano de control no lo duplica.
- Cada cambio de plan u override incrementa `clients.quota_version`; la celda refresca el tope cuando ve una versión distinta. El incremento lo hace la capa de servicio o un trigger en la misma transacción que cambia `plan_id` o el override.

### 3.3 DDL de referencia

```sql
CREATE TABLE cells (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    code              text NOT NULL UNIQUE,
    tier              text NOT NULL DEFAULT 'standard',
    status            text NOT NULL DEFAULT 'active',
    pgbouncer_host    text NOT NULL,
    pgbouncer_port    integer NOT NULL DEFAULT 6432,
    database_name     text NOT NULL,
    max_clients       integer NOT NULL DEFAULT 100,
    current_clients   integer NOT NULL DEFAULT 0,
    region            text NOT NULL DEFAULT 'us-east-1',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cells_status_check CHECK (status IN ('active', 'draining', 'readonly', 'maintenance')),
    CONSTRAINT cells_max_clients_check CHECK (max_clients > 0),
    CONSTRAINT cells_capacity_check CHECK (current_clients <= max_clients)
);

CREATE TABLE plans (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    code              text NOT NULL UNIQUE,
    name              text NOT NULL,
    is_public         boolean NOT NULL DEFAULT false,
    price             numeric(12, 2) NOT NULL DEFAULT 0,
    currency          text NOT NULL DEFAULT 'USD',
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_limits (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    plan_id           uuid NOT NULL REFERENCES plans(id),
    dimension         text NOT NULL,
    value             bigint NOT NULL CHECK (value >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plan_id, dimension)
);

CREATE TABLE clients (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    slug              text NOT NULL UNIQUE,
    display_name      text NOT NULL,
    lifecycle_status  text NOT NULL DEFAULT 'alta',
    plan_id           uuid NOT NULL REFERENCES plans(id),
    quota_version     integer NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clients_lifecycle_check CHECK (lifecycle_status IN ('alta', 'activo', 'suspendido', 'baja'))
);

CREATE TABLE client_plan_overrides (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id         uuid NOT NULL REFERENCES clients(id),
    dimension         text NOT NULL,
    value             bigint NOT NULL CHECK (value >= 0),
    valid_from        timestamptz NOT NULL DEFAULT now(),
    valid_to          timestamptz,
    negotiated_by     uuid,
    updated_by        uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE client_routing (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id         uuid NOT NULL UNIQUE REFERENCES clients(id),
    cell_id           uuid NOT NULL REFERENCES cells(id),
    routing_status    text NOT NULL DEFAULT 'pending',
    routing_version   integer NOT NULL DEFAULT 1,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT client_routing_status_check CHECK (routing_status IN ('pending', 'active', 'draining', 'readonly', 'maintenance', 'migrating', 'failed'))
);

CREATE TABLE client_migrations (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id         uuid NOT NULL REFERENCES clients(id),
    source_cell_id    uuid NOT NULL REFERENCES cells(id),
    target_cell_id    uuid NOT NULL REFERENCES cells(id),
    state             text NOT NULL,
    started_at        timestamptz NOT NULL DEFAULT now(),
    completed_at      timestamptz,
    CONSTRAINT client_migrations_state_check CHECK (state IN ('initiated', 'replicating', 'cutover_locked', 'completed', 'failed'))
);
```

Los comentarios `COMMENT ON TABLE` y `COMMENT ON COLUMN` se agregan en la migración SQL, conforme a la directiva.

### 3.4 Alta de un inquilino

El alta cruza dos bases, así que no puede ser una única transacción. Se modela como saga con compensación:

1. **Plano de control**: insertar `clients` con `lifecycle_status='alta'` y `client_routing` con `routing_status='pending'`; reservar la celda con `FOR UPDATE SKIP LOCKED`.
2. **Celda**: crear las particiones y políticas de `products` y `product_embeddings` con `create_client_partitions` (operación privilegiada).
3. **Plano de control**: activar `client_routing.routing_status='active'`, incrementar `cells.current_clients` y registrar la versión de enrutamiento.
4. **Fallo**: marcar `client_routing.routing_status='failed'`, registrar el error y ejecutar la compensación (drop de particiones, decremento del contador si se había incrementado).

```sql
BEGIN;

SELECT c.id
INTO v_cell_id
FROM cells c
WHERE c.status = 'active'
  AND c.tier = 'standard'
  AND c.current_clients < c.max_clients
ORDER BY c.current_clients::numeric / c.max_clients
LIMIT 1
FOR UPDATE SKIP LOCKED;

IF v_cell_id IS NULL THEN
    RAISE EXCEPTION 'No hay celda con capacidad disponible';
END IF;

INSERT INTO clients (slug, display_name, lifecycle_status, plan_id)
VALUES (p_slug, p_display_name, 'alta', p_plan_id)
RETURNING id INTO v_client_id;

INSERT INTO client_routing (client_id, cell_id, routing_status, routing_version)
VALUES (v_client_id, v_cell_id, 'pending', 1);

COMMIT;
```

La reserva de celda no incrementa `current_clients`; el incremento ocurre cuando la celda confirma que las particiones de `products` y `product_embeddings` y sus políticas están listas, mediante `create_client_partitions`. Así se evita contar capacidad que todavía no existe.

### 3.5 Reconciliación de capacidad

```sql
UPDATE cells c
SET current_clients = (
    SELECT count(*)
    FROM client_routing r
    WHERE r.cell_id = c.id
      AND r.routing_status IN ('active', 'draining', 'readonly', 'maintenance', 'migrating')
)
WHERE c.current_clients <> (
    SELECT count(*)
    FROM client_routing r
    WHERE r.cell_id = c.id
      AND r.routing_status IN ('active', 'draining', 'readonly', 'maintenance', 'migrating')
);
```

La reconciliación se ejecuta periódicamente y deja auditoría del delta. Un contador que deriva hacia abajo libera capacidad inexistente; uno que deriva hacia arriba bloquea altas.

### 3.6 Separación futura del control plane

El Router Global se mantiene como plano de control mientras comparta instancia con la landing. La separación de `pg-control-plane` se evalúa cuando ocurra alguno de estos disparadores:

- La landing exige un objetivo de disponibilidad o latencia distinto del control plane.
- El volumen de auditoría, altas o cambios de plan degrada la latencia de la landing.
- Un requisito de cumplimiento o seguridad exige una frontera de datos separada.
- La landing necesita ciclos de deploy o restore independientes.

Mientras compartan instancia, la landing y el control usan esquemas y roles separados; la landing no escribe tablas de control. Si se separa, no se crean claves foráneas entre bases: la landing lee datos de control por API o por una vista de solo lectura, y el esquema de control se migra a `pg-control-plane`.

## 4. Enrutamiento

### 4.1 Jerarquía de resolución

| Nivel | Almacén | TTL | Uso |
|---|---|---|---|
| 1 | Caché local del proceso | 5–30 s | Camino caliente; se invalida por Pub/Sub |
| 2 | Caché compartida (Redis dedicado del plano de control) | 300 s | Compartida entre réplicas |
| 3 | Router Global | — | Fallback y fuente de verdad |

### 4.2 Contrato de sesión

El JWT o la sesión transporta:

```json
{
  "client_id": "019535d9-3df7-79fb-b466-fa907fa17f9e",
  "routing_version": 7
}
```

No transporta `cell_id`. Un `cell_id` embebido queda obsoleto en cuanto el inquilino migra. Si se necesita para diagnóstico, se resuelve en el servidor y se registra, no se firma en el token.

### 4.3 Invalidación

- Cada cambio de `client_routing` incrementa `routing_version`.
- El plano de control publica `routing:invalidate` con `client_id` y `routing_version`.
- La publicación y la suscripción usan el Redis dedicado del plano de control.
- Las cachés locales se suscriben y descartan la entrada. El TTL es un respaldo, no el mecanismo principal.
- Durante una migración, el estado `migrating` bloquea escrituras y fuerza la re-resolución. La ventana de cutover se mide; no se asume un valor fijo.

### 4.4 Connection manager

```typescript
interface CellRoute {
  clientId: string;
  cellId: string;
  pgbouncerHost: string;
  pgbouncerPort: number;
  databaseName: string;
  routingStatus: 'active' | 'readonly' | 'maintenance';
}

async function withClientContext<T>(
  route: CellRoute,
  work: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (route.routingStatus !== 'active') {
    throw new Error(`Acceso bloqueado para ${route.clientId}: ${route.routingStatus}`);
  }

  const pool = getPoolForCell(route);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.current_client_id', $1, true)",
      [route.clientId]
    );
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

Reglas:

- `SET LOCAL` o `set_config(..., true)` dentro de la transacción. Nunca `SET` de sesión: PgBouncer en modo transacción reutiliza conexiones y filtraría el contexto.
- Toda consulta de inquilino pasa por `withClientContext`.
- El pool se crea por celda y se reutiliza; no se abre una conexión por petición.
- Un estado distinto de `active` se rechaza antes de abrir la conexión.

## 5. Aislamiento: RLS, roles y PgBouncer

### 5.1 Roles

| Rol | Uso | Permisos |
|---|---|---|
| `mocter_migrator` | Migraciones y DDL | Propietario de tablas; puede `BYPASSRLS` o ejecutar como superusuario en la ventana de migración |
| `mocter_app` | Aplicación en ejecución | `SELECT`, `INSERT`, `UPDATE`, `DELETE`; sin DDL; sin `BYPASSRLS` |
| `mocter_readonly` | Reportes y diagnóstico | `SELECT`; sujeto a RLS |

La aplicación nunca corre como propietaria de las tablas. Si corre como propietaria, `FORCE ROW LEVEL SECURITY` evita el bypass, pero el rol de aplicación tampoco debe poder alterar el esquema.

### 5.2 Política de referencia

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_client_isolation ON products
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);
```

- `current_setting(..., true)` devuelve `NULL` si el parámetro no existe. `client_id = NULL` no es verdadero: la política falla cerrada.
- `FORCE` aplica también al propietario. El rol de migración necesita `BYPASSRLS` o ejecutar como superusuario.
- Las particiones llevan su propia política y su propio `FORCE`. No se depende solo de la política del padre.
- RLS no reemplaza el filtro `WHERE client_id = $1`; lo complementa.

En el Router Global, la misma política se aplica a las tablas hijas con `client_id` (`client_plan_overrides`, `chatwoot_accounts`, `organization_members`). Las tablas operativas (`cells`, `clients`, `client_routing`, `client_migrations`, `plans`, `plan_limits`, `media_catalog`) no llevan RLS de inquilino: se protegen con roles y permisos, y la administración filtra por `id` en la capa de aplicación. `clients` es la raíz del inquilino y no tiene `client_id`; su PK es `id`. El rol de administración puede tener `BYPASSRLS` para reportes globales; el rol de aplicación de inquilino no.

### 5.3 PgBouncer

| Parámetro | Valor | Motivo |
|---|---|---|
| `pool_mode` | `transaction` | Multiplexación y compatibilidad con `SET LOCAL` |
| `max_client_conn` | 2000 | Conexiones de aplicación |
| `default_pool_size` | 60 | Conexiones reales a PostgreSQL |
| `min_pool_size` | 10 | Calentamiento |
| `reserve_pool_size` | 15 | Picos |
| `reserve_pool_timeout` | 3 s | Espera máxima por una conexión reservada |
| `max_prepared_statements` | 200 | Prepared statements en modo transacción (PgBouncer 1.21+) |
| `query_wait_timeout` | 10 s | Evita colas infinitas |
| `server_idle_timeout` | 600 s | Libera conexiones ociosas |

### 5.4 Identidad global y usuarios de celda

La identidad de la plataforma (`users`, `identities`, `sessions` en el Router Global) es global: un usuario puede pertenecer a varias organizaciones o inquilinos y no tiene un `client_id` único. Por eso no usa RLS por `client_id`; se protege con un rol de autenticación dedicado y filtros de aplicación. Las tablas de membresía y tenencia (`organization_members`, `client_users`) sí llevan `client_id` y usan RLS.

La tabla `users` de cada celda (sección 6.1) es distinta: es la proyección de los usuarios que pertenecen al inquilino, lleva `client_id` y usa RLS. No es la tabla de identidad global.

## 6. Plano de datos: celdas

### 6.1 Esquema por celda

| Tabla | Particionada | Estrategia |
|---|---|---|
| `users` | No | `client_id` + índice compuesto + RLS |
| `roles` | No | `client_id` + índice compuesto + RLS |
| `settings` | No | `client_id` + índice compuesto + RLS |
| `products` | Sí | `PARTITION BY LIST (client_id)` |
| `client_media` | No | `client_id` + único `(client_id, media_id)` + RLS; archivo distinto por inquilino |
| `product_media` | No | `client_id` + índice compuesto + RLS; vínculo producto–archivo |
| `client_usage` | No | `client_id` + único `(client_id, dimension)` + RLS; contador autoritativo de consumo |
| `product_embeddings` | Sí | `PARTITION BY LIST (client_id)` |
| `audit_logs` | Sí, si el volumen lo justifica | `PARTITION BY LIST (client_id)` |

`products` se particiona porque es el candidato principal para vectorización; `product_embeddings` también. El resto de las tablas de inquilino no se particiona y se protege con RLS. Ese es el particionado híbrido: la normalización es lógica y el particionado es físico. `ADM-001` RF-05.2 ya coincide con esta decisión; no requiere enmienda por particionado.

### 6.2 Presupuesto de particiones

```text
particiones_totales = clientes_por_celda × tablas_particionadas
```

Con 100 clientes y dos tablas particionadas (`products` y `product_embeddings`), el total es 200. Si se suma `audit_logs`, son 300. El límite de 10.000 deja margen para crecer o para sumar tablas. La estrategia es `LIST`; al llegar a 100 clientes se abre una celda nueva, o antes si se cumple otro disparador de §9.3 (relaciones, HNSW o CPU). `HASH` queda como evaluación futura solo si el costo de más celdas o el volumen de particiones lo justifica; cambiar a `HASH` requiere rediseñar el ciclo de vida por tenant (baja y migración con `DELETE`/copia, no `DROP PARTITION`).

### 6.3 Particiones de productos y embeddings

`products` es el candidato principal para vectorización y se particiona por `client_id`. `product_embeddings` también. Las columnas de negocio de `products` se detallan en ADM-001; aquí se fija la clave de partición, la PK, un ejemplo de restricción única que incluye la clave de partición y la política de aislamiento.

```sql
CREATE TABLE products (
    id          uuid NOT NULL DEFAULT uuidv7(),
    client_id   uuid NOT NULL,
    name        text NOT NULL,
    slug        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, id),
    UNIQUE (client_id, slug)
) PARTITION BY LIST (client_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_client_isolation ON products
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);

CREATE TABLE product_embeddings (
    id             uuid NOT NULL DEFAULT uuidv7(),
    client_id      uuid NOT NULL,
    product_id     uuid NOT NULL,
    attribute_key  text NOT NULL,
    content        text NOT NULL,
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    embedding      vector(1536) NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, id),
    FOREIGN KEY (client_id, product_id) REFERENCES products (client_id, id)
) PARTITION BY LIST (client_id);

ALTER TABLE product_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_embeddings FORCE ROW LEVEL SECURITY;

CREATE POLICY product_embeddings_client_isolation ON product_embeddings
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);
```

La política del padre es la que aplica a las consultas que pasan por `product_embeddings`; las políticas de cada partición cubren el acceso directo a la partición. Ambas capas son necesarias. Lo mismo aplica a `products`.

La dimensión `1536` es un ejemplo. El contrato del modelo de embedding define la dimensión real; cambiarla exige reindexar. El ejemplo usa `vector(d)`; `halfvec(d)` queda como optimización opcional que se adopta solo después de medir recall y memoria con el modelo real.

La FK de `product_embeddings` a `products` es compuesta: `(client_id, product_id)`. `products` usa PK `(client_id, id)` porque está particionada; la FK referencia esa PK. No hace falta un `UNIQUE` adicional para la FK; el `UNIQUE (client_id, slug)` es una regla de negocio.

`products.client_id` no declara FK a `clients` porque `clients` vive en el Router Global; en la celda es una clave lógica. La FK de `product_embeddings` a `products` sí es física porque ambas viven en la celda.

En una tabla particionada por `client_id`, PostgreSQL exige que la clave de partición forme parte de la PK; por eso `products` y `product_embeddings` usan `(client_id, id)`. La directiva de PK `id` se mantiene en las tablas no particionadas. `client_id` no es una segunda PK: es la clave de tenencia que se copia de `clients.id`.

### 6.4 Creación de particiones

```sql
CREATE OR REPLACE FUNCTION create_client_product_partition(p_client_id uuid)
RETURNS void AS $$
DECLARE
    v_partition text := 'products_c_' || replace(p_client_id::text, '-', '');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF products FOR VALUES IN (%L)',
        v_partition, p_client_id
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_partition);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_partition);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_partition || '_client_isolation', v_partition);
    EXECUTE format(
        'CREATE POLICY %I ON %I USING (client_id = current_setting(''app.current_client_id'', true)::uuid) WITH CHECK (client_id = current_setting(''app.current_client_id'', true)::uuid)',
        v_partition || '_client_isolation', v_partition
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_client_embedding_partition(p_client_id uuid)
RETURNS void AS $$
DECLARE
    v_partition text := 'product_embeddings_c_' || replace(p_client_id::text, '-', '');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF product_embeddings FOR VALUES IN (%L)',
        v_partition, p_client_id
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_partition);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_partition);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_partition || '_client_isolation', v_partition);
    EXECUTE format(
        'CREATE POLICY %I ON %I USING (client_id = current_setting(''app.current_client_id'', true)::uuid) WITH CHECK (client_id = current_setting(''app.current_client_id'', true)::uuid)',
        v_partition || '_client_isolation', v_partition
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)',
        v_partition || '_hnsw_idx', v_partition
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING gin (metadata jsonb_path_ops)',
        v_partition || '_metadata_gin_idx', v_partition
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_client_partitions(p_client_id uuid)
RETURNS void AS $$
BEGIN
    PERFORM create_client_product_partition(p_client_id);
    PERFORM create_client_embedding_partition(p_client_id);
END;
$$ LANGUAGE plpgsql;
```

Reglas:

- Las funciones son propiedad de `mocter_migrator`; `mocter_app` no tiene `EXECUTE`.
- `create_client_partitions` es el punto de entrada de la saga de alta: crea las particiones de `products` y `product_embeddings` y sus políticas.
- `CREATE TABLE ... PARTITION OF` toma un lock sobre la tabla padre. Por eso la creación se hace en el alta o en una ventana controlada, no en el camino caliente.
- Para altas masivas se pre-crean particiones en lote.
- Si la creación de una partición falla, la saga de alta compensa y no activa el enrutamiento.

### 6.5 Cuota en el vínculo producto–archivo

El catálogo global (`media_catalog`) vive en el Router Global y no tiene `client_id`. La cuota se controla en la celda, en el momento de vincular un archivo a un producto. Para contar archivos distintos y no vínculos, la celda mantiene dos tablas de archivos y un contador:

| Tabla | Propósito | Restricción |
|---|---|---|
| `client_media` | Archivo distinto referenciado por el inquilino | Único `(client_id, media_id)`; `size_bytes` desnormalizado |
| `product_media` | Vínculo producto–archivo | Único `(client_id, product_id, media_id)` |
| `client_usage` | Contador autoritativo por dimensión | Único `(client_id, dimension)` |

```sql
CREATE TABLE client_media (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id    uuid NOT NULL,
    media_id     uuid NOT NULL,
    size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, media_id)
);

CREATE TABLE product_media (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id    uuid NOT NULL,
    product_id   uuid NOT NULL,
    media_id     uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, product_id, media_id),
    FOREIGN KEY (client_id, product_id) REFERENCES products (client_id, id),
    FOREIGN KEY (client_id, media_id) REFERENCES client_media (client_id, media_id)
);

CREATE TABLE client_usage (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id    uuid NOT NULL,
    dimension    text NOT NULL,
    used_value   bigint NOT NULL DEFAULT 0 CHECK (used_value >= 0),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, dimension)
);
```

`media_id` referencia `media_catalog.id` en el Router Global. No hay FK entre bases; la celda guarda el identificador y una copia de `size_bytes` para no consultar el plano de control en el camino caliente. El catálogo sigue siendo la fuente de verdad del tamaño; la copia se reconcilia.

#### Tope efectivo

La consulta se ejecuta en el plano de control. La celda cachea el resultado por `(client_id, dimension)` junto con `quota_version`; cuando la versión cambia, refresca. El `client_usage` que se bloquea en el vínculo es local a la celda. El plano de control incluye `quota_version` en el contexto de la petición; la celda compara con su caché y refresca si difiere.

```sql
WITH override AS (
    SELECT value
    FROM client_plan_overrides
    WHERE client_id = $1
      AND dimension = $2
      AND valid_from <= now()
      AND (valid_to IS NULL OR valid_to > now())
    ORDER BY valid_from DESC
    LIMIT 1
),
plan_cap AS (
    SELECT pl.value
    FROM clients c
    JOIN plan_limits pl ON pl.plan_id = c.plan_id
    WHERE c.id = $1
      AND pl.dimension = $2
)
SELECT
    COALESCE((SELECT value FROM override), (SELECT value FROM plan_cap), $3) AS cap,
    (SELECT quota_version FROM clients WHERE id = $1) AS quota_version;
```

El orden es override > plan > default. Si hay varios overrides vigentes, gana el de `valid_from` más reciente; la aplicación no decide por su cuenta.

#### Vínculo atómico

```sql
BEGIN;
SELECT set_config('app.current_client_id', $1, true);

INSERT INTO client_usage (client_id, dimension, used_value)
VALUES ($1, 'storage_bytes', 0)
ON CONFLICT (client_id, dimension) DO NOTHING;

SELECT used_value
INTO v_used
FROM client_usage
WHERE client_id = $1
  AND dimension = 'storage_bytes'
FOR UPDATE;

-- $cap es el tope efectivo cacheado; se refresca cuando cambia quota_version.
IF v_used + $new_size > $cap THEN
    RAISE EXCEPTION 'Cuota de almacenamiento excedida';
END IF;

INSERT INTO client_media (client_id, media_id, size_bytes)
VALUES ($1, $media_id, $new_size)
ON CONFLICT (client_id, media_id) DO NOTHING;

IF FOUND THEN
    UPDATE client_usage
    SET used_value = used_value + $new_size, updated_at = now()
    WHERE client_id = $1
      AND dimension = 'storage_bytes';
END IF;

INSERT INTO product_media (client_id, product_id, media_id)
VALUES ($1, $product_id, $media_id)
ON CONFLICT (client_id, product_id, media_id) DO NOTHING;

COMMIT;
```

Reglas:

- El lock sobre `client_usage` serializa los vínculos del mismo inquilino y evita la sobreventa.
- Si el archivo ya estaba referenciado por el inquilino (`client_media` existente), no se vuelve a cobrar; solo se agrega el vínculo al producto.
- Si el vínculo ya existía, no se duplica.
- La cuota se controla en el acto de vincular. Si un productor externo escribe en SeaweedFS sin pasar por este endpoint, la cuota es decorativa. N8N, si existe, debe usar la API; no tiene acceso directo a la base ni al bucket.
- El desvínculo elimina `product_media`; si no quedan vínculos para `(client_id, media_id)`, elimina `client_media` y decrementa `client_usage`. Usa el mismo lock sobre `client_usage` y la misma transacción para evitar carreras con un vínculo concurrente.
- El GC de producto verifica el catálogo global y las referencias de todas las celdas antes de borrar el objeto físico.

Las demás dimensiones usan el mismo contador `client_usage` y un chequeo atómico en su punto de alta: productos al crear el producto, usuarios al invitar, imágenes, audios, videos y PDF al vincular el archivo. `storage_bytes` es el caso detallado porque combina el catálogo global con el vínculo local.

Los adjuntos de conversación son otro dominio: viven en Chatwoot ActiveStorage, no se registran en `media_catalog`, no se cuentan en `client_usage` y el GC de producto no los toca. La única frontera es la API de Chatwoot.

#### Reconciliación

`client_usage` se puede reconstruir desde `client_media`:

```sql
UPDATE client_usage u
SET used_value = COALESCE((
    SELECT sum(cm.size_bytes)
    FROM client_media cm
    WHERE cm.client_id = u.client_id
), 0)
WHERE u.dimension = 'storage_bytes';
```

La reconciliación se ejecuta periódicamente y deja auditoría del delta. Para facturación global, un job agrega `client_usage` de cada celda; el control plane no mantiene un contador autoritativo duplicado.

## 7. Búsqueda vectorial

### 7.1 Índice HNSW

Punto de partida:

```sql
CREATE INDEX product_embeddings_c_<id>_hnsw_idx
ON product_embeddings_c_<id>
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

El ejemplo usa `vector(d)` y `vector_cosine_ops`. Si se adopta `halfvec(d)` después de medir recall, el operador cambia a `halfvec_cosine_ops`; el resto del diseño no cambia.

La memoria del índice se estima, no se asume:

```text
RAM_HNSW ≈ N_vectores × (bytes_por_vector + 8 × M) × 1.25
```

Para `vector(d)` el término del vector es `4 × d`; para `halfvec(d)` es `2 × d`. La fórmula es una estimación de dimensionamiento; se valida con `pg_relation_size` y con pruebas de recall sobre datos reales.

### 7.2 Consulta con filtros

```sql
BEGIN;
SELECT set_config('app.current_client_id', $1, true);
SET LOCAL hnsw.iterative_scan = relaxed_order;
SET LOCAL hnsw.ef_search = 60;

SELECT id, product_id, content, metadata,
       1 - (embedding <=> $2::vector(1536)) AS similarity
FROM product_embeddings
WHERE client_id = $1
  AND metadata @> '{"category": "legal"}'::jsonb
ORDER BY embedding <=> $2::vector(1536)
LIMIT 10;
COMMIT;
```

- El filtro `client_id` habilita el partition pruning.
- `hnsw.iterative_scan` evita el sub-fetching cuando hay filtros adicionales.
- `ef_search` se ajusta con recall medido; 60 es un punto de partida.

### 7.3 Salud del índice

```sql
SELECT
    schemaname,
    relname AS partition_table,
    indexrelname AS hnsw_index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    pg_relation_size(indexrelid) AS index_size_bytes,
    idx_scan AS total_vector_searches
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%_hnsw_idx'
ORDER BY pg_relation_size(indexrelid) DESC;
```

Si la suma de índices HNSW supera el 65% de la RAM de la celda, se dispara el escalado.

## 8. Perfiles de configuración

### 8.1 Memoria y conexiones

| Parámetro | `pg-cell` (8 GB) | `pg-chatwoot` (4 GB) | `pg-control-plane` (2 GB) |
|---|---|---|---|
| `shared_buffers` | 2560 MB | 1 GB | 512 MB |
| `effective_cache_size` | 6 GB | 3 GB | 1536 MB |
| `maintenance_work_mem` | 1 GB | 256 MB | 128 MB |
| `work_mem` | 24 MB | 8 MB | 4 MB |
| `max_connections` | 100 | 150 | 100 |
| `max_parallel_maintenance_workers` | 2 | 1 | 1 |
| `wal_compression` | `zstd` | `zstd` | `zstd` |
| `max_wal_size` | 4 GB | 2 GB | 1 GB |
| `checkpoint_completion_target` | 0.9 | 0.9 | 0.9 |
| `random_page_cost` | 1.1 | 1.1 | 1.1 |
| `autovacuum_vacuum_scale_factor` | 0.05 | 0.05 | 0.05 |
| `autovacuum_analyze_scale_factor` | 0.02 | 0.02 | 0.02 |
| `shm_size` (Docker) | 4 GB | 1 GB | 512 MB |

> **Cuidado con `maintenance_work_mem`.** En PostgreSQL es por operación de mantenimiento y los workers paralelos pueden multiplicarla. Con 8 GB de RAM, `1536 MB × 3` más `shared_buffers` puede agotar el contenedor. El perfil parte de 1 GB y 2 workers; se ajusta con medición.

### 8.2 Reglas de configuración

- `synchronous_commit` se mantiene en `on` en el plano de control y en las celdas. No se desactiva globalmente.
- Chatwoot conserva `synchronous_commit=on`: su base guarda conversaciones y configuraciones, no solo logs efímeros.
- `wal_compression=zstd` es válido en PostgreSQL 18.
- `huge_pages=try` es opcional; en Docker puede no estar disponible.
- `enable_partition_pruning` se mantiene en `on`.
- El `shm_size` de Docker es obligatorio para índices HNSW y workers paralelos.

## 9. Operación

### 9.1 Backup y restore

El destino, la retención y la frecuencia de prueba se fijan en CD-001. DAT-001 exige que el backup sea S3 compatible, offsite, cifrado, versionado y con restore probado. La tabla siguiente es una propuesta inicial, no una decisión cerrada.

| Instancia | Frecuencia | Retención | Destino |
|---|---|---|---|
| `pg-control-plane` | Diaria + WAL | 30 días | S3 compatible |
| `pg-cell-*` | Diaria + WAL | 14 días | S3 compatible |
| `pg-chatwoot` | Diaria + WAL | 14 días | S3 compatible |

- El restore se prueba al menos una vez por trimestre.
- El backup de una celda no incluye el catálogo global; el catálogo vive en el control plane.
- El backup de Chatwoot no se restaura dentro de la base de Mocter.

### 9.2 Observabilidad

| Métrica | Fuente | Umbral |
|---|---|---|
| Conexiones activas / pool | PgBouncer, PostgreSQL | > 80% sostenido |
| Tamaño de índices HNSW | `pg_stat_user_indexes` | > 65% de RAM |
| Particiones por instancia | `pg_class` | > 8.000 relaciones |
| Hit rate de caché de enrutamiento | Aplicación | < 90% |
| Errores de enrutamiento | Aplicación | > 0.1% |
| Lag de migración | Réplica lógica | > 0 bytes en cutover |
| CPU P95 | Host | > 70% sostenido |
| Espacio libre | Host | < 20% |

### 9.3 Disparadores de escalado

Se abre una celda nueva y la actual pasa a `draining` cuando se cumple cualquiera de estas condiciones:

1. 100 inquilinos en la celda.
2. 8.000 relaciones en `pg_class`.
3. Índices HNSW que superan el 65% de la RAM.
4. CPU P95 sostenida por encima del 70% en horas pico.

La capacidad nominal es 100 inquilinos; la efectiva es el primero de estos disparadores que se cumpla. HNSW puede reducirla según el modelo y la dimensión reales.

### 9.4 Migración de un inquilino entre celdas

1. **Inicio**: `client_routing.routing_status='migrating'`, incremento de `routing_version`, publicación de invalidación.
2. **Copia inicial**: replicación lógica de las particiones del inquilino y de las filas filtradas por `client_id` en tablas no particionadas.
3. **Cutover**: pausa de escrituras, espera de lag cero, actualización de `cell_id`, `routing_status='active'`, incremento de `routing_version`, publicación de invalidación.
4. **Limpieza**: drop de las particiones de `products` y `product_embeddings` de origen, decremento del contador de origen, incremento del destino, auditoría en `client_migrations`.

La ventana de cutover se mide con el volumen real. No se promete un valor fijo. La invalidación de cachés locales debe ser síncrona o verificable; un TTL de 30 s no alcanza para un cutover de 2–5 s.

### 9.5 Secretos

- Las credenciales de base, Redis y S3 no se versionan.
- En Docker se usan secretos o variables inyectadas por el entorno; no `.env` reales en el repositorio.
- El rol de aplicación y el de migración tienen credenciales distintas.
- La rotación de credenciales se documenta y se prueba.

### 9.6 Kubernetes y CloudNativePG

Queda como evolución futura. El mapeo previsto es:

| Docker Compose | Kubernetes / CNPG |
|---|---|
| `pg-cell-*` | `Cluster` de CloudNativePG |
| `pgbouncer-cell-*` | `Pooler` de CNPG |
| Volumen local | `storageClass` con IOPS dedicadas |
| Backup a S3 | `barmanObjectStore` |

No se implementa en esta versión. La paridad lógica se mantiene para no refactorizar la aplicación.

### 9.7 Rollback de Chatwoot sobre PostgreSQL 18

La ejecución de Chatwoot 4.19.0 sobre PostgreSQL 18 + pgvector está validada en laboratorio. El rollback es una precaución operativa; no es el camino esperado. Se ejecuta solo si ocurre uno de estos disparadores:

- Una migración de Chatwoot falla y no se puede reparar en la ventana de mantenimiento.
- Una consulta o extensión de Chatwoot es incompatible con PostgreSQL 18 y bloquea el servicio.
- Se detecta corrupción o pérdida de datos atribuible a la versión.
- La degradación de rendimiento es severa y no se corrige con configuración.

Procedimiento:

1. **Preparación**: verificar el backup más reciente de `pg-chatwoot` y la imagen anterior de Chatwoot compatible con PostgreSQL 16. Registrar digests y versiones.
2. **Mantenimiento**: activar modo mantenimiento; detener web, workers y Sidekiq; confirmar que no hay escrituras.
3. **Backup final**: ejecutar un `pg_dump` lógico adicional y conservar el volumen de PostgreSQL 18. No borrar la instancia fallida.
4. **Vuelta a PostgreSQL 16**: levantar `pg-chatwoot` con PostgreSQL 16 (volumen anterior o instancia limpia) y restaurar el dump.
5. **Imagen anterior**: desplegar la imagen de Chatwoot compatible con PostgreSQL 16; ejecutar las migraciones que correspondan a esa versión.
6. **Verificación**: health check, login, envío y recepción de mensajes, cola de Sidekiq, adjuntos y SSO.
7. **Cierre**: monitorear errores, documentar el incidente y preservar PostgreSQL 18 y sus logs para diagnóstico.

RPO: se pierden los mensajes y cambios posteriores al último backup verificado. RTO: el de la ventana de restore y verificación. El procedimiento se ensaya en laboratorio con un dump real antes de usarlo en producción.

## 10. Frontera con N8N

N8N es un orquestador externo. Esta especificación **no** define:

- Su base de datos ni su esquema.
- Su cola, sus workers ni su alta disponibilidad.
- Su correlación con inquilinos.
- Sus credenciales o su ciclo de vida.

La única frontera es la API de Mocter. Si N8N produce archivos, lo hace por el endpoint de ingesta; si consume eventos, lo hace por la API o por un webhook. Cualquier necesidad de persistencia propia de N8N pertenece a otra especificación y a otro dueño.

## 11. Alineación con las especificaciones existentes

| Spec | Cambio necesario | Estado |
|---|---|---|
| ADM-001 | RF-04, RF-07 y RF-10 alineados; O-07 cerrada con la fórmula de almacenamiento facturado; O-13 a O-16 abiertas | Alineado (T-12) |
| AUTH-001 | A-03 resuelta con el Redis dedicado del plano de control; identidad global con rol dedicado y filtros; RLS solo en tablas de tenencia (O-03); A-02, A-04 y A-05 siguen abiertas | Alineado (T-13) |
| CHW-001 | Redis 7+, Sidekiq y PostgreSQL 18 validado en laboratorio; T-13 consume DAT-001 | Pendiente (T-14) |
| Directiva de base de datos | `clients.id` como PK y `client_id` como FK; `products` y `product_embeddings` particionadas; el resto con RLS | Alineado en este documento |

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Chatwoot sobre PostgreSQL 18 no soportado oficialmente | Fallo en despliegue o comportamiento inesperado | Laboratorio realizado: 4.19.0 funciona y las migraciones pasaron; rollback como precaución operativa, procedimiento en §9.7 |
| `maintenance_work_mem` multiplicada por workers | OOM en la celda | Perfil conservador, medición y ajuste |
| `CREATE TABLE ... PARTITION OF` en el camino caliente | Lock y bloqueo de consultas | Alta como saga, pre-creación y ventana controlada |
| Caché local obsoleta durante migración | Lecturas o escrituras en la celda equivocada | `routing_version` + invalidación por Pub/Sub; TTL como respaldo |
| `halfvec` con recall insuficiente | Búsqueda degradada | Medir recall antes de adoptar; mantener `vector` como fallback |
| Contador de capacidad con deriva | Altas rechazadas o sobreventa | Reconciliación periódica y auditoría |
| RLS mal configurado | Fuga entre inquilinos | `FORCE`, políticas en particiones, pruebas de aislamiento y rol de aplicación sin bypass |
| Catálogo global como cuello de botella | Latencia en el camino caliente | Desnormalizar `storage_pool_id`, `storage_key` y `size_bytes` en el vínculo de la celda |
| Backup no probado | Pérdida de datos | Restore trimestral documentado |

# DAT-001 · Diseño · Arquitectura de datos multi-inquilino basada en celdas

| Atributo | Valor |
|---|---|
| ID | DAT-001 |
| Versión | 1.2 |
| Estado | Aprobada |
| Fecha | 2026-10-20 · actualizado 2026-10-27 |
| Depende de | [`requirements.md`](requirements.md) |
| Relacionado | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/requirements.md) |

## 1. Principio rector

**Tres planos, una clave de tenencia, cero claves foráneas cruzadas.**

```text
                         ┌──────────────────────────────────────────┐
                         │   PLANO DE SOPORTE AISLADO (SINGLETON)   │
                         │  Instancias Únicas para toda la Plataforma│
                         │  Chatwoot (multi-account) · Redis 7+     │
                         │  pg-chatwoot (PostgreSQL 18 + pgvector)  │
                         │  n8n (orquestador único de flujos)       │
                         │  pg-n8n (PostgreSQL 18 dedicado)         │
                         └────────────────────┬─────────────────────┘
                                              │ APIs y Webhooks (sin acceso directo a BD)
                                              │
┌─────────────────────────────────────────────┴──────────┐
│              PLANO DE CONTROL GLOBAL                   │
│  Router Global · Landing · mocter-admin Global         │
│  pg-control-plane (PostgreSQL 18 + pgvector)           │
│  clients · plans · client_routing · media_catalog      │
│  billing (BILL-001) · referrals (REF-001)              │
│  communities & community_members (módulo transversal)  │
│  Redis 7+ (dedicado: routing, Pub/Sub, rate limit)     │
└─────────────────────────────┬──────────────────────────┘
                              │ client_id → cell_id (enrutamiento de borde)
                              │ routing_version
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     CELDA AUTÓNOMA 01           │   │     CELDA AUTÓNOMA N            │
│  ┌───────────────────────────┐  │   │  ┌───────────────────────────┐  │
│  │ Capa de Aplicación        │  │   │  │ Capa de Aplicación        │  │
│  │ (mocter-admin Inquilino)  │  │   │  │ (mocter-admin Inquilino)  │  │
│  └─────────────┬─────────────┘  │   │  └─────────────┬─────────────┘  │
│                ▼                │   │                ▼                │
│  PgBouncer (modo transaction)   │   │  PgBouncer (modo transaction)   │
│  pg-cell-01 (PG18 + pgvector)   │   │  pg-cell-N (PG18 + pgvector)    │
│  - 3 particiones: contacts,     │   │  - 3 particiones: contacts,     │
│    product_embeddings,          │   │    product_embeddings,          │
│    contact_memories (halfvec)   │   │    contact_memories (halfvec)   │
│  - Compartidas: products, users,│   │  - Compartidas: products, users,│
│    orders, audit_logs (RLS)     │   │    orders, audit_logs (RLS)     │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

Reglas del principio rector:

1. `client_id` es la única clave de tenencia. No se usa `tenant_id`.
2. La entidad inquilino es `clients.id` (UUIDv7). Las tablas hijas la referencian como `client_id`.
3. **Celda Autónoma (Data Plane):** Cada celda agrupa entre 50 y 100 inquilinos e incluye **tanto la base de datos (`pg-cell-XX` + PgBouncer en modo `transaction`) como su capa de aplicación (Backend/Admin del inquilino)** para evitar cuellos de botella en el router global.
4. **Control Plane Global (`pg-control-plane`):** Aloja el enrutador de celdas (`client_id -> cell_id`), facturación (`BILL-001`), referidos (`REF-001`) y el **módulo de Comunidades (Líderes y Members)**, permitiendo que inquilinos alojados en distintas celdas pertenezcan a una misma comunidad y se comuniquen transversalmente.
5. **Plano de Soporte Aislado (Instancias Únicas Globales):** Chatwoot (`pg-chatwoot`) y n8n (`pg-n8n`) son **instancias únicas de plataforma compartidas por todos los inquilinos** (no se duplican por celda ni por inquilino). Chatwoot aísla lógicamente mediante `Account` y mantiene su propia base de datos; n8n mantiene su base `pg-n8n`. Los mensajes y notificaciones omnicanal viven en la base de datos de Chatwoot, no en la celda. n8n interactúa por REST API/webhooks y nunca accede directamente a las bases celulares ni de control.
6. **Regla de Particionamiento en Celda (Solo 3 Tablas):** Se particionan mediante `PARTITION BY LIST (client_id)` + RLS únicamente: `contacts`, `product_embeddings` y `contact_memories`.
7. **Tablas No Particionadas (Esquema Compartido + RLS Forzado):** `products`, `users`, `audit_logs`, `orders`, `roles` y `configs` no se particionan; usan PK compuesta o índice B-Tree liderado por `client_id`, `FORCE ROW LEVEL SECURITY` e inyección de contexto por transacción con `SELECT set_config('app.current_client_id', $client_id, true)`.
8. Chatwoot conserva `account_id` y su propio esquema. La correlación vive en una tabla de Mocter.
9. No hay claves foráneas entre bases. Las referencias son identificadores.

## 2. Topología

| Plano | Componentes | Motor | Responsabilidad |
|---|---|---|---|
| Soporte Aislado (Singleton Global) | Chatwoot web (multi-account), workers/Sidekiq, Redis 7+, `pg-chatwoot`, n8n (instancia única), `pg-n8n` | PostgreSQL 18 + pgvector (Chatwoot); PostgreSQL 18 (n8n) | Instancias únicas compartidas transversalmente por todos los inquilinos: conversaciones omnicanal, mensajes, adjuntos operativos, SSO y orquestación de flujos externos |
| Control Global | Router Global, landing, `mocter-admin` global, Redis 7+ dedicado, `pg-control-plane` | PostgreSQL 18 + pgvector | Inquilinos, enrutamiento `client_id -> cell_id`, planes, facturación, referidos, módulo de Comunidades y catálogo multimedia |
| Datos (Celdas Autónomas) | Capa de aplicación del inquilino (`mocter-admin`), PgBouncer (transaction mode), `pg-cell-XX` | PostgreSQL 18 + pgvector (50-100 inquilinos por celda) | Aplicación del inquilino, contactos particionados, embeddings de producto (`halfvec(1536)`), memorias de contacto (`profile`/`episode`), catálogo de productos, pedidos y usuarios |

### 2.1 Aislamiento

- **Chatwoot y n8n son instancias únicas de plataforma (singleton / shared multi-tenant):** No se replica una instancia de Chatwoot ni de n8n por celda ni por inquilino. Todos los inquilinos de todas las celdas comparten la misma instancia de Chatwoot (aislados lógicamente por su `chatwoot_account_id`) y la misma instancia de n8n (aislados lógicamente por credenciales y scopes de API).
- Cada plano tiene su propia instancia PostgreSQL (`pg-chatwoot`, `pg-n8n`, `pg-control-plane`, `pg-cell-XX`). No se comparte una instancia entre planos.
- El plano de control tiene su propia instancia Redis 7+, separada de la de Chatwoot. No comparten instancia, credenciales ni política de evicción.
- Cada celda autónoma agrupa su propia capa de aplicación, su propio PgBouncer multiplexor y su propia base de datos.
- Chatwoot y n8n no acceden a la base de las celdas ni del plano de control; Mocter no accede a las bases de soporte directamente. Todo se canaliza por APIs y webhooks seguros.
- n8n, como orquestador externo, interactúa exclusivamente por REST API y webhooks; no comparte base, esquema ni credenciales con Mocter.

### 2.2 Versiones

| Componente | Versión | Nota |
|---|---|---|
| PostgreSQL | 18 | Todas las instancias, incluida Chatwoot |
| pgvector | 0.8+ | Versión incluida en `pgvector/pgvector:pg18`, validada en laboratorio |
| Chatwoot | 4.19.1 | Fijado por CHW-001 |
| Redis | 7+ | Chatwoot y plano de control (instancias separadas) |
| Node.js | 24 | Runtime de `mocter-admin` y la landing |

> **Versión canónica 4.19.1.** La validación de laboratorio de 4.19.1 se registra en T-01A/T-17/T-18; la evidencia previa de 4.19.0 se conserva. Se mantiene el rollback como precaución operativa; su procedimiento está en §9.7.

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
| `plans` | Catálogo de planes | `id` (uuidv7), `code`, `name` JSONB `{es,en}`, `description` JSONB `{es,en}`, `status` (`draft`/`active`/`retired`), `is_public`, `is_popular`, `sort_order`, `trial_days`, `grace_days`, `billing_cycles` JSONB, `price_monthly_cents`, `price_annual_cents`, `currency`, `marketing_features` JSONB `{es,en}`, `created_at`, `updated_at` |
| `plan_limits` | Topes por plan | `id`, `plan_id`, `dimension`, `value`, `created_at` |
| `client_plan_overrides` | Topes negociados | `id`, `client_id`, `dimension`, `value`, `valid_from`, `valid_to`, `negotiated_by`, `updated_by`, `created_at`, `updated_at` |
| `media_catalog` | Catálogo global de archivos | `id`, `content_hash` (bytes almacenados o URL externa), `storage_pool_id`, `storage_key`, `size_bytes`, `media_kind`, `mime_type`, `source_format`, `original_filename`, `width`, `height`, `duration_ms`, `processing_status`, `storage_type`, `source_url`, `provider`, `created_at` |
| `chatwoot_accounts` | Correlación con Chatwoot | `id`, `client_id`, `chatwoot_account_id`, `state`, `idempotency_key`, `last_error`, `synced_at` |
| `communities` | Módulo de Comunidades | `id`, `code`, `name`, `leader_client_id`, `description`, `status`, `created_at`, `updated_at` |
| `community_members` | Membresías de comunidad | `id`, `community_id`, `client_id`, `role`, `joined_at` |

Reglas:

- `clients.id` es la PK del inquilino y se expone como `client_id` en las tablas hijas. Las tablas hijas no generan un `client_id` nuevo: copian el valor de `clients.id`. En el plano de control es una FK física; en las celdas es una clave lógica porque no hay FK entre bases. En tablas particionadas, la PK es `(client_id, id)`; en las no particionadas, la PK es `id` o `(client_id, id)`.
- `client_routing.client_id` es único.
- `chatwoot_accounts.client_id` es único; `chatwoot_accounts.chatwoot_account_id` es único.
- **Módulo de Comunidades transversal:** `communities` y `community_members` residen exclusivamente en el plano de control (`pg-control-plane`). El `leader_client_id` y los `client_id` de los miembros son FK físicas a `clients(id)`. Esto permite que inquilinos alojados en distintas celdas autónomas pertenezcan a la misma comunidad y se comuniquen transversalmente sin requerir consultas distribuidas ni enlaces directos entre bases celulares.
- `media_catalog` tiene unicidad por `(content_hash, storage_pool_id)` y no tiene `client_id` ni atributos de negocio. `content_hash` corresponde a los bytes almacenados: original de imagen/audio/PDF, canónico de video o URL normalizada en externos. `storage_pool_id` referencia un pool de almacenamiento (SeaweedFS) definido en la implementación; su catálogo no se detalla en esta spec.
- `media_catalog` no guarda URLs públicas de entrega. La capa de aplicación resuelve `storage_key` a una URL firmada de imgproxy; SeaweedFS v4.51 e imgproxy v4.0.20 son servicios de plataforma ya aprovisionados. SeaweedFS S3 permanece en la red interna y no recibe tráfico del navegador. Las variantes de imagen se generan al vuelo y no se registran en `media_variants`.
- **Producción actual (2026-10-27):** los adjuntos de Chatwoot están en el volumen local de Chatwoot, no en `media_catalog` ni en SeaweedFS. Si se activa ActiveStorage S3-compatible, el bucket debe ser separado y quedar fuera de la cuota de producto. Inventario observado: [`docs/reference/production-services.md`](../../reference/production-services.md).
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
    id                    uuid PRIMARY KEY DEFAULT uuidv7(),
    code                  text NOT NULL UNIQUE,
    name                  jsonb NOT NULL,
    description           jsonb,
    status                text NOT NULL DEFAULT 'draft',
    is_public             boolean NOT NULL DEFAULT false,
    is_popular            boolean NOT NULL DEFAULT false,
    sort_order            integer NOT NULL DEFAULT 0,
    trial_days            integer NOT NULL DEFAULT 14,
    grace_days            integer NOT NULL DEFAULT 7,
    billing_cycles        jsonb NOT NULL DEFAULT '["monthly","annual"]'::jsonb,
    price_monthly_cents   bigint NOT NULL DEFAULT 0,
    price_annual_cents    bigint NOT NULL DEFAULT 0,
    currency              char(3) NOT NULL DEFAULT 'COP',
    marketing_features    jsonb NOT NULL DEFAULT '{"es":[],"en":[]}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plans_status_check CHECK (status IN ('draft', 'active', 'retired'))
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

CREATE TABLE communities (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    code              text NOT NULL UNIQUE,
    name              text NOT NULL,
    leader_client_id  uuid NOT NULL REFERENCES clients(id),
    description       text,
    status            text NOT NULL DEFAULT 'active',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communities_status_check CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE TABLE community_members (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    community_id    uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    role            text NOT NULL DEFAULT 'member',
    joined_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (community_id, client_id),
    CONSTRAINT community_members_role_check CHECK (role IN ('leader', 'member', 'moderator'))
);
```

Los comentarios `COMMENT ON TABLE` y `COMMENT ON COLUMN` se agregan en la migración SQL, conforme a la directiva.

### 3.4 Alta de un inquilino

El alta cruza dos bases, así que no puede ser una única transacción. Se modela como saga con compensación:

1. **Plano de control**: insertar `clients` con `lifecycle_status='alta'` y `client_routing` con `routing_status='pending'`; reservar la celda con `FOR UPDATE SKIP LOCKED`.
2. **Celda**: crear las 3 particiones (`contacts`, `product_embeddings`, `contact_memories`) y sus políticas con `create_client_partitions` (operación privilegiada).
3. **Plano de control**: activar `client_routing.routing_status='active'`, incrementar `cells.current_clients` y registrar la versión de enrutamiento.
4. **Fallo**: marcar `client_routing.routing_status='failed'`, registrar el error y ejecutar la compensación (drop de las 3 particiones, decremento del contador si se había incrementado).

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

La reserva de celda no incrementa `current_clients`; el incremento ocurre cuando la celda confirma que las 3 particiones (`contacts`, `product_embeddings`, `contact_memories`) y sus políticas están listas, mediante `create_client_partitions`. Así se evita contar capacidad que todavía no existe.

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

El formato del token no cambia el contrato: la sesión de servidor y el JWT de API resuelven `client_id` y `routing_version`, y ninguno fija un `cell_id` permanente.

```text
Cookie del panel: __Host-mocter_sid=<sid opaco>
Registro sessions: { sid_hash, user_id, client_id, routing_version, expires_at, last_seen_at, revoked_at }
JWT de API: { sub, client_id, routing_version, scope, jti, exp }
```

La cookie solo transporta el `sid`; el `client_id` y el `routing_version` viven en el registro de sesión del servidor. El JWT de API los lleva en sus claims. Un `cell_id` embebido queda obsoleto en cuanto el inquilino migra. Si se necesita para diagnóstico, se resuelve en el servidor y se registra, no se firma en el token.

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

La identidad de la plataforma se organiza en dos niveles: el Router Global conserva el ancla y directorio de enrutamiento (`users`, `sessions` en el Router Global) de forma global sin RLS por `client_id`, guardando `active_client_id` nullable como puntero de membresía única y `identity_location` apuntando a la celda asignada (o a `router` exclusivamente para operadores corporativos de Mocter). El Router no almacena contraseñas ni secretos de clientes.

Las credenciales (`password_hash`), secretos TOTP, identidades OAuth y membresías (`tenant_users`) de todos los inquilinos viven en la celda asignada (compartida o dedicada) bajo PostgreSQL con RLS parametrizado por `client_id` (`SET LOCAL app.current_client_id`). Un usuario tiene como máximo una membresía activa; `users.active_client_id` en el Router es el guardián global de esa regla (AUTH-D-01, ADM-001 D-12).

## 6. Plano de datos: celdas

### 6.1 Esquema por celda

| Tabla | Particionada | Estrategia |
|---|---|---|
| `contacts` | Sí (1 de 3) | `PARTITION BY LIST (client_id)` + RLS; leads multicanal (WhatsApp, Web, Correo) de crecimiento exponencial |
| `product_embeddings` | Sí (2 de 3) | `PARTITION BY LIST (client_id)` + RLS + `halfvec(1536)` + HNSW; desacoplada de `products` para re-indexación asíncrona |
| `contact_memories` | Sí (3 de 3) | `PARTITION BY LIST (client_id)` + RLS + `halfvec(1536)` + HNSW + `memory_type`; desacoplada de `contacts` |
| `products` | No | Esquema compartido con `client_id`, PK `id`, índices B-Tree liderados por `client_id` y `FORCE RLS` (óptimo para 1.000 a 5.000+ productos por comercio) |
| `users` | No | Esquema compartido con `client_id`, índices compuestos y `FORCE RLS` (volumen bajo y altamente cacheable) |
| `tenant_users` | No | Esquema compartido con `client_id`, índice `(client_id, user_id)` y `FORCE RLS` |
| `roles` | No | Esquema compartido con `client_id`, índices compuestos y `FORCE RLS` |
| `settings` | No | Esquema compartido con `client_id`, índices compuestos y `FORCE RLS` |
| `orders` | No | Esquema compartido con `client_id`, índices compuestos y `FORCE RLS` |
| `audit_logs` | No | Esquema compartido con `client_id`, índices compuestos y `FORCE RLS` |
| `client_media` | No | Esquema compartido con `client_id`, único `(client_id, media_id)` y `FORCE RLS` |
| `product_media` | No | Esquema compartido con `client_id`, índice compuesto y `FORCE RLS` |
| `client_usage` | No | Esquema compartido con `client_id`, único `(client_id, dimension)` y `FORCE RLS` |

**Regla de Particionamiento Selectivo (Exactamente 3 Tablas):**
1. `contacts`: Por crecimiento exponencial de leads multicanal (WhatsApp, Web, Correo).
2. `product_embeddings`: Separada de `products` para que actualizaciones frecuentes de stock o precio no ensucien el índice vectorial HNSW, permitiendo múltiples fragmentos (*chunks*) por producto y re-indexación asíncrona usando `halfvec(1536)`.
3. `contact_memories`: Separada de `contacts` para evitar que actualizaciones operativas (`last_seen_at`, etiquetas, estado) degraden el índice HNSW.

**Tablas No Particionadas (Esquema Compartido + RLS Forzado):**
- `products` (Catálogo transaccional): No se particiona (incluso catálogos de 1.000 a 5.000+ productos por comercio operan de forma óptima con índices B-Tree).
- `users` (Usuarios del inquilino): No se particiona (el volumen de administradores, agentes y operadores por comercio es bajo y de acceso altamente cacheable).
- `audit_logs` y tablas operativas (`orders`, `roles`, `configs`): No se particionan por ser de volumen moderado o de consulta no recurrente.
- **Reglas obligatorias:** Llave primaria compuesta o `id` + índice B-Tree liderado por `client_id`, `FORCE ROW LEVEL SECURITY` e inyección de contexto por transacción con `SELECT set_config('app.current_client_id', $client_id, true)`.

### 6.2 Presupuesto de particiones

```text
particiones_totales = clientes_por_celda × 3 tablas_particionadas
```

Con la capacidad nominal de 100 clientes y exactamente 3 tablas particionadas (`contacts`, `product_embeddings` y `contact_memories`), el total es **exactamente 300 particiones físicas por celda**. Este valor se sitúa holgadamente por debajo del límite operativo de 10.000 relaciones en `pg_class`, eliminando la sobrecarga en el planificador de PostgreSQL y garantizando alta velocidad en migraciones y respaldos.

### 6.3 DDL en PostgreSQL 18 para Catálogo, Contactos y Vectores

```sql
-- 1. Catálogo transaccional (No particionado, compartido con RLS forzado)
CREATE TABLE products (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    client_id   uuid NOT NULL,
    name        text NOT NULL,
    slug        text NOT NULL,
    price_cents bigint NOT NULL DEFAULT 0,
    stock       integer NOT NULL DEFAULT 0,
    status      text NOT NULL DEFAULT 'active',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, slug),
    CONSTRAINT products_status_check CHECK (status IN ('active', 'draft', 'archived'))
);

CREATE INDEX products_client_id_idx ON products (client_id);
CREATE INDEX products_client_status_idx ON products (client_id, status);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY products_client_isolation ON products
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);

-- 2. Embeddings de producto (Particionada por client_id, halfvec(1536))
CREATE TABLE product_embeddings (
    id             uuid NOT NULL DEFAULT uuidv7(),
    client_id      uuid NOT NULL,
    product_id     uuid NOT NULL,
    chunk_index    integer NOT NULL DEFAULT 0,
    attribute_key  text NOT NULL,
    content        text NOT NULL,
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    embedding      halfvec(1536) NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, id),
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) PARTITION BY LIST (client_id);

ALTER TABLE product_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_embeddings FORCE ROW LEVEL SECURITY;

CREATE POLICY product_embeddings_client_isolation ON product_embeddings
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);

-- 3. Contactos y leads multicanal (Particionada por client_id)
CREATE TABLE contacts (
    id                  uuid NOT NULL DEFAULT uuidv7(),
    client_id           uuid NOT NULL,
    full_name           text NOT NULL,
    phone_mobile        text,
    email               text,
    document_type       text,
    document_number     text,
    channel             text NOT NULL DEFAULT 'whatsapp',
    chatwoot_contact_id text,
    stage               text NOT NULL DEFAULT 'new',
    tags                jsonb NOT NULL DEFAULT '[]'::jsonb,
    first_contacted_at  timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, id),
    CONSTRAINT contacts_channel_check CHECK (channel IN ('whatsapp', 'web', 'email', 'manual', 'other')),
    CONSTRAINT contacts_stage_check CHECK (stage IN ('new', 'in_conversation', 'qualified', 'customer', 'discarded'))
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY contacts_client_isolation ON contacts
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);

-- 4. Memorias y perfilamiento de contactos (Particionada por client_id, halfvec(1536))
CREATE TABLE contact_memories (
    id             uuid NOT NULL DEFAULT uuidv7(),
    client_id      uuid NOT NULL,
    contact_id     uuid NOT NULL,
    memory_type    text NOT NULL,
    content        text NOT NULL,
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    embedding      halfvec(1536) NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, id),
    FOREIGN KEY (client_id, contact_id) REFERENCES contacts (client_id, id) ON DELETE CASCADE,
    CONSTRAINT contact_memories_type_check CHECK (memory_type IN ('profile', 'episode'))
);

ALTER TABLE contact_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_memories FORCE ROW LEVEL SECURITY;

CREATE POLICY contact_memories_client_isolation ON contact_memories
    USING (client_id = current_setting('app.current_client_id', true)::uuid)
    WITH CHECK (client_id = current_setting('app.current_client_id', true)::uuid);
```

### 6.4 Funciones de aprovisionamiento automático de las 3 particiones

```sql
CREATE OR REPLACE FUNCTION create_client_contact_partition(p_client_id uuid)
RETURNS void AS $$
DECLARE
    v_partition text := 'contacts_c_' || replace(p_client_id::text, '-', '');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF contacts FOR VALUES IN (%L)',
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
        'CREATE INDEX IF NOT EXISTS %I ON %I (phone_mobile) WHERE (phone_mobile IS NOT NULL)',
        v_partition || '_phone_idx', v_partition
    );
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (lower(email)) WHERE (email IS NOT NULL)',
        v_partition || '_email_idx', v_partition
    );
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (chatwoot_contact_id) WHERE (chatwoot_contact_id IS NOT NULL)',
        v_partition || '_chatwoot_id_idx', v_partition
    );
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (stage, last_seen_at DESC)',
        v_partition || '_stage_seen_idx', v_partition
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

    -- Índice vectorial HNSW cuantizado con halfvec_cosine_ops
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)',
        v_partition || '_hnsw_idx', v_partition
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (product_id, chunk_index)',
        v_partition || '_product_chunk_idx', v_partition
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING gin (metadata jsonb_path_ops)',
        v_partition || '_metadata_gin_idx', v_partition
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_client_memory_partition(p_client_id uuid)
RETURNS void AS $$
DECLARE
    v_partition text := 'contact_memories_c_' || replace(p_client_id::text, '-', '');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF contact_memories FOR VALUES IN (%L)',
        v_partition, p_client_id
    );

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_partition);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', v_partition);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', v_partition || '_client_isolation', v_partition);
    EXECUTE format(
        'CREATE POLICY %I ON %I USING (client_id = current_setting(''app.current_client_id'', true)::uuid) WITH CHECK (client_id = current_setting(''app.current_client_id'', true)::uuid)',
        v_partition || '_client_isolation', v_partition
    );

    -- Índice vectorial HNSW con halfvec_cosine_ops para memorias
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)',
        v_partition || '_hnsw_idx', v_partition
    );

    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (contact_id, memory_type)',
        v_partition || '_contact_type_idx', v_partition
    );

    -- Restricción UNIQUE parcial para asegurar exactamente 1 profile por contacto
    EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (contact_id) WHERE (memory_type = ''profile'')',
        v_partition || '_single_profile_idx', v_partition
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
    PERFORM create_client_contact_partition(p_client_id);
    PERFORM create_client_embedding_partition(p_client_id);
    PERFORM create_client_memory_partition(p_client_id);
END;
$$ LANGUAGE plpgsql;
```

Reglas:

- Las funciones son propiedad de `mocter_migrator`; `mocter_app` no tiene permisos `EXECUTE`.
- `create_client_partitions` es el punto de entrada de la saga de alta: crea exactamente las 3 particiones (`contacts`, `product_embeddings`, `contact_memories`) y sus políticas de aislamiento.
- `CREATE TABLE ... PARTITION OF` toma un lock exclusivo breve sobre la tabla padre; la creación se ejecuta en el alta o en una ventana controlada, nunca en el camino caliente de atención.
- Si la creación de cualquiera de las 3 particiones falla, la saga de alta compensa ejecutando DROP y marcando el enrutamiento como fallido.

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
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
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

### 6.6 Diseño de Perfilamiento y Memoria (`contact_memories`)

La tabla `contact_memories` implementa la memoria continua de largo plazo para los agentes de IA y la hiper-segmentación de clientes en la celda del inquilino, mediante índices HNSW locales cuantizados con `halfvec(1536)` y segregación estricta por `memory_type`:

1. **`profile` (Ficha viva evolutiva 1:1 por contacto):**
   - Resumen estructurado de preferencias, objeciones, presupuesto estimado, restricciones y gustos del contacto.
   - Se actualiza mediante `UPSERT` sobre el índice parcial único `(contact_id) WHERE (memory_type = 'profile')`.
   - Permite cruce inverso vectorial contra `product_embeddings`: encontrar qué productos del catálogo satisfacen mejor el perfil del contacto para campañas de reactivación y venta cruzada.
2. **`episode` (Memoria episódica 1:N por contacto):**
   - Resúmenes cortos y factuales generados de forma asíncrona tras hitos clave (resolución de conversación en Chatwoot, confirmación o entrega de un pedido en ORD-001).
   - Otorga contexto histórico continuo a los agentes y al bot conversacional (BOT-001/BOT-002) en turnos futuros.

### 6.7 Flujo asíncrono de consolidación y consultas RAG híbridas

```text
Chatwoot / ORD-001               Worker Asíncrono (LLM)                  PostgreSQL 18 (pg-cell)
┌──────────────────────┐        ┌─────────────────────────┐             ┌─────────────────────────┐
│ Webhook:             ├───────►│ Genera resumen episódico│────────────►│ INSERT INTO             │
│ conversation_resolved│        │ y extrae perfil clave   │             │ contact_memories        │
│ o order_completed    │        │ Genera embedding        │             │ (episode / UPSERT       │
└──────────────────────┘        │ halfvec(1536)           │             │  profile)               │
                                └─────────────────────────┘             └─────────────────────────┘
```

#### Consulta RAG híbrida (Profile + Episodios Relevantes)

Al componer el contexto conversacional del bot (BOT-002), se ejecuta una única consulta con `UNION ALL` que recupera la ficha viva `profile` (si existe) y los 3 episodios pasados con mayor similitud semántica con la consulta actual:

```sql
BEGIN;
SELECT set_config('app.current_client_id', $1, true);
SET LOCAL hnsw.iterative_scan = relaxed_order;
SET LOCAL hnsw.ef_search = 40;

(
    -- 1. Ficha viva de perfil del contacto (1:1)
    SELECT id, contact_id, memory_type, content, metadata, 1.0 AS relevance_score
    FROM contact_memories
    WHERE client_id = $1
      AND contact_id = $2
      AND memory_type = 'profile'
    LIMIT 1
)
UNION ALL
(
    -- 2. Top 3 episodios más relevantes por distancia coseno (1:N)
    SELECT id, contact_id, memory_type, content, metadata,
           1 - (embedding <=> $3::halfvec(1536)) AS relevance_score
    FROM contact_memories
    WHERE client_id = $1
      AND contact_id = $2
      AND memory_type = 'episode'
    ORDER BY embedding <=> $3::halfvec(1536)
    LIMIT 3
);
COMMIT;
```

### 6.8 Separación de migraciones Drizzle

Para evitar acoplamientos, respetar la inmutabilidad de migraciones ya versionadas (`AGENTS.md` R-09) y garantizar despliegues independientes e idempotentes por plano (`ADM-001 T-04`):
- `packages/domain/drizzle/` (`drizzle.config.ts`, `migrate.mjs --target=control-plane`): Línea del **Control Plane (Router Global)** (`cells`, `clients`, `client_routing`, `plans`, `client_plans`, `users`, `identities`, `sessions`, tokens, `user_consents`, `communities`, `community_members`, `media_catalog`).
- `packages/domain/drizzle-cell/` (`drizzle.cell.config.ts`, `migrate.mjs --target=cell`): Línea independiente del **Cell Data Plane (`pg-cell-XX`)** (`admin.users` y `admin.identities` con PK compuesta `(client_id, id)` y `FORCE ROW LEVEL SECURITY`, `contacts`, `product_embeddings`, `contact_memories`, `products`, `tenant_users`, `orders`, `client_media`, `client_usage`). No comparte tabla ni historial de migraciones con el Router Global.

### 6.9 Verification Gate: Test automatizado en CI/CD para aislamiento RLS

Como requisito no negociable de calidad y seguridad multi-inquilino, el pipeline de CI/CD (`.github/workflows/ci.yml`) ejecuta un test de intrusión cruzada (*cross-tenant intrusion test*):
1. Crea dos inquilinos de prueba (`client_alpha` y `client_beta`) en una base de celda de pruebas.
2. Inserta productos, contactos y memorias para ambos inquilinos.
3. Con una conexión con rol `mocter_app` (sin privilegios de superusuario ni `BYPASSRLS`):
   - Fija `SET LOCAL app.current_client_id = client_alpha`.
   - Ejecuta `SELECT count(*) FROM contacts WHERE client_id = client_beta`.
   - Verifica estrictamente que el resultado sea `0` filas (aislamiento cerrado).
   - Intenta insertar una fila para `client_beta` con contexto de `client_alpha` y valida que falle la restricción `WITH CHECK` de la política RLS.

## 7. Búsqueda vectorial

La composición de `content` la gobierna `vectorization_config` (ADM-001 RF-05.7), administrada por la plataforma en el Router Global; el pipeline de cada celda la lee por API. El default vectoriza nombre, descripción, categoría y marca; el prompt de venta queda fuera. El ejemplo de §7.2 usa `content` ya compuesto con esa regla.

### 7.1 Índice HNSW con halfvec(1536)

Punto de partida con cuantización de 16 bits en coma flotante (`halfvec`):

```sql
CREATE INDEX product_embeddings_c_<id>_hnsw_idx
ON product_embeddings_c_<id>
USING hnsw (embedding halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

La adopción de `halfvec(1536)` reduce la memoria del índice en un 50% frente a `vector(1536)` manteniendo recall > 99%.

La memoria del índice se estima:

```text
RAM_HNSW ≈ N_vectores × (bytes_por_vector + 8 × M) × 1.25
```

Para `halfvec(1536)` el término del vector es `2 × 1536 = 3072 bytes`. Con `M=16`, cada vector requiere aproximadamente `3.072 + 128 = 3.200 bytes × 1.25 ≈ 4.000 bytes` en memoria RAM.

### 7.2 Consulta con filtros

```sql
BEGIN;
SELECT set_config('app.current_client_id', $1, true);
SET LOCAL hnsw.iterative_scan = relaxed_order;
SET LOCAL hnsw.ef_search = 60;

SELECT id, product_id, content, metadata,
       1 - (embedding <=> $2::halfvec(1536)) AS similarity
FROM product_embeddings
WHERE client_id = $1
  AND metadata @> '{"category": "legal"}'::jsonb
ORDER BY embedding <=> $2::halfvec(1536)
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

El destino, la retención y la frecuencia de prueba se fijan en OPS-001; la continuidad no está en el alcance de CD-001. DAT-001 exige que el backup sea S3 compatible, offsite, cifrado, versionado y con restore probado. La tabla siguiente es orientativa; la política autoritativa es la de OPS-001.

| Instancia | Frecuencia | Retención | Destino |
|---|---|---|---|
| `pg-portal` (Router Global; hoy comparte base con la landing) | Diaria + WAL | 30 días | S3 compatible |
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
4. **Limpieza**: drop de las 3 particiones de origen (`contacts`, `product_embeddings` y `contact_memories`), decremento del contador de origen, incremento del destino, auditoría en `client_migrations`.

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

La ejecución de Chatwoot 4.19.1 sobre PostgreSQL 18 + pgvector se valida en T-01A/T-17/T-18; la evidencia previa de 4.19.0 se conserva. El rollback es una precaución operativa; no es el camino esperado. Se ejecuta solo si ocurre uno de estos disparadores:

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
| ADM-001 | RF-04, RF-07 y RF-10 alineados; O-07 cerrada con la fórmula de almacenamiento facturado; O-13 a O-16 cerradas | Alineado (T-12) |
| AUTH-001 | A-03 resuelta con el Redis dedicado del plano de control; identidad global con rol dedicado y filtros; RLS solo en tablas de tenencia (O-03); A-04 cerrada con `tenant_users`; A-05 cerrada con sesión opaca de servidor y JWT solo para APIs; membresía 1:0..1 con `users.active_client_id` | Alineado (T-16); nombre canónico `tenant_users` |
| CHW-001 | Redis 7+, Sidekiq y PostgreSQL 18 validado en laboratorio; T-13 consume DAT-001 | Alineado (T-14) |
| Directiva de base de datos | `clients.id` como PK y `client_id` como FK; `contacts`, `product_embeddings` y `contact_memories` particionadas; `products`, `users` y operativas compartidas con RLS | Alineado en este documento |

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Chatwoot sobre PostgreSQL 18 no soportado oficialmente | Fallo en despliegue o comportamiento inesperado | Validación de 4.19.1 en T-01A/T-17/T-18; 4.19.0 validado previamente; rollback como precaución operativa, procedimiento en §9.7 |
| `maintenance_work_mem` multiplicada por workers | OOM en la celda | Perfil conservador, medición y ajuste |
| `CREATE TABLE ... PARTITION OF` en el camino caliente | Lock y bloqueo de consultas | Alta como saga, pre-creación y ventana controlada |
| Caché local obsoleta durante migración | Lecturas o escrituras en la celda equivocada | `routing_version` + invalidación por Pub/Sub; TTL como respaldo |
| `halfvec` con recall insuficiente | Búsqueda degradada | Medir recall antes de adoptar; mantener `vector` como fallback |
| Contador de capacidad con deriva | Altas rechazadas o sobreventa | Reconciliación periódica y auditoría |
| RLS mal configurado | Fuga entre inquilinos | `FORCE`, políticas en particiones, pruebas de aislamiento y rol de aplicación sin bypass |
| Catálogo global como cuello de botella | Latencia en el camino caliente | Desnormalizar `storage_pool_id`, `storage_key` y `size_bytes` en el vínculo de la celda |
| Backup no probado | Pérdida de datos | Restore trimestral documentado |

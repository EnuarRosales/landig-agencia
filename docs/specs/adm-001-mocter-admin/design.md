# ADM-001 · Diseño · mocter-admin — núcleo administrativo de inquilinos

| Atributo | Valor |
|---|---|
| ID | ADM-001 |
| Versión | 1.0 |
| Fecha | 2026-10-21 · actualizado 2026-10-22 |
| Depende de | [`requirements.md`](requirements.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [OPS-001](../ops-001-operacion-continuidad-observabilidad/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Una sola puerta de entrada.** El inquilino inicia sesión en `mocter-admin` y desde ahí accede a todo, incluido Chatwoot. Chatwoot es el motor de conversaciones, no el panel administrativo.
2. **El plano de control no conoce el negocio.** El Router Global sabe quién es el inquilino, dónde vive y qué plan tiene; no sabe cuántos productos vende ni qué conversaciones tiene.
3. **La comunidad es global; el negocio es local.** Organizaciones, feed y publicaciones de productos compartidos cruzan celdas y viven en el Router Global. Productos, archivos vinculados y usuarios del inquilino viven en su celda.
4. **Todo inquilino tiene dueño.** No existe inquilino sin `owner_user_id`; el alta manual no puede dejar un tenant huérfano.
5. **La privacidad es consentimiento, no oscuridad.** El liderazgo ve métricas y los datos que el inquilino decide compartir; nunca chats, clientes ni datos operativos.
6. **La sincronización es del miembro, no del origen.** El clon es propiedad de quien lo copia; el origen notifica, no impone.
7. **La interfaz se mide por la acción principal.** Lo que no sirve a la acción no se muestra; la densidad de Chatwoot no se reproduce.
8. **Todo límite se valida antes de persistir.** Un exceso se rechaza con mensaje explícito; no se corrige después.

> **Cómo leer este documento.** §2 a §4 ubican la aplicación y sus módulos. §5 a §12 explican el modelo de datos y los flujos. §13 a §15 cubren interfaz, seguridad y operación. §16 lista lo que falta verificar en laboratorio. §17 traza cada sección a los requisitos.

## 2. Contexto y límites

| Documento | Qué fija | Qué deja a ADM-001 |
|---|---|---|
| CHW-001 | Doble autoridad de tenencia, correlación `client_id` ↔ cuenta de Chatwoot, token de servicio por inquilino, sin enterprise. | Aprovisionamiento, SSO, estado y reintentos. |
| DAT-001 | Router Global, celdas, límite de 100 inquilinos por celda, RLS, particionado de productos, migraciones por base. | Cómo se aprovisiona una celda y cómo se enruta una consulta. |
| AUTH-001 | Identidad global, ancla de correo, Google/Facebook, TOTP, sesión opaca de servidor (Redis/Postgres), identidad en celda dedicada. | Cómo se resuelve la ubicación antes del login y cómo se vincula el dueño. |
| OPS-001 | Respaldo pgBackRest a R2, RPO/RTO, observabilidad off-host. | Jobs de retención y archivo legal; nada de backups. |

**Fuera de alcance:** operar conversaciones, modificar el esquema de Chatwoot, habilitar enterprise, mensajería privada entre miembros y la landing pública.

## 3. Arquitectura general

```text
                    ┌──────────────────────────────┐
                    │  Navegador (inquilino/admin) │
                    └──────────────┬───────────────┘
                                   │ HTTPS
                    ┌──────────────▼───────────────┐
                    │        Traefik               │
                    │  admin.mocter… / landing     │
                    └───────┬──────────────┬───────┘
                            │              │
                 ┌──────────▼──────┐  ┌────▼─────────────┐
                 │  mocter-admin   │  │  landing pública │
                 │  (apps/admin)   │  │  (apps/web)      │
                 └───┬───┬───┬─────┘  └────┬─────────────┘
                     │   │   │             │ INSERT solicitudes
                     │   │   └─────────────┼──────────────┐
                     │   │                 │              │
        ┌────────────▼┐  │      ┌──────────▼───────────┐  │
        │ Router      │  │      │  Celda N             │  │
        │ Global      │  │      │  pg-celdaN           │  │
        │ schema admin│  │      │  schema admin        │  │
        │ users       │  │      │  products (part.)    │  │
        │ clients     │  │      │  product_media       │  │
        │ organiz.    │  │      │  tenant_users (RLS)  │  │
        │ feed        │  │      └──────────┬───────────┘  │
        │ shares      │  │                 │              │
        │media_catalog│  │                 │              │
        └──────┬──────┘  │                 │              │
               │         │                 │              │
        ┌──────▼──────┐  │      ┌──────────▼───────────┐  │
        │ Redis 7+    │  └─────►│ Chatwoot API         │  │
        │ sesión/caché│         │ accounts · users     │  │
        └─────────────┘         │ SSO · service token  │  │
                                └──────────────────────┘  │
                                                           │
        ┌──────────────────────────────────────────────────▼─┐
        │ SeaweedFS (multimedia de producto) · R2 (archivo legal) │
        └────────────────────────────────────────────────────┘
```

| Componente | Dónde corre | Función |
|---|---|---|
| `apps/admin` | Contenedor propio, detrás de Traefik | Interfaz y API de administración |
| Router Global | PostgreSQL del plano de control | Identidad, tenencia, planes, comunidades, feed, publicaciones de productos, `media_catalog` |
| Celdas | PostgreSQL independientes | Productos, embeddings, vínculos y cuota de archivos, proyección de usuarios |
| Redis 7+ | Plano de control | Rate limiting, revocación de sesión y caché de enrutamiento (AUTH-D-02) |
| Chatwoot | Plano de soporte | Conversaciones, cuentas, SSO |
| SeaweedFS | Almacenamiento de objetos | Multimedia de producto, deduplicada por hash |
| R2 | Externo | Archivo legal cifrado; backups de OPS-001 |

**Decisión de diseño aprobada (D-30):** las comunidades, el feed y las publicaciones de producto viven en el Router Global porque cruzan celdas; los productos, embeddings, vínculos y cuota de archivos, y la proyección de usuarios del inquilino quedan en la celda. El producto compartido no se mueve: se copia desde la celda de origen a la celda del adoptante por API, sin FK entre celdas (RF-10.8). Aprobada el 2026-10-21.

## 4. Módulos de `mocter-admin`

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `identity` | Ancla de identidad, sesión, Google/Facebook, TOTP, SSO a Chatwoot | AUTH-001, Redis |
| `tenancy` | `clients`, `owner_user_id`, ciclo de vida, enrutamiento | Router Global |
| `onboarding` | Asistente guiado, alta orgánica, invitaciones | `identity`, `tenancy` |
| `plans` | Planes, límites, validación previa a persistir | Router Global |
| `chatwoot` | Aprovisionamiento, correlación, token de servicio, reintentos | Chatwoot API |
| `catalog` | Productos, atributos, embeddings | Celda |
| `cloning` | Propuestas, adopciones, versiones, sincronización, notificaciones | `catalog`, Router Global |
| `files` | Catálogo global, SeaweedFS, GC por última referencia | Router Global + celdas |
| `communities` | Organizaciones, membresías, admisión, feed, moderación, métricas | Router Global + celdas |
| `ui` | i18n, temas, marca blanca, componentes | — |
| `operations` | Retención, archivo legal, auditoría | Chatwoot API, R2 |

`mocter-core` es un módulo de dominio dentro de `apps/admin`, no un servicio aparte (D-24). Expone contactos, roles y permisos al resto de los módulos; no tiene despliegue ni base propia.

## 5. Modelo de datos

Todas las tablas llevan las columnas de auditoría de la directiva de base de datos: `created_at`, `updated_at`, `created_by`, `updated_by`, más `deleted_at` y `deleted_by` donde aplica soft delete. Las columnas de ciclo de vida ya documentadas no se duplican: `clients.lifecycle_status`, `sessions.revoked_at`, `consumed_at` de los tokens y `tenant_users.left_at` cumplen el rol de borrado lógico (DAT-001 RF-10.9).

### 5.1 Router Global — schema `admin`

| Tabla | Clave | Notas |
|---|---|---|
| `users` | `id` | Ancla global: `email` único, `email_verified_at`, `identity_location` (`router` o `cell_id`), `active_client_id` nullable con `ON DELETE SET NULL`; un usuario tiene como máximo una membresía activa |
| `cells` | `id` | `code`, `tier`, `status`, `pgbouncer_host`, `pgbouncer_port`, `database_name`, `max_clients`, `current_clients`, `region` |
| `clients` | `id` | `owner_user_id` no nulo y único entre clientes no dados de baja, `contact_email`, `phone` (E.164, contacto comercial), `website_url`, `display_name`, `slug`, `lifecycle_status`, `plan_id`, `quota_version`, `locale` (`es` por defecto; conjunto inicial `es`/`en` validado por la aplicación), `currency` (ISO 4217, por defecto `COP` para la operación inicial en Colombia; editable en el onboarding), `tax_id`, `country`/`state`/`city`/`address_line`/`postal_code`, `industry`, `timezone` (por defecto `America/Bogota`), `logo_media_id`, `social_links` JSONB; el `tenant_owner` activo se materializa en `tenant_users` |
| `client_routing` | `client_id` | `cell_id`, `identity_location`; caché en Redis |
| `client_migrations` | `id` | `client_id`, `source_cell_id`, `target_cell_id`, `state`, `started_at`, `completed_at` |
| `plans` | `id` | `code`, `name`, `description`, `price`, `currency`, `is_public`, `trial_days`, `grace_days`, `status` (`active`/`retired`), `sort_order`, `billing_cycles` JSONB |
| `plan_limits` | `(plan_id, dimension)` | Productos, `max_tenant_agents` (`tenant_owner` fijo en 1), imágenes, audios, videos, PDF, retención, bytes |
| `client_plan_overrides` | `id` | `client_id`, `dimension`, `value`, `valid_from`, `valid_to`, `negotiated_by`, `updated_by` |
| `client_plans` | `id` | Historial de asignaciones: `client_id`, `plan_id`, `valid_from`, `valid_to`, `source` (`manual` o `self_service`), `assigned_by_user_id`; el plan vigente se refleja en `clients.plan_id` |
| `plan_dimensions` | `key` | Catálogo de dimensiones numéricas: etiqueta es/en, unidad, tipo, mínimo, máximo y valor por defecto |
| `plan_features` | `key` | Catálogo de capacidades: etiqueta es/en, tipo (`boolean`/`enum`), opciones y descripción |
| `plan_feature_values` | `(plan_id, feature_key)` | `enabled`, `value` JSONB (nivel o parámetro de la capacidad) |
| `client_feature_overrides` | `id` | `client_id`, `feature_key`, `value`, `valid_from/to`, `negotiated_by`, `updated_by` |
| `organizations` | `id` | `originator_client_id`, `name`, `moderation_mode` (`pre`, `post`, `none`) |
| `organization_members` | `id` | `organization_id`, `client_id`, `role` (`originator`, `co_leader`, `member`), `status`, `joined_at`, `left_at` |
| `organization_invitations` | `id` | `organization_id`, `email`, `invited_by`, `status`, `token`, `expires_at` |
| `organization_join_requests` | `id` | `organization_id`, `client_id`, `status`, `decided_by`, `decided_at` |
| `organization_promotions` | `id` | `organization_id`, `target_client_id`, `promoted_by_client_id`, `status`, `accepted_by_user_id`, `created_at`, `decided_at` |
| `client_sharing_profiles` | `client_id` | Hereda `display_name`, `contact_email` y `phone` de `clients`; el inquilino administra solo la visibilidad por campo |
| `product_shares` | `id` | `organization_id`, `sharer_client_id`, `created_by_user_id`, `source_product_id`, `source_cell_id`, `current_version`, `status` |
| `product_share_versions` | `(share_id, version)` | `changed_attributes`, `created_at` |
| `product_adoptions` | `id` | `share_id`, `adopter_client_id`, `created_by_user_id`, `clone_product_id`, `clone_cell_id`, `adopted_version`, `link_active` |
| `clone_sync_policies` | `(adoption_id, attribute_key)` | `auto_sync` booleano |
| `sync_runs` | `id` | `adoption_id`, `version`, `mode`, `attributes`, `status`, `error` |
| `outbox_events` | `id` | `aggregate_type`, `aggregate_id`, `event_type`, `idempotency_key`, `status`, `attempts`, `available_at`, `created_at` |
| `feed_posts` | `id` | `organization_id`, `author_client_id`, `author_user_id`, `body`, `status`, `published_at` |
| `feed_moderation_events` | `id` | `post_id`, `actor_client_id`, `actor_user_id`, `action`, `reason`, `created_at` |
| `notifications` | `id` | `client_id`, `type`, `payload`, `read_at` |
| `media_catalog` | `id` | `content_hash` (bytes canónicos o hash de la URL externa), `storage_pool_id`, `storage_key`, `size_bytes`, `media_kind`, `mime_type`, `source_format`, `original_filename`, `width`, `height`, `duration_ms`, `processing_status`, `storage_type` (`internal`/`external`), `source_url` (https, solo external), `provider` (código del allowlist); sin `client_id` |
| `media_variants` | `(media_id, variant_code)` | Variantes derivadas (`thumbnail`, `preview`) con ficha propia (`storage_pool_id`, `storage_key`, `size_bytes`, `width`, `height`, `mime_type`); en el Router Global |
| `external_media_providers` | `code` | Plataformas admisibles para enlaces externos: `code` (youtube, tiktok, vimeo, instagram, facebook), `labels` JSONB `{es,en}`, `url_pattern`, `embeddable`, `is_admissible`, `sort_order` |
| `chatwoot_accounts` | `client_id` | `chatwoot_account_id`, `state`, `idempotency_key`, `last_error`, `synced_at` |
| `vectorization_config` | `attribute_key` | Qué atributos del producto componen el texto que se vectoriza: `attribute_key`, `enabled`, `position`; administrada y versionada por la plataforma (RF-05.7, §9.0) |
| `audit_log` | `id` | Actor, acción, entidad, fecha; sin contenido de negocio |

### 5.2 Celdas — schema `admin`

| Tabla | Clave | Notas |
|---|---|---|
| `tenant_users` | `id` | Objeto de negocio del inquilino: `client_id`, `user_id`, `role` (`tenant_owner` o `tenant_agent`), `status`, `invited_by`, `joined_at`, `left_at`; RLS. Un solo vínculo activo por `user_id`; el historial se conserva con una fila nueva por reingreso. La unicidad global se refuerza con `users.active_client_id`. |
| `users` | `id` | Proyección local del usuario: `client_id`, `email`, `status`; RLS. No es el ancla global (AUTH-D-01). |
| `client_media` | `id` | `client_id`, `media_id`, `size_bytes`; único `(client_id, media_id)`; RLS. Referencia distinta del inquilino al catálogo global |
| `client_usage` | `id` | `client_id`, `dimension`, `used_value`; único `(client_id, dimension)`; RLS. Contador autoritativo de consumo |
| `products` | `(client_id, id)` | `PARTITION BY LIST (client_id)`; atributos ERP y de feed en §9.0; `source_share_id`, `source_version` para clones |
| `product_embeddings` | `(client_id, product_id)` | Particionada igual que `products` |
| `product_media` | `(client_id, product_id, media_id)` | Vínculo producto-archivo con `alt_text`; único `(client_id, product_id, media_id)`; RLS |
| `tenant_labels` | `id` | Espejo de las etiquetas de Chatwoot con propiedad del inquilino: `chatwoot_label_id` (único por inquilino), `title`, `description`, `color`, `show_on_sidebar`, `origin` (`chatwoot_default`/`chatwoot_custom`/`mocter_custom`/`mocter_default`), `state`, `synced_at`; RLS y soft delete |
| `client_business_info` | `client_id` (1:1) | Contexto de atención: `payment_methods` JSONB, `returns_policy`, `warranty_policy`, `shipping_policy` JSONB (envío gratis y costo por defecto), `order_message`, `faqs` JSONB; RLS |
| `shipping_carriers` | `id` | `client_id`, `name`, `is_active`, `sort_order`; RLS |
| `delivery_groups` | `id` | `client_id`, `name`, `code`; agrupa productos por tiempo de entrega |
| `delivery_rules` | `id` | `client_id`, `delivery_group_id`, `city` (nulo = resto del país), `min_business_days`, `max_business_days`, `same_day`; RLS |
| `product_price_tiers` | `(client_id, product_id, min_qty)` | `price_cents`, `is_recommended`; escalones de cantidad (1/2/3) |
| `product_faqs` | `id` | `client_id`, `product_id` nullable (nulo = general), `question`, `answer`, `keywords` JSONB; RLS |

Toda tabla de inquilino lleva `client_id` no nulo, índice compuesto que empieza por esa columna y RLS forzado (RF-01.5, RF-10.11). `products` y `product_embeddings` se particionan; el resto no (RF-10.12).

### 5.3 Índices que sostienen las reglas

```sql
-- Una sola comunidad activa por inquilino (RF-08.3).
CREATE UNIQUE INDEX organization_members_one_active
  ON organization_members (client_id)
  WHERE status = 'active';

-- Un solo originador activo por comunidad.
CREATE UNIQUE INDEX organization_members_one_originator
  ON organization_members (organization_id)
  WHERE role = 'originator' AND status = 'active';

-- Una promoción pendiente por inquilino y comunidad.
CREATE UNIQUE INDEX organization_promotions_one_pending
  ON organization_promotions (organization_id, target_client_id)
  WHERE status = 'pending';

-- Un solo tenant_owner activo por inquilino.
CREATE UNIQUE INDEX tenant_users_one_owner
  ON tenant_users (client_id)
  WHERE role = 'tenant_owner' AND status = 'active';

-- Historial de membresías por inquilino y usuario.
CREATE INDEX tenant_users_by_client_user
  ON tenant_users (client_id, user_id);

-- Un solo vínculo activo por usuario en la celda; la unicidad global se refuerza con users.active_client_id.
CREATE UNIQUE INDEX tenant_users_one_active_membership
  ON tenant_users (user_id)
  WHERE status = 'active';

-- Un archivo distinto por inquilino.
CREATE UNIQUE INDEX client_media_one_per_client
  ON client_media (client_id, media_id);

-- Un vínculo por producto y archivo.
CREATE UNIQUE INDEX product_media_one_per_product
  ON product_media (client_id, product_id, media_id);

-- Un contador por dimensión.
CREATE UNIQUE INDEX client_usage_one_per_dimension
  ON client_usage (client_id, dimension);

-- Un solo inquilino no dado de baja por dueño.
CREATE UNIQUE INDEX clients_one_live_owner
  ON clients (owner_user_id)
  WHERE lifecycle_status <> 'deleted';

-- Un producto compartido una vez por comunidad.
CREATE UNIQUE INDEX product_shares_one_active
  ON product_shares (organization_id, source_product_id, source_cell_id)
  WHERE status = 'active';

-- Una adopción por publicación y adoptante.
CREATE UNIQUE INDEX product_adoptions_one_per_client
  ON product_adoptions (share_id, adopter_client_id);

-- Una política por atributo y adopción.
CREATE UNIQUE INDEX clone_sync_policies_one_per_attribute
  ON clone_sync_policies (adoption_id, attribute_key);

-- Un evento de outbox por clave de idempotencia.
CREATE UNIQUE INDEX outbox_events_one_idempotency
  ON outbox_events (idempotency_key);
```

**Decisión de diseño:** el historial de membresías no se borra. Salir marca `status = 'left'` y `left_at`; reingresar crea una fila nueva. El índice parcial solo cubre el vínculo activo, de modo que el reingreso no choca con el historial (RF-08.5).

## 6. Identidad y alta

### 6.1 Ancla de identidad

`users` es el ancla global: correo único, `identity_location` y `active_client_id` nullable. El puntero `active_client_id` garantiza una sola membresía activa por usuario; se anula al salir del inquilino o al dar de baja el inquilino. El inquilino referencia a su dueño por `clients.owner_user_id`; desde esa relación se recuperan correo, roles y permisos (D-29). No hay índice HMAC ni tabla de enrutamiento de identidad separada.

| Caso | Dónde viven las credenciales | Cómo se resuelve el login |
|---|---|---|
| Inquilino en Router | Router Global | `users.email` → verificación en Router |
| Celda dedicada por aislamiento | Celda | `users.email` → `identity_location` → verificación en la celda |

En la celda dedicada, el Router conserva el correo y el puntero, no las credenciales ni el secreto TOTP (AUTH-D-01).

### 6.2 Alta orgánica

1. El usuario se registra con Google o con correo y contraseña.
2. Google se considera verificado; el correo manual queda pendiente hasta la confirmación (RF-14.6).
3. Con la identidad verificada, se ejecuta el asistente guiado: datos del negocio, plan, preferencias.
4. Antes de crear el cliente se verifica que el usuario no tenga `active_client_id` ni sea dueño de un cliente no dado de baja; si ya tiene membresía o negocio, el alta se rechaza.
5. Al completar el asistente se crea el `client` con `owner_user_id`, la fila `tenant_users` del `tenant_owner` y se enruta a una celda. `users.active_client_id` apunta a ese `client_id`.
6. El inquilino opera sin comunidad hasta que `platform_admin` le asigna el rol de líder. El onboarding no crea comunidades ni autoasigna liderazgo (RF-08.1).

El inquilino no existe antes de que el negocio esté configurado. El avance del asistente se guarda por usuario y, cuando existe, por inquilino (RF-14.4).

### 6.3 Alta manual

El gestor de ventas (`platform_sales`) crea el inquilino y, en la misma operación, el usuario dueño. Si el correo ya existe, se vincula la identidad existente sin duplicarla (AUTH-001); si no existe, se crea. La operación falla si no hay `owner_user_id` (RF-01.6, D-29) o si el usuario ya tiene un `active_client_id` distinto: no se puede asignar a un segundo inquilino. La reserva del `active_client_id` y la creación de `tenant_users` se hacen en la misma saga; si la celda falla, se compensa el puntero. En la misma operación se asigna el plan del catálogo; el `tenant_owner` queda único y sin `tenant_agent` hasta que lo invite.

### 6.4 Invitaciones

La invitación es un canal alternativo para sumarse a un inquilino existente. Se usa para fidelización y para que el `tenant_owner` vincule miembros (RF-14.7). El invitado entra como `tenant_agent`; el `tenant_owner` es único y no se invita. La invitación se rechaza si el usuario ya tiene una membresía activa en otro inquilino. La reserva del `active_client_id` se hace con un `UPDATE users SET active_client_id = :client_id WHERE id = :user_id AND active_client_id IS NULL`; si no afecta una fila, la invitación se rechaza. La fila `tenant_users` se crea después y se compensa si falla. A diferencia de la solicitud de unión a una comunidad, la invitación a un inquilino no crea comunidad: solo membresía de usuario.

## 7. Tenencia y celdas

- `client_id` es UUIDv7, originado en `clients.id` y copiado en las tablas hijas.
- `client_routing` indica la celda y la ubicación de identidad; se cachea en Redis con TTL corto.
- Toda consulta de datos de inquilino resuelve primero la celda (RF-10.7). Sin resolución previa no se consulta una celda.
- Cada celda admite 100 inquilinos nominales; el primer disparador de DAT-001 (inquilinos, relaciones, HNSW o CPU) abre una nueva (RF-10.5, RF-10.15).
- Las celdas comparten esquema y una línea de migración; el Router tiene su propia línea (RF-10.9, RF-10.10).
- Las referencias entre planos son identificadores; no hay FK entre Router y celda ni entre celdas (RF-10.8).

**Aprovisionamiento de celda:** crear la instancia, ejecutar la línea de migraciones, registrar la celda en `cells`, actualizar `client_routing` y auditar. La operación es idempotente.

## 8. Aprovisionamiento de Chatwoot

| Estado | Significado | Transición |
|---|---|---|
| `pending` | Correlación creada, sin cuenta | `provisioning` |
| `provisioning` | Llamadas a la API en curso | `active` o `failed` |
| `active` | Cuenta, usuarios y token listos | `suspended` o `active` |
| `failed` | Error recuperable; se reintenta | `provisioning` |
| `suspended` | Cuenta deshabilitada por plan o baja | `active` |

Reglas:

- La escritura es unidireccional desde `mocter-admin`; de Chatwoot solo vuelven identificadores y estado (RF-03.4).
- Cada inquilino tiene su usuario de servicio y su token; el token se guarda cifrado y no se expone en la UI (RF-03.3).
- El SSO se hace por el mecanismo nativo de Chatwoot, sin compartir contraseñas (RF-02.2).
- Toda llamada usa clave de idempotencia; el reintento no duplica cuentas ni usuarios (RF-03.2).
- No se habilita ni se usa código enterprise (RF-03.5).

### 8.1 Etiquetas

Las etiquetas de Chatwoot (`/api/v1/accounts/{account_id}/labels`) son por cuenta y se aplican a conversaciones y, según la versión, a contactos. Sus atributos heredados son `id` (numérico), `title`, `description`, `color` (hex) y `show_on_sidebar`.

**Sincronización con `tenant_labels` (RF-03.6):**

- **«Chatwoot propone, Mocter decide»:** el espejo del inquilino vive en su celda con RLS; el upsert es idempotente por `(client_id, chatwoot_label_id)`.
- **Origen:** las etiquetas que Chatwoot crea por defecto al aprovisionar la cuenta se marcan `chatwoot_default` (la lista exacta de 4.19 se identifica en laboratorio, T-32 de CHW-001 alineada); las creadas por el inquilino en Chatwoot llegan como `chatwoot_custom`; las creadas desde Mocter se marcan `mocter_custom` y se empujan por la API.
- **Conjunto reservado de Mocter:** todo inquilino recibe `lead-frio`, `lead-tibio`, `lead-caliente` y `compra-realizada` con `origin = mocter_default` (RF-03.7). Son la salida del clasificador de BOT-002: no se renombran ni se eliminan, y el clasificador devuelve exactamente uno de esos slugs.

### 8.2 Contexto de atención del negocio

El inquilino configura en su celda el contexto que el bot usa en cada atención (RF-03.8): `client_business_info` (métodos de pago, devoluciones, garantía, FAQs, mensaje de cierre), `shipping_carriers` (transportadoras admitidas), `delivery_groups` + `delivery_rules` (tiempos por ciudad y grupo de producto), `product_price_tiers` (escalones de cantidad con precio y recomendado) y `product_faqs` (respuestas por producto o generales). El motor BOT-002 los compone en el prompt en runtime; el inquilino los edita una sola vez y no regenera nada.
- **Gestión desde Mocter:** el inquilino crea, edita (título, descripción, color, visibilidad) y archiva etiquetas; el sistema ejecuta la configuración en Chatwoot con idempotencia. Una etiqueta borrada en Chatwoot queda archivada en el espejo (`state = archived`), sin perder correlación histórica.
- Las etiquetas sirven luego para flujos del bot (BOT-001) y para mapear `tags` de prospectos (CRM-001); ese consumo se define en cada spec.

## 9. Productos, publicaciones y sincronización

### 9.0 Atributos del producto

Un producto puede ser **cualquier bien o servicio** que el inquilino agregue a su catálogo (RF-05.4). El tipo se llama `kind` —no `type`/`good`, que no internacionaliza bien— con valores `physical`, `digital`, `service`. Los atributos son de tipo ERP y siguen el vocabulario de los feeds de Google Merchant Center y Meta (RF-05.5), de modo que una integración futura (Droppi, Shopify, Effi, MercadoLibre) mapee directo.

**Alta mínima sin fricción (RF-05.8):** los únicos atributos obligatorios son `name`, `description` y `price_cents`. La moneda no se pregunta en el alta: se hereda de `clients.currency` (por defecto `COP`) y el producto puede sobrescribirla si vende en otra moneda (RF-05.9). Todo lo demás es opcional o tiene valor por defecto (`kind = physical`, `condition = new`, `availability = in_stock`, `status = draft`).

| Grupo | Atributos | Nota |
|---|---|---|
| Identidad | `client_id` + `id` | PK compuesta y partición `LIST (client_id)` |
| Identificadores | `sku`, `gtin`, `mpn`, `item_group_id` | `gtin` (UPC/EAN/ISBN) y `mpn` opcionales en servicios; `item_group_id` agrupa variantes |
| Origen de ingesta | `source_system`, `source_external_id`, `source_url` | `manual`, `droppi`, `shopify`, `effi`, `mercadolibre`, …; únicos `(client_id, source_system, source_external_id)` cuando no es manual (RF-05.6) |
| Básicos | `name` (≤150), `description` (≤5000), `brand` | `name` es el `title` de los feeds |
| Tipo y estado | `kind` (`physical`/`digital`/`service`, default `physical`), `condition` (`new`/`refurbished`/`used`, default `new`), `availability` (`in_stock`/`out_of_stock`/`preorder`/`backorder`, default `in_stock`), `status` (`draft`/`published`/`archived`, default `draft`), `sort_order` | `condition` y `availability` usan los valores en inglés de los feeds |
| Comercial | `price_cents` (obligatorio), `sale_price_cents`, `currency` (ISO 4217, nullable: hereda `clients.currency`), `price_note` | `price_note` complementa el precio («desde $X», «por hora») y alimenta al bot, no al feed |
| Taxonomía | `category`, `google_product_category` | `category` propia mapea a `product_type` de Google; `google_product_category` nullable |
| Variantes | `color`, `size`, `material`, `gender`, `age_group`, `pattern`, `attributes` JSONB | Campos nombrados de los feeds + catch-all para `additional_variant_attribute` y similares |
| Venta | `prompt` | Contexto de venta del bot; **no se vectoriza** (RF-05.7) |
| Bot | `keywords` JSONB, `media_term`, `benefits` JSONB, `delivery_group_id`, `free_shipping`, `shipping_cost_cents` | Insumos del prompt dinámico (BOT-002) y de la regla de envío de ORD-001: detección de intención, marcador multimedia, beneficios, grupo de entrega y costo/beneficio de envío |
| Compartición | `source_share_id`, `source_version` | Solo en clones (§9.2) |
| Auditoría | `created_at`, `updated_at`, `created_by`, `updated_by`; `deleted_at`, `deleted_by` | Soft delete: un producto archivado conserva historial de shares |

**Mapeo a feeds (referencia de integraciones futuras):**

| Mocter | Google Merchant Center | Meta catalog |
|---|---|---|
| `name` | `title` | `title` |
| `description` | `description` | `description` |
| `price_cents` + `currency` | `price` | `price` |
| `availability` | `availability` | `availability` |
| `condition` | `condition` | `condition` |
| `brand` | `brand` | `brand` |
| `sku` / `gtin` / `mpn` | `id` (sku), `gtin`, `mpn` | `id`, `gtin`, `mpn` |
| `category` / `google_product_category` | `product_type` / `google_product_category` | `product_type` / `google_product_category` |
| `color`, `size`, … | `color`, `size`, … | `color`, `size`, … |
| `item_group_id` | `item_group_id` | `item_group_id` |
| `product_media` → `media_catalog` | `image_link` | `image_link` |
| `source_url` | `link` | `link` |
| `sale_price_cents` | `sale_price` | `sale_price` |

**Vectorización (RF-05.7).** `vectorization_config` (Router Global, administrada por el equipo Mocter) define qué atributos componen `product_embeddings.content`, con `attribute_key`, `enabled` y `position`, versionada. El default de este plan: `name`, `description`, `category`, `brand`. El `prompt` queda excluido. El pipeline de embedding de cada celda lee la configuración por API (sin FK entre planos) y re-embebe los productos afectados cuando cambia. El `metadata` del embedding lleva `{kind, condition, availability, brand, category, google_product_category, color, size, material, gender, age_group, pattern}` para filtrar la búsqueda.

### 9.1 Producto y publicación

Un producto pertenece a un inquilino y vive en su celda (RF-05.4). Cualquier inquilino puede compartirlo con su comunidad (RF-08.14). Esa publicación —el requisito la llama *propuesta* en RF-08.12— registra el producto de origen, la celda y una versión (RF-08.11); no es una sugerencia ni una votación.

```text
Origen (celda A)                Router Global                 Adoptante (celda B)
┌──────────────┐   publica   ┌──────────────────┐   clona   ┌──────────────┐
│ producto     ├────────────►│ product_shares   ├──────────►│ producto     │
│ atributos    │             │ versión 1        │           │ atributos    │
│ medios       │             │ product_adoptions│           │ medios?      │
└──────────────┘             └──────────────────┘           └──────────────┘
```

### 9.2 Clonación

1. El adoptante elige la publicación y decide si incorpora los medios (RF-08.17).
2. `mocter-admin` lee el producto de la celda de origen por API.
3. Copia todos los atributos y crea el producto en la celda del adoptante con identificador nuevo; no hay migración de fila (RF-06.1).
4. Registra `product_adoptions` con la versión copiada y `link_active` según la decisión del adoptante (RF-08.12).
5. Si conserva el vínculo, crea `clone_sync_policies` con todos los atributos en modo manual y la actualización automática apagada (RF-08.16).
6. Si no conserva el vínculo, la adopción queda registrada con `link_active = false` y el clon es independiente (RF-06.4).

### 9.3 Ajuste del origen y notificación

Cuando el autor cambia un producto compartido:

1. Se incrementa `current_version` y se registra `product_share_versions` con los atributos modificados.
2. Se crea una notificación para cada adoptante (RF-08.15).
3. Para cada adopción, se leen las políticas por atributo:
   - `auto_sync = true`: se aplica el cambio en la celda del adoptante y se registra `sync_runs`.
   - `auto_sync = false`: solo queda la notificación; el adoptante decide si sincroniza.
4. La sincronización manual permite elegir atributos; usa la misma API y registra `sync_runs` (RF-08.16).

**Consistencia:** la sincronización entre celdas es eventual. No hay transacción distribuida: se usa un outbox en el Router, reintentos con backoff e idempotencia por `(adoption_id, version, attribute_key)`. Un fallo no bloquea la notificación ni el resto de los adoptantes.

**Medios:** el grupo `media` se trata como un atributo más. Al copiar, se enlazan los archivos del catálogo global por hash; no se duplica almacenamiento (D-13, D-23). Al sincronizar, el adoptante puede excluirlo.

**Propiedad:** el clon es del adoptante. La baja del origen no lo elimina ni interrumpe su operación (RF-06.7). Si el origen deja de estar disponible, los clones siguen funcionando.

## 10. Comunidades y feed

### 10.1 Scopes y roles

Los roles se organizan en tres scopes independientes. Un mismo usuario puede tener roles en varios scopes, pero como máximo en un inquilino; la identidad es global (AUTH-001) y la membresía de inquilino es 1:0..1. Los permisos se evalúan contra el vínculo activo (D-31).

| Scope | Roles | Asignación |
|---|---|---|
| Plataforma | `platform_owner`, `platform_admin`, `platform_sales` | `platform_owner` designa a los demás; nadie se autoasigna un rol de plataforma. |
| Inquilino | `tenant_owner` (único), `tenant_agent` (N según plan) | `tenant_owner` asigna `tenant_agent`; el alta manual crea el `tenant_owner` inicial. |
| Comunidad | `originator`, `co_leader`, `member` | `platform_admin` asigna `originator`; el `tenant_owner` del originador promueve `co_leader` con aceptación del `tenant_owner` del promovido. |
| Chatwoot | `administrator`, `agent` | `tenant_owner` → `administrator`; `tenant_agent` → `agent`. |

El rol de comunidad es del inquilino, no del usuario: todos los `tenant_owner` y `tenant_agent` de ese inquilino actúan con el rol de comunidad del vínculo. El inquilino #1 es la SaaS; un usuario con rol de plataforma puede ser `tenant_owner` del inquilino #1 y `originator` de su comunidad, sin que un scope otorgue permisos del otro (RF-01.8).

**Matriz de acceso.** ✅ permitido; ⚠️ excepcional, auditado y con justificación; ❌ no permitido; — no aplica.

| Capacidad | `platform_owner` | `platform_admin` | `platform_sales` | `tenant_owner` | `tenant_agent` | Condición |
|---|---|---|---|---|---|---|
| Definir catálogo de planes y límites | ✅ | ❌ | ❌ | ❌ | ❌ | — |
| Asignar plan en venta manual | ❌ | ❌ | ✅ | ❌ | ❌ | Venta manual; auditado |
| Elegir plan en autoservicio | ❌ | ❌ | ❌ | ✅ | ❌ | Catálogo; free por defecto |
| Alta manual de inquilino y `tenant_owner` inicial | ⚠️ | ⚠️ | ✅ | ❌ | ❌ | `platform_sales` es el canal; owner/admin solo soporte auditado |
| Suspender, reactivar o dar de baja un inquilino | ⚠️ | ✅ | ❌ | ❌ | ❌ | Owner excepcional y auditado |
| Gestionar usuarios de plataforma | ✅ | ✅ | ❌ | ❌ | ❌ | Admin solo `platform_sales`; owner designa admin |
| Asignar líder de comunidad | ⚠️ | ✅ | ❌ | ❌ | ❌ | Owner excepcional y auditado |
| Configuración operativa de la plataforma | ✅ | ✅ | ❌ | ❌ | ❌ | — |
| Auditoría | ✅ | ✅ | ❌ | ❌ | ❌ | Admin en modo lectura |
| Break-glass a chats o datos operativos del inquilino | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Excepcional, auditado y con justificación |
| Datos comerciales del inquilino (plan, estado, uso) | ✅ | ✅ | ✅ | ✅ | ❌ | El `tenant_owner` ve solo su contrato |
| Gestionar `tenant_users` | ❌ | ❌ | ❌ | ✅ | ❌ | Solo `tenant_agent`; el `tenant_owner` es único |
| Configurar negocio, Chatwoot y marca blanca | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| Conversaciones en Chatwoot | ❌ | ❌ | ❌ | ✅ | ✅ | Owner = `administrator`; agent = `agent`; plataforma sin acceso rutinario |
| Crear, editar o eliminar productos | ❌ | ❌ | ❌ | ✅ | ❌ | El agent solo lee y clona |
| Compartir o clonar productos | ❌ | ❌ | ❌ | ✅ | ✅ | — |
| Publicar en el feed | ❌ | ❌ | ❌ | ✅ | ✅ | Cualquier rol del inquilino |
| Moderar el feed | ❌ | ❌ | ❌ | ✅ | ✅ | Solo si el inquilino es originador o co-líder |
| Cambiar el modo de moderación | ❌ | ❌ | ❌ | ✅ | ❌ | Solo el `tenant_owner` del originador |
| Promover co-líderes | ❌ | ❌ | ❌ | ✅ | ❌ | Solo el `tenant_owner` del originador; acepta el `tenant_owner` del promovido |
| Aceptar solicitudes de unión y reingreso | ❌ | ❌ | ❌ | ✅ | ❌ | Solo el `tenant_owner` del originador |
| Salir de la comunidad | ❌ | ❌ | ❌ | ✅ | ❌ | Libre; no borra datos ni clones. El originador requiere transferencia previa del liderazgo |
| Ver métricas agregadas de la comunidad | ❌ | ❌ | ❌ | ✅ | ❌ | Solo si el inquilino es originador o co-líder; el agent ve solo las propias |
| Ver métricas propias | ❌ | ❌ | ❌ | ✅ | ✅ | — |
| Editar el perfil de compartición | ❌ | ❌ | ❌ | ✅ | ✅ | — |

La actualización de la landing queda fuera del alcance de ADM-001. `platform_owner` gobierna la plataforma; las operaciones comerciales y de soporte se delegan para separar funciones, y el acceso excepcional se marca ⚠️.

`platform_sales` es el rol comercial: alta manual de inquilinos, creación del `tenant_owner` inicial, asignación del plan del catálogo y lectura de datos comerciales. No define planes, no opera la plataforma, no asigna líderes de comunidad y no accede a chats ni a datos operativos. `platform_admin` es el rol de operación y soporte: ciclo de vida del inquilino, gestión de usuarios de plataforma con rol `platform_sales`, configuración operativa, asignación de líderes de comunidad y auditoría. No define el catálogo de planes ni asigna planes comerciales; un cambio de plan se deriva a `platform_sales`. `platform_owner` define RBAC y el catálogo, y solo actúa en las operaciones excepcionales marcadas ⚠️.

### 10.2 Organización y liderazgo

La organización la crea un inquilino originador. El `platform_admin` asigna el rol de líder (originador); el `tenant_owner` del originador promueve co-líderes con aceptación del `tenant_owner` del inquilino promovido (D-14, RF-08.1, RF-08.2).

Flujo de liderazgo:

1. El inquilino solicita ser líder por los canales de atención o se define en el alta.
2. Si ya pertenece a una comunidad, sale primero; la salida es libre y no borra datos (RF-08.5).
3. `platform_admin` asigna el rol de líder y crea o activa la organización con ese inquilino como originador; la operación se audita.
4. El `tenant_owner` del originador puede promover co-líderes. La promoción se registra en `organization_promotions`; el `tenant_owner` del inquilino promovido acepta o rechaza. Si el promovido no era miembro, la aceptación también lo incorpora; el originador es el único que puede admitir.
5. Un co-líder que quiera formar comunidad sale y repite el paso 1. Mientras sea co-líder no puede promover ni admitir miembros (RF-08.18).

El inquilino #1 es la SaaS. Un usuario con rol de plataforma puede ser `tenant_owner` del inquilino #1 y originador de su comunidad; los permisos se evalúan por el vínculo activo, no por la identidad global.

### 10.3 Membresía

- Un inquilino pertenece a una sola comunidad activa; un usuario con membresía de inquilino pertenece a ese único inquilino y, por lo tanto, como máximo a su comunidad (D-15).
- Salir no borra el negocio, sus datos ni los productos clonados (RF-08.5).
- El originador no sale mientras sea líder: primero solicita la transferencia o el cierre de la comunidad, y `platform_admin` asigna el nuevo líder. Así no queda una comunidad sin originador.
- El reingreso se hace por vinculación del originador o por solicitud aceptada por el originador.
- El historial se conserva; el índice parcial solo impide dos vínculos activos.

### 10.4 Privacidad

Cada inquilino configura su perfil de compartición. Por defecto comparte nombre y correo de contacto (D-20); el resto de los campos es opt-in. El liderazgo nunca accede a chats, clientes del inquilino ni datos operativos (RF-08.9). Las métricas se calculan por miembro y agregadas, sin identidad no compartida.

### 10.5 Feed

| Modo | Publicación | Moderación |
|---|---|---|
| `pre` (por defecto) | Queda `pending` hasta aprobación | Aprobar o rechazar antes de publicar |
| `post` | Se publica directo | Ocultar o retirar después |
| `none` | Se publica directo | Sin revisión |

Estados de una publicación: `pending`, `published`, `hidden`, `removed`. Publican `tenant_owner` y `tenant_agent` de cualquier inquilino; moderan los del inquilino originador o co-líder (RF-08.19). Solo el `tenant_owner` del originador cambia el modo; los co-líderes ejecutan la moderación (D-17, RF-08.7, RF-08.13).

El orden es cronológico por defecto. El orden por relevancia usa un score determinístico con las señales disponibles (recencia, rol del autor y actividad registrada); la fórmula se calibra en implementación y no cambia el modelo.

La autoría del feed usa únicamente los campos habilitados en el perfil de compartición; un campo oculto no se muestra (RF-08.10).

### 10.6 Métricas del liderazgo

El `tenant_owner` del inquilino originador o co-líder ve desempeño de productos activos y ventas efectivas, por miembro y agregadas (RF-08.9). El `tenant_agent` ve solo sus propias métricas; el `tenant_owner` de un inquilino miembro ve las de su propio negocio, no las agregadas de la comunidad. `mocter-admin` consulta cada celda por API con el token de servicio y agrega en memoria; no hay lectura cross-account en Chatwoot ni consultas SQL entre celdas (D-19).

## 11. Archivos

Dos dominios separados (RF-07.9):

| Dominio | Dueño | Almacenamiento | Cuota | Borrado |
|---|---|---|---|---|
| Multimedia de producto | Mocter | SeaweedFS, `media_catalog` | Sí, del plan | Por última referencia |
| Adjuntos de conversación | Chatwoot ActiveStorage | Disco de Chatwoot | No | Con la conversación |

El catálogo global (`media_catalog`) guarda hash, clave, tamaño y tipo; no guarda inquilino (RF-07.5). El vínculo producto–archivo (`product_media`) y la referencia distinta del inquilino (`client_media`) viven en la celda; `client_usage` mantiene el contador autoritativo (RF-07.6). Antes de borrar un archivo, `mocter-admin` consulta todas las celdas que puedan referenciarlo; ninguna celda decide sola (RF-07.7). El borrado es diferido y se ejecuta solo cuando no queda referencia (RF-07.8).

### 11.1 Formatos admitidos

Restrictivo por tipo de medio; cualquier otro formato se rechaza al subir con mensaje explícito (i18n es/en). La validación es **por contenido** (magic bytes), no por extensión (RF-07.12). Lo que se guarda como canónico es el resultado de la conversión de §11.4, no el archivo subido:

| `media_kind` | Formatos admitidos | Por qué |
|---|---|---|
| imagen | `webp`, `avif`, `png`, `jpeg` | WebP/AVIF óptimos para web; PNG sin pérdida (logos, diagramas); JPEG por compatibilidad. Sin SVG (puede llevar scripts) ni GIF (superado por WebP animado) |
| audio | `opus`, `aac`, `mp3` | Opus óptimo calidad/bitrate; AAC nativo de iOS/WhatsApp; MP3 por compatibilidad |
| video | `mp4` (H.264 + AAC), `webm` (VP9/AV1 + Opus) | MP4 compatibilidad universal; WebM óptimo para web |
| pdf | `pdf` | Único formato de documento |

El peso máximo por archivo se define por plataforma: video 100 MB e imágenes 10 MB por defecto (RF-07.16); se valida antes de aceptar la subida. La lista de formatos se revisa cuando cambien los navegadores o los canales de Chatwoot.

### 11.2 Ficha técnica extendida

`media_catalog` agrega (RF-07.13): `mime_type` (obligatorio, del canónico), `source_format` (formato de ingreso, para diagnóstico), `original_filename` (sanitizado, sin ruta), `width` y `height` (solo imágenes), `duration_ms` (solo audio/video), `processing_status` (`uploaded` → `processing` → `ready` | `failed`; `external` para enlaces) y `processing_error` (nullable). El `content_hash` es el hash de los **bytes canónicos** (post-conversión, §11.4) o de la URL normalizada en el caso externo (§11.5). El `alt_text` vive en `product_media`, no en el catálogo: el mismo archivo puede tener distinto texto alternativo por producto (RF-07.14).

### 11.3 Variantes

`media_variants` (Router Global): `media_id`, `variant_code` (`thumbnail`, `preview`, `mp4_compat`, `jpeg_compat`), `storage_pool_id`, `storage_key`, `size_bytes`, `width`, `height`, `mime_type` y auditoría; único `(media_id, variant_code)`. `thumbnail` y `preview` se generan cuando la interfaz del catálogo las necesite; `mp4_compat` y `jpeg_compat` son variantes de compatibilidad de canal que se generan **bajo demanda** y quedan cacheadas (RF-07.15).

### 11.4 Canonicalización

Flujo: subida → validación de formato por contenido → almacenamiento transitorio del origen → transcodificación **asíncrona** → alta del canónico y sus variantes → descarte del origen al llegar a `ready`. En `failed`, el origen se conserva para diagnóstico y reintento idempotente (RF-07.15).

- **Imágenes → `webp` canónico.** Perfil de calidad fijo para que la conversión sea determinista (la misma entrada produce los mismos bytes y habilita la deduplicación); transparencia y animación preservadas. Dos inquilinos que suben el mismo JPEG comparten el mismo WebP canónico.
- **Video → `webm` canónico** (VP9 + Opus). La transcodificación de video es costosa en CPU: corre en un worker asíncrono con reintentos idempotentes. WhatsApp no acepta WebM, por eso la variante `mp4_compat` (H.264 + AAC) se genera bajo demanda cuando un canal la requiere y queda cacheada.
- **Audio:** sin transcodificación; se guarda el formato admitido de ingreso.
- **Entrega por canal:** la capa de entrega elige el canónico o la variante compatible según el canal; si el laboratorio confirma que algún canal no acepta WebP, se agrega la variante `jpeg_compat` bajo demanda.
- Los estados de procesamiento se muestran al inquilino («procesando…») según la directiva de i18n.

### 11.5 Enlaces externos

El inquilino puede definir un enlace en lugar de cargar un archivo (RF-07.17): **no consume cuota** porque `size_bytes` queda nulo y `client_media.size_bytes` registra 0 para ese vínculo.

- **Video externo (embed):** solo plataformas admitidas del catálogo `external_media_providers` (YouTube, TikTok, Vimeo, Instagram, Facebook). `provider` guarda el código de la plataforma; la UI lo embebe (iframe del proveedor) y el bot envía el enlace por el canal. Sin transcodificación ni almacenamiento.
- **Imagen externa (importación perezosa):** se guarda la URL y la UI y los feeds la muestran por enlace; al **entregarla por un canal** (WhatsApp/Chatwoot), el sistema la descarga una única vez, valida por contenido, la canonicaliza a `webp` y la promueve a `internal`; a partir de ahí consume cuota y deja de depender del origen. Si la descarga falla, el vínculo queda `failed` con aviso visible para el inquilino.
- **Seguridad (RF-07.18):** solo `https`, sin credenciales en la URL, sin IPs privadas ni loopback en el destino; la descarga usa un guard SSRF y timeout. El catálogo de plataformas lo gobierna la plataforma.
- **Deduplicación:** para externos, `content_hash = SHA-256(url normalizada)` con índice único parcial (`WHERE storage_type = 'external'`); el mismo enlace no se registra dos veces.
- **GC:** un enlace externo no tiene objeto que borrar; el desvínculo elimina solo las filas.

**GC en dos fases:** marcar el objeto como candidato, verificar referencias en todas las celdas y eliminar. Si una celda no responde, el objeto no se borra.

## 12. Planes y retención

### 12.1 Planes

El plan define productos, `max_tenant_agents`, imágenes, audios, videos, PDF, retención de chats y bytes (RF-04.1). El `tenant_owner` es único por inquilino y no consume un asiento de agente; el plan free incluye un `tenant_owner` y cero `tenant_agent` (RF-04.7). La validación ocurre en `mocter-admin` antes de persistir o replicar; Chatwoot no la hace cumplir (RF-04.2). Un exceso se rechaza con mensaje explícito (RF-04.3).

**Modelo en dos capas (RF-04.8/RF-04.9).** Los límites numéricos viven en `plan_limits` y las capacidades en `plan_feature_values`; ambos se catalogan (`plan_dimensions`, `plan_features`) para evitar claves libres. El `platform_owner` define el catálogo y los valores; `platform_sales` asigna el plan y negocia overrides numéricos o de capacidad; el `tenant_owner` elige entre los planes públicos en estado `active`. `plans` guarda además descripción, `trial_days`, `grace_days`, `status` y ciclos de cobro permitidos.

- **Dimensiones iniciales:** las actuales + `max_bots`, `max_channels`, `max_followup_sequences` y `ai_tokens_monthly` (si se aprueba O-04 de BOT-001).
- **Capacidades iniciales:** `white_label` (`none`/`paleta`/`completa`), `custom_domain`, `legal_archive`, `community_feed`, `data_export`, `api_access`.
- **Fuera del gate:** la asistencia AI («Mejorar con AI») es transversal a todos los planes (AI-001 D-05).

En venta manual, `platform_sales` asigna el plan del catálogo, registra `client_plans` con `source = 'manual'` y actualiza `clients.plan_id`. En autoservicio, el `tenant_owner` elige del catálogo y el plan free es el valor por defecto; el cambio queda auditado con `source = 'self_service'` (RF-04.7). Cada cambio de plan u override incrementa `clients.quota_version`; la celda refresca el tope cuando ve una versión distinta.

El almacenamiento facturado es la suma de `client_media.size_bytes` distintos por inquilino; `client_usage` mantiene el contador por dimensión y el físico es el de objetos distintos en `media_catalog`/SeaweedFS (RF-04.4).

### 12.2 Retención de chats

Un job de `mocter-admin` recorre los planes y, por cada inquilino:

1. Calcula la fecha de corte según la retención del plan y el piso legal (RF-04.5).
2. Llama a la API de Chatwoot para eliminar conversaciones y mensajes vencidos (RF-04.6).
3. Purga los adjuntos de ActiveStorage; si Chatwoot no los elimina, completa la limpieza (D-28).
4. Registra el resultado en `audit_log`.

No hay archivo por defecto. Un plan con archivo legal exporta cifrado a R2 con retención propia (D-27). Queda por verificar en laboratorio qué granularidad de borrado expone la API de Chatwoot (§16).

## 13. Interfaz

- **i18n desde el inicio:** ningún texto visible incrustado; idioma por usuario y, en su ausencia, por el idioma del inquilino (`clients.locale`) y la configuración regional (RF-11).
- **Tema claro y oscuro:** por defecto sigue al sistema; la preferencia se conserva; ambos cumplen contraste (RF-12).
- **Marca blanca:** solo tokens de identidad visual, habilitada por plan; validación de contraste antes de aplicar; restauración en una acción (RF-15).
- **Simplicidad:** una acción principal por vista; sin explicación externa ni más de un concepto nuevo por pantalla; estados vacío, carga y error con recuperación (RF-13).
- **Onboarding:** asistente de menos de 5 minutos, interrumpible, reejecutable; crea el inquilino al completar los datos del negocio (RF-14).

## 14. Seguridad

### 14.1 Roles de base

| Rol | DDL | Acceso | Uso |
|---|---|---|---|
| `mocter_migrator` | Sí | Propietario del schema | Migraciones |
| `mocter_admin` | No | DML en `admin` del Router y de las celdas; RLS forzado | `apps/admin` |
| `mocter_landing` | No | `INSERT` solo en solicitudes de contacto | Landing |
| `mocter_auth` | No | `users`, `identities`, `sessions` del Router; `users` e `identities` de la celda dedicada | Autenticación |
| Chatwoot | No | Su propia base | Chatwoot |

El schema `admin` es la unidad de privilegios; la landing no accede a él (D-25, RF-09.3). En celdas, `mocter_admin` usa `SET LOCAL app.current_client_id` y no tiene `BYPASSRLS` (RF-10.11). En una celda dedicada, el rol `mocter_auth` se crea en la celda y solo accede a `users` e `identities`; `sessions` sigue en el Router Global.

### 14.2 Secretos y auditoría

- Tokens de servicio de Chatwoot cifrados en reposo; nunca en logs ni en la UI.
- Secretos TOTP en el almacén de identidad que define AUTH-D-01.
- `audit_log` registra actor, acción y entidad; no guarda contenido de conversaciones ni datos de negocio.
- El archivo legal se cifra antes de salir a R2; la clave no vive en el mismo bucket.
- Los roles de plataforma no acceden rutinariamente a chats ni a datos operativos del inquilino. Ese acceso es break-glass: excepcional, con justificación, auditado en `audit_log` y acotado al caso. `platform_sales` no tiene ese acceso (D-31).
- La asignación de líder de comunidad y la promoción de co-líderes se auditan; la promoción requiere aceptación del `tenant_owner` del inquilino promovido.

## 15. Operación

- **Despliegue:** imagen propia de `apps/admin`, router de Traefik propio y entradas en `cd.yml`/`deploy.yml`; no se alteran los routers existentes (D-10).
- **Observabilidad:** métricas y logs a Grafana Cloud off-host (OPS-001); alertas por correo, mensajería y push.
- **Respaldos:** pgBackRest a R2 con la política de OPS-001; ADM-001 no define respaldos propios.
- **Jobs:** retención, sincronización, notificaciones y GC de archivos; idempotentes y con reintentos.
- **Migraciones:** una línea por base; las celdas comparten esquema (RF-10.9, RF-10.10).

## 16. Riesgos y verificaciones pendientes

| Riesgo | Estado | Mitigación |
|---|---|---|
| Granularidad de borrado de la API de Chatwoot | **No verificado** | Prueba en laboratorio; si no borra mensajes sueltos, se borra la conversación completa |
| Consistencia entre celdas en la sincronización | Diseño | Outbox, idempotencia, reintentos y versión por atributo |
| Fórmula de relevancia del feed | Diseño | Score determinístico; se calibra con uso real |
| GC de archivos con una celda caída | Diseño | Si una celda no responde, no se borra |
| Ancla de correo en el Router para celda dedicada | Decisión | El Router guarda correo y puntero, no credenciales; revisar con requisito normativo concreto |
| Rendimiento de RLS y particiones | **No verificado** | Prueba de carga con 100 inquilinos por celda |
| Coordinación de migraciones entre Router y celdas | Diseño | Líneas separadas; despliegue ordenado y compatible hacia atrás |

## 17. Trazabilidad

| Sección | Requisitos | Decisiones |
|---|---|---|
| §5 Modelo de datos | RF-01, RF-05, RF-07, RF-08, RF-10 | D-11 a D-13, D-15, D-19, D-25, D-29, D-30, D-31 |
| §6 Identidad y alta | RF-01, RF-04, RF-14 | D-12, D-24, D-26, D-29, D-31 |
| §7 Tenencia y celdas | RF-10 | D-11, D-12 |
| §8 Chatwoot | RF-02, RF-03 | D-01 a D-09 de CHW-001 |
| §9 Productos y sincronización | RF-05, RF-06, RF-08 | D-18, D-21, D-22, D-23, D-30 |
| §10 Comunidades y feed | RF-08 | D-14 a D-20, D-30, D-31 |
| §11 Archivos | RF-07 | D-13, D-23, D-28 |
| §12 Planes y retención | RF-04 | D-27, D-28 |
| §13 Interfaz | RF-11 a RF-15 | — |
| §14 Seguridad | RF-09, RF-10 | D-25, D-31 |
| §15 Operación | — | D-10, OPS-001 |

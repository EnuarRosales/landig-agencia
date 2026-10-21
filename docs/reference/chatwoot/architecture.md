# Arquitectura de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Rails | `7.2.3.1` · Ruby `3.4.4` |

## 1. Posición en el ecosistema

Chatwoot es el motor operativo. No es el maestro del inquilino ni de los contactos.

| Sistema | Clave de tenencia | Autoridad |
|---|---|---|
| `mocter-admin` | `client_id` (UUIDv7) | Inquilino, plan, usuarios, productos, multimedia |
| Chatwoot | `account_id` (serial) | Conversaciones, mensajes, contactos operativos, canales |

La frontera es de identificadores: no hay clave foránea entre bases y la escritura es unidireccional desde `mocter-admin` hacia Chatwoot. El detalle de la correlación vive en CHW-001 §1.

## 2. Modelo de ejecución

| Componente | Evidencia | Observación |
|---|---|---|
| Aplicación Rails | `Gemfile.lock`: `rails (7.2.3.1)` | Monolito Rails con API JSON y panel SSR |
| Ruby | `.ruby-version`: `3.4.4` | — |
| Procesamiento en segundo plano | `config/routes.rb:821` monta `Sidekiq::Web` en `/monitoring/sidekiq` | Hay trabajos asíncronos; el borrado de cuentas lo usa (`DeleteObjectJob`) |
| Redis | `lib/redis/redis_keys.rb:56` | Se usa para los tokens de SSO, no solo como caché |
| PostgreSQL | `db/schema.rb` | 104 tablas, 199 migraciones |
| Tiempo real | columnas `pubsub_token` en `users:1678`, `contact_inboxes:791` | Indicio de canal en vivo. **No verificado:** la configuración de ActionCable no se inspeccionó |

## 3. Multi-tenencia

### 3.1 La cuenta como raíz

`accounts` es la raíz del grafo. Su clave es `id: :serial` (`db/schema.rb:62`), no un UUID. La tabla no tiene `account_id` porque **es** la cuenta.

| Hecho | Evidencia |
|---|---|
| `accounts.id` es `serial` | `db/schema.rb:62` |
| `accounts` guarda banderas de capacidad en dos bitsets | `db/schema.rb:69` (`feature_flags`), `db/schema.rb:76` (`feature_flags_ext_1`) |
| `accounts` guarda límites y atributos en `jsonb` | `db/schema.rb:71` (`limits`), `db/schema.rb:72` (`custom_attributes`) |
| `accounts` guarda configuración operativa | `db/schema.rb:74` (`internal_attributes`), `db/schema.rb:75` (`settings`) |
| `accounts` tiene estado | `db/schema.rb:73` (`status`) |

**76 de las 104 tablas** llevan `account_id` de forma directa. Las 28 restantes son globales o tablas de unión que no lo propagan.

### 3.2 Tablas de unión sin `account_id`

Diez tablas de unión no llevan la clave del inquilino:

`contact_inboxes`, `inbox_members`, `team_members`, `taggings`, `portals_members`, `notification_subscriptions`, `related_categories`, `captain_inboxes`, `inbox_assignment_policies`, `inbox_capacity_limits`.

Consecuencia: toda consulta con alcance de inquilino que pase por una de ellas exige un `join` hasta una tabla que sí tenga `account_id`. Es una decisión de Chatwoot, no un defecto; se registra porque `mocter-admin` **no** debe copiar ese patrón: su directiva exige `client_id` en toda tabla con datos de inquilino.

### 3.3 El usuario es global

| Hecho | Evidencia |
|---|---|
| `users` no tiene `account_id` | `db/schema.rb:1656-1695` |
| La pertenencia vive en `account_users` | `db/schema.rb:43-60` |
| La pertenencia es única por cuenta y usuario | índice `uniq_user_id_per_account_id` sobre `(account_id, user_id)`, `db/schema.rb:55` |
| El rol es un entero con valor por defecto `0` | `db/schema.rb:46` |
| El correo **no** tiene índice único; el único es `(uid, provider)` | `db/schema.rb:1689` frente a `db/schema.rb:1694` |

La unicidad de correo existe en la capa de modelo de Devise, no en la base. Es una diferencia relevante: `mocter-admin` sí debe imponerla en la base.

### 3.4 Contactos con alcance de cuenta

`contacts` sí lleva `account_id` no nulo (`db/schema.rb:803`) y su unicidad es por cuenta:

| Restricción | Evidencia |
|---|---|
| Correo único por cuenta | `uniq_email_per_account_contact` sobre `(email, account_id)`, `db/schema.rb:825` |
| Identificador único por cuenta | `uniq_identifier_per_account_contact` sobre `(identifier, account_id)`, `db/schema.rb:826` |
| Búsqueda por similitud | índice GIN con `gin_trgm_ops`, `db/schema.rb:827` |

## 4. Integridad referencial

Solo hay **17 claves foráneas** para 104 tablas. La integridad es, en la práctica, responsabilidad de la aplicación.

Consecuencia directa para `mocter-admin`: **no se puede importar el esquema de Chatwoot y esperar integridad**. Si alguna tabla se replica, se replica el dato, no la estructura, y con las restricciones que exige la directiva de base de datos del proyecto.

Las 17 claves se declaran al final de `db/schema.rb` con `add_foreign_key`.

## 5. `app/` frente a `enterprise/`

El código enterprise no es un complemento aislado: se inyecta en las clases base mediante `prepend`.

| Pieza | Evidencia |
|---|---|
| Mecanismo de inyección | `config/initializers/01_inject_enterprise_edition_module.rb:24` (`prepend_mod_with`) |
| Extensiones activas | `ChatwootApp.extensions` devuelve `%w[enterprise]` si el directorio existe, `%w[]` si no, y `%w[enterprise custom]` si existe `custom/` (`lib/chatwoot_app.rb`) |
| Interruptor de la edición | `ChatwootApp.enterprise?` devuelve `nil` si `ENV['DISABLE_ENTERPRISE']` está definido; si no, devuelve si existe el directorio `enterprise/` (`lib/chatwoot_app.rb`) |
| Tamaño | 488 archivos `.rb`; 18 directorios bajo `enterprise/app` |
| Sobrescritura de facturación | `lib/chatwoot_hub.rb:133` aplica `prepend_mod_with('ChatwootHub')` |

### 5.1 Consecuencia que contradice una suposición del proyecto

Conservar el directorio `enterprise/` **sí cambia el comportamiento en ejecución**. `ChatwootApp.enterprise?` no consulta una licencia: consulta si el directorio existe.

Por lo tanto:

- Rutas declaradas con `if ChatwootApp.enterprise?` se montan.
- `ChatwootApp.extensions` devuelve `enterprise`, y los `prepend_mod_with` se aplican.

El interruptor real para conservar el código sin activarlo es la variable de entorno `DISABLE_ENTERPRISE`, o bien retirar el directorio.

Esto se desarrolla en [`enterprise-boundary.md`](enterprise-boundary.md).

## 6. Consecuencias para `mocter-admin`

1. **No replicar el esquema.** Se replica el dato necesario, con claves propias e integridad propia.
2. **No asumir integridad del origen.** Con 17 claves foráneas, un borrado en Chatwoot puede dejar huérfanos.
3. **No asumir unicidad de correo.** El índice es no único.
4. **No asumir que conservar `enterprise/` es inerte.** Ver §5.1.
5. **La cuenta es la unidad de aprovisionamiento.** Todo lo demás cuelga de `account_id`.

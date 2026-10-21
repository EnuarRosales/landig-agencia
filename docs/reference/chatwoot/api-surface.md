# Superficie de API de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Método | Lectura estructural de `config/routes.rb` y parseo de `swagger/swagger.json`. **No** se ejecutó el resolutor de rutas. |

## 1. Qué mide este documento y qué no

Mide la superficie **publicada y declarada**. No mide la superficie real en ejecución: para eso habría que levantar Rails y pedir `rails routes`.

`config/routes.rb` tiene 838 líneas. `swagger/swagger.json` publica **96 paths**. La documentación es un subconjunto del código, y esa diferencia es uno de los hallazgos.

## 2. Distribución de los 96 paths documentados

| Prefijo | Paths | Superficie |
|---|---|---|
| `/api/v1/...` | 64 | API de cuenta |
| `/api/v2/...` | 11 | Reportes |
| `/platform/api/v1/...` | 9 | Platform API |
| `/public/api/v1/...` | 10 | API pública de inbox |
| `/survey/...` | 1 | Encuesta |
| Sin prefijo | 1 | Ver §7.3 |

## 3. Platform API

Es la superficie con la que `mocter-admin` aprovisiona. Tiene **5 controladores** y **9 paths documentados**.

### 3.1 Rutas declaradas

| Recurso | Rutas | Evidencia |
|---|---|---|
| `accounts` | `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | `config/routes.rb:642` |
| `account_users` | anidado en `accounts` | `config/routes.rb:650-656` |
| `users` | `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `GET /:id/login`, `POST /:id/token` | `config/routes.rb:657-662` |
| `agent_bots` | `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | `config/routes.rb` (bloque platform) |
| `email_channel_migrations` | `POST` anidado en `accounts` | `app/controllers/platform/api/v1/email_channel_migrations_controller.rb:1` |

### 3.2 Payloads aceptados

`accounts`:

```ruby
# app/controllers/platform/api/v1/accounts_controller.rb:48
params.permit(:name, :locale, :domain, :support_email, :status,
              features: {}, limits: {}, custom_attributes: {})
```

`users`:

```ruby
# app/controllers/platform/api/v1/users_controller.rb:55
params.permit(:name, :display_name, :email, :password, custom_attributes: {})
```

`account_users`:

```ruby
# app/controllers/platform/api/v1/account_users_controller.rb:27
params.permit(:user_id, :role)
```

`agent_bots`:

```ruby
# app/controllers/platform/api/v1/agent_bots_controller.rb:40
params.permit(:name, :description, :account_id, :outgoing_url, :avatar, :avatar_url)
```

### 3.3 Conductas verificadas

| Hecho | Evidencia |
|---|---|
| `accounts#create` crea y se auto-otorga el permiso | `accounts_controller.rb:12` y `:15` |
| `accounts#update` separa `features` del resto | `accounts_controller.rb:36` |
| `features` se aplica clave por valor | `accounts_controller.rb:39-45` |
| `accounts#destroy` es asíncrono | `accounts_controller.rb:25` (`DeleteObjectJob.perform_later`) |
| `index` devuelve solo las cuentas permitidas | `accounts_controller.rb:2-7` |
| `users#login` y `users#token` son acciones distintas | `users_controller.rb:17` y `:21` |
| `email_channel_migrations` valida cantidad y proveedor | `email_channel_migrations_controller.rb:5`, `:30-38`, `:80` |

`limits` y `custom_attributes` son `jsonb` libres: la Platform API **acepta cualquier clave** en ambos. Los límites de plan que Chatwoot no aplica en self-hosted pueden sembrarse ahí, pero `mocter-admin` sigue siendo quien los hace cumplir.

## 4. API de cuenta (`/api/v1`)

`config/routes.rb` declara **125 recursos** entre `api/v1` y `api/v2` (líneas 48 a 612). No se enumeran las 125 entradas aquí: se agrupan por dominio.

| Grupo | Recursos representativos | Evidencia |
|---|---|---|
| Cuenta y agentes | `accounts`, `agents`, `agent_bots`, `users`, `profile`, `sessions` | `routes.rb:52`, `:80`, `:139`, `:170`, `:513`, `:529` |
| Conversaciones | `conversations`, `messages`, `assignments`, `participants`, `draft_messages` | `routes.rb:184`, `:193`, `:201`, `:203`, `:205` |
| Contactos | `contacts`, `companies`, `contact_inboxes`, `notes`, `labels` | `routes.rb:237`, `:260`, `:275`, `:277`, `:276` |
| Configuración de cuenta | `canned_responses`, `automation_rules`, `macros`, `teams`, `webhooks`, `custom_attributes`, `custom_filters` | `routes.rb:159-168`, `:326-329`, `:378`, `:429` |
| Canales | `inboxes`, `twilio_channel`, y un bloque de autorizaciones OAuth | `routes.rb:329`, `:182`, `:397-422` |
| Centro de ayuda | `portals`, `categories`, `articles` | `routes.rb:477-499` |
| Reportes | `reports`, `summary_reports`, `live_reports`, `year_in_review` | `routes.rb:573-601` (v2) |
| Integraciones | `apps`, `hooks`, `slack`, `shopify`, `linear`, `notion`, `dyte` | `routes.rb:435-471` |
| Seguridad | `mfa`, `trusted_devices`, `saml_settings`, `audit_logs` | `routes.rb:525-530`, `:138`, `:150` |

Nótese que seis grupos tienen ruta **incondicional** pero su controlador existe **solo** en `enterprise/`:

| Ruta | Línea de la ruta | Controlador en `app/` | Controlador en `enterprise/` |
|---|---|---|---|
| `resource :saml_settings` | `routes.rb:138` | No | Sí |
| `resource :audit_logs` | `routes.rb:150` | No | Sí |
| `resources :sla_policies` | `routes.rb:166` | No | Sí |
| `resources :custom_roles` | `routes.rb:167` | No | Sí |
| `resources :agent_capacity_policies` | `routes.rb:168` | No | Sí |
| `resources :applied_slas` | `routes.rb:303` | No | Sí |

Esto **no** produce un `404`. Con el directorio presente —que el autoload incluye siempre, ver [`enterprise-boundary.md`](enterprise-boundary.md) §1.2— el controlador existe y se ejecuta. El gate real está dentro de cada uno:

| Resultado con `DISABLE_ENTERPRISE` | Rutas |
|---|---|
| `401`/`403` limpio por guarda de feature | `saml_settings`, `audit_logs`, `sla_policies`, `custom_roles`, `applied_slas` |
| `500` por `NoMethodError` | `agent_capacity_policies` |

El detalle por controlador está en [`enterprise-boundary.md`](enterprise-boundary.md) §4.2-4.3.

## 5. API pública (`/public/api/v1`)

Está pensada para el widget y los canales, no para un backoffice. No usa usuario ni token de acceso.

| Recurso | Rutas | Evidencia |
|---|---|---|
| `inboxes` | `GET /:inbox_identifier` | `routes.rb:668` |
| `contacts` | `POST`, `GET /:id`, `PATCH /:id` | `routes.rb:670` |
| `conversations` | `GET`, `POST`, `GET /:id`, `toggle_status`, `toggle_typing`, `update_last_seen` | `routes.rb:671-676` |
| `messages` | `GET`, `POST`, `PATCH` | `routes.rb:678` |
| `csat_survey` | `GET`, `PATCH` | `routes.rb:684` |

Además hay **12 rutas de centro de ayuda** bajo `/hc/:slug/...` (`routes.rb:689-700`) que no figuran en el Swagger, y una superficie de correo bajo `/app/...` (`routes.rb:704-708`).

## 6. Superficie de encuesta

`/survey` se declara fuera de `api` (`routes.rb:39`). Publica un solo path en Swagger. No es relevante para el aprovisionamiento.

## 7. Hallazgos de cobertura

### 7.1 El Swagger no cubre la Platform API completa

| Hueco | Evidencia |
|---|---|
| `GET /platform/api/v1/accounts` (listado) no está documentado | La acción existe (`accounts_controller.rb:2`) y la ruta se declara (`routes.rb:642`); no hay path `get` para `/platform/api/v1/accounts` |
| `email_channel_migrations` no tiene ningún path publicado | Controlador de 95 líneas (`email_channel_migrations_controller.rb:1-95`) sin entrada en Swagger |

Consecuencia: quien diseñe contra el Swagger **no descubre** el listado de cuentas ni la migración de canales de correo.

### 7.2 El Swagger cubre 96 paths frente a 125 recursos declarados

No se trata de que falten 29: un recurso genera varias rutas y un path puede agrupar varias acciones. Lo correcto es la conclusión inversa: **el Swagger documenta una fracción del archivo de rutas**, y capacidades como `monitors`, `captain/*`, `copilot_*`, `assignment_policies`, `inbox_limits` y `dashboard_apps` no aparecen en él.

### 7.3 Un path sin prefijo

El Swagger publica un único path sin prefijo de superficie:

```text
/accounts/{account_id}/conversations/{conversation_id}/messages
```

El resto de la API vive bajo `/api/v1`. Es una inconsistencia de la documentación, no una ruta distinta: el recurso `messages` se declara dentro de `namespace :api { namespace :v1 }` (`routes.rb:193`). Debe tratarse como `/api/v1/accounts/...`.

Esto se verificó: de los 96 paths, **95 resuelven a un controlador existente** de los 180 declarados en `app/controllers/`. El único que no resuelve es precisamente este. La comprobación se hizo derivando la ruta del controlador (`api/v1/accounts/{id}/conversations` → `app/controllers/api/v1/accounts/conversations_controller.rb`), descartando segmentos de parámetro y, si el archivo no existía, un segmento final de acción.

### 7.4 Rutas condicionadas por enterprise

Hay **14 puntos condicionales** en `config/routes.rb`, todos con `if ChatwootApp.enterprise?`:

| Tipo | Líneas |
|---|---|
| Rutas sueltas (8) | `192`, `194`, `224`, `257`, `279`, `300`, `309`, `422` |
| Bloques enteros (6) | `59`, `175`, `311`, `342`, `612`, `745` |

El bloque de `routes.rb:612` monta un `namespace :enterprise` completo con sus propias rutas. El detalle está en [`enterprise-boundary.md`](enterprise-boundary.md).

## 8. Consecuencias para `mocter-admin`

1. **Aprovisionar por `POST /platform/api/v1/accounts`**, nunca por la interfaz. Si la cuenta se crea a mano, la app no la administra.
2. **No diseñar solo contra el Swagger.** Faltan el listado de cuentas y la migración de canales de correo.
3. **No esperar paridad de límites.** `limits` se acepta como `jsonb` libre y Chatwoot no lo aplica en self-hosted.
4. **No usar las rutas enterprise.** Su montaje depende de una variable de entorno, no de una licencia.
5. **La API pública no es una vía de administración.** No tiene usuario ni rol; sirve para canales.

## 9. Lo que no se verificó

- No se ejecutó `rails routes`; el inventario es estructural.
- No se probó ningún endpoint. Las conductas se derivan del código de los controladores citados.
- No se enumeraron las 125 declaraciones de recurso una por una en este documento; se agruparon por dominio con evidencia de línea.

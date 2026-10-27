# CHW-001 · Diseño · Inventario técnico de Chatwoot

| Atributo | Valor |
|---|---|
| ID | CHW-001 |
| Versión | 1.3 |
| Fecha | 2026-10-20 · actualizado 2026-10-27 |
| Depende de | [`requirements.md`](requirements.md) · [`DAT-001`](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Fuente fijada | `chatwoot/chatwoot:v4.19.1` · digest de producción observado `sha256:de91ebbe04cef408e88697ccaee44cb6f33ea87330c826880790c0eec656c610`; commit upstream a fijar en T-01A/T-17/T-18 |

## 1. Principio rector

Dos autoridades, un contrato. Cada sistema conserva la clave de su dominio y ninguna migración se comparte.

```text
mocter-admin  ── provisiona / escribe ──▶  Chatwoot
     ▲                                        │
     └────────── IDs + estado ────────────────┘
```

| Sistema | Clave de tenencia | Autoridad |
|---|---|---|
| `mocter-admin` | `client_id` (UUIDv7) | Inquilino, plan, usuarios, productos, multimedia |
| Chatwoot | `account_id` (serial) | Conversaciones, mensajes, contactos operativos, canales |

La correlación es una tabla propia de `mocter-admin`:

| Columna | Tipo | Función |
|---|---|---|
| `client_id` | uuid | Autoridad |
| `chatwoot_account_id` | bigint | Correlación |
| `state` | enum | `pending` / `provisioning` / `active` / `suspended` / `drifted` / `failed` |
| `idempotency_key` | text | Reintentos seguros |
| `last_error` | text | Diagnóstico |
| `synced_at` | timestamptz | Vigencia |

Reglas:

- La escritura es **unidireccional**: `mocter-admin` → Chatwoot.
- De Chatwoot solo regresan identificadores y estado.
- No existe foreign key entre bases.
- Cada aplicación corre su **propia instancia PostgreSQL**; no hay acceso directo a la base del otro sistema.
- `custom_attributes.client_id` es opcional y **no** otorga autoridad (D-03).

El maestro de contactos vive en `mocter-core`, módulo de dominio dentro de `mocter-admin`, y comparte la persistencia de esa aplicación (CHW-001 D-12, ADM-001 D-24). No se agrega un servicio ni una instancia de base de datos; Chatwoot recibe únicamente la proyección operativa.

### 1.1 Entorno de ejecución

Chatwoot es el sistema del plano de soporte en DAT-001. Corre sobre una instancia PostgreSQL propia y un Redis propio; no participa de las celdas, del particionado por `client_id` ni de RLS.

| Componente | Versión | Verificación |
|---|---|---|
| PostgreSQL | 18 + pgvector (`pgvector/pgvector:pg18`) | Versión canónica 4.19.1; validación de laboratorio en T-01A/T-17/T-18; 4.19.0 fue la base previa. Rollback a PostgreSQL 16 en DAT-001 §9.7 |
| Redis | 7+ | Propio de Chatwoot (SSO, caché y cola); no se comparte con el Redis dedicado del plano de control (DAT-001 RF-01.7, AUTH-001 A-03) |
| Sidekiq | Incluido en la imagen de Chatwoot | Procesamiento en segundo plano; se documenta en `architecture.md` |
| Rails | 7.2.3.1 | Fijado por el pin del commit |

El esquema de Chatwoot se sincroniza con upstream. La directiva de base de datos de Mocter (`.agents/AGENTS.md` §4.5) y el particionado de DAT-001 **no** se aplican a ese esquema: esta referencia describe lo que existe, no lo modifica.

> **Estado observado en producción (2026-10-27):** `chatwoot/chatwoot:v4.19.1`, `pgvector/pgvector:pg18`, `redis:8.8.3-alpine`, almacenamiento local en el volumen `mocter-chatwoot_storage-chatwoot` y `CW_EDITION=ee`. El inventario completo está en [`docs/reference/production-services.md`](../../reference/production-services.md).

## 2. Entregables documentales

```text
docs/reference/chatwoot/
├── README.md               # pin, alcance, cómo regenerar
├── architecture.md         # tenencia, dominio, ejecución, app/ vs enterprise/
├── auth.md                 # tres superficies, token polimórfico, SSO, Pundit
├── api-surface.md          # 96 paths + 5 controladores Platform
├── data-model.md           # 104 tablas clasificadas
├── capability-matrix.md    # funcionalidad → tablas → endpoints → siembra
├── enterprise-boundary.md  # capacidades premium y su impacto
└── erd.mmd                 # diagrama Mermaid
```

`ADM-001` consume estos documentos. No se duplican en la especificación de la aplicación.

## 3. Método de extracción

| Paso | Fuente | Regla |
|---|---|---|
| Pin | `git clone --depth 1 --single-branch` + `git rev-parse HEAD` | El commit debe coincidir con el declarado |
| Rutas | `config/routes.rb` + `swagger/swagger.json` | El YAML del swagger no se toma como verdad única; se contrasta con rutas y controladores |
| Esquema | `db/schema.rb` | Es la verdad del estado actual; `db/migrate/*` solo explica evolución |
| Autorización | Controladores base, `app/policies/`, `app/controllers/concerns/` | Se lee el método que aplica la regla, no el nombre del archivo |
| Enterprise | `enterprise/` y `app/helpers/super_admin/features.yml` | Se identifica por ruta, no por suposición |

Regla de honestidad: lo que no se pueda citar con `archivo:línea` se marca como **no verificado** y no se publica como hecho.

## 4. Formato de evidencia

- Ruta relativa a la raíz del checkout: `app/controllers/platform_controller.rb:12`.
- Cada fila del inventario de tablas cita `db/schema.rb`.
- Cada fila de la matriz de capacidades cita al menos un controlador y un modelo.
- Los documentos declaran el commit en el encabezado y en `README.md`.

## 5. Clasificación del modelo de datos

Dos ejes independientes.

### Eje A · Tenencia

| Valor | Definición |
|---|---|
| `global` | No pertenece a ningún inquilino (p. ej. `users`, `platform_apps`, `access_tokens`) |
| `account` | Tiene `account_id` y cuelga del grafo del inquilino |
| `join` | Vincula una entidad global con un inquilino (p. ej. `account_users`) |
| `platform` | Alcance de Platform App (p. ej. `platform_app_permissibles`) |

### Eje B · Autoridad de escritura

| Valor | Definición |
|---|---|
| `mocter-admin` | `mocter-admin` siembra o actualiza el dato |
| `chatwoot` | Chatwoot lo produce en su operación |
| `ninguna` | Solo lectura o referencia |

La combinación de ambos ejes es la que decide qué se replica. Una tabla `account` + `chatwoot` no se replica; una `account` + `mocter-admin` sí.

## 6. Matriz de capacidades

Columnas mínimas:

| Capacidad | Tablas | Endpoints | ¿`mocter-admin` siembra? | Autoridad |
|---|---|---|---|---|
| Inquilino | `accounts` | `/platform/api/v1/accounts` | Sí | `mocter-admin` |
| Agentes | `users`, `account_users` | `/platform/api/v1/users`, `/platform/api/v1/accounts/{id}/account_users` | Sí | `mocter-admin` |
| Inboxes y canales | `inboxes`, `channel_*` | `/api/v1/accounts/{id}/inboxes` | Sí | `mocter-admin` |
| Equipos | `teams`, `team_members` | `/api/v1/accounts/{id}/teams` | Sí | `mocter-admin` |
| Etiquetas | `labels` | `/api/v1/accounts/{id}/labels` | Opcional | `mocter-admin` — atributos: `id`, `title`, `description`, `color`, `show_on_sidebar`; por cuenta, aplican a conversaciones y (según versión) contactos; la lista de etiquetas por defecto de 4.19 se identifica en laboratorio |
| Atributos personalizados | `custom_attribute_definitions` | `/api/v1/accounts/{id}/custom_attribute_definitions` | Sí | `mocter-admin` |
| Contactos | `contacts`, `contact_inboxes` | `/api/v1/accounts/{id}/contacts` | Proyección desde `mocter-core` | `mocter-core` |
| Conversaciones y mensajes | `conversations`, `messages` | `/api/v1/accounts/{id}/conversations` | No | `chatwoot` |
| Automatizaciones, macros, SLA, campañas | tablas propias | `/api/v1/accounts/{id}/...` | No | `chatwoot` |
| Webhooks e integraciones | `integrations_hooks` | `/api/v1/accounts/{id}/integrations` | Opcional | Por definir |

### 6.1 Modelo multi-cuenta (`account_users`)

`users` es global; la pertenencia a una cuenta vive en `account_users`, con el rol en `account_users.role` (`db/schema.rb:43-60`) y unicidad por par cuenta–usuario (`db/schema.rb:55`). El rol es un entero (`db/schema.rb:46`), sin catálogo de roles en el esquema comunitario.

Consecuencias:

- Un `User` accede solo a las cuentas donde tiene `AccountUser`; la autorización es por cuenta y no existe lectura cross-account (`auth.md` §6).
- `mocter-admin` provisiona identidad y membresía por API: `users` y `account_users` de la cuenta (`api-surface.md`, Platform API).
- La lectura del liderazgo quedó resuelta con el cierre de O-04 (2026-10-21): no se crea `AccountUser` en cuentas subordinadas. `mocter-admin` agrega métricas con los tokens de servicio por inquilino (D-07) y expone solo los datos que cada inquilino decide compartir. Chatwoot no conoce la relación de liderazgo y no se cruza ningún límite de cuenta.
- La membresía en cada cuenta subordinada se descarta: daría lectura total de la conversación y de la cartera de clientes, y cruzaría celdas. Contradice D-09 y el aislamiento de DAT-001.
- La integración de Mocter no crea un segundo `AccountUser` para un usuario con membresía activa en otro inquilino. Chatwoot permite multi-cuenta técnica, pero la capa de sincronización rechaza la operación y no reutiliza el `User` global para dos inquilinos.

### 6.2 Restricciones de embebido

ADM-001 D-32 exige que la bandeja de Chatwoot se presente en un iframe same-site. CHW-001 no modifica Chatwoot; documenta y valida las restricciones que condicionan esa decisión.

| Restricción | Qué verificar en 4.19.1 | Evidencia |
|---|---|---|
| Framing | `X-Frame-Options` y `Content-Security-Policy: frame-ancestors` en la respuesta del dashboard; si existe configuración (`FRAME_ANCESTORS` o equivalente) y qué orígenes admite | `config/`, `app/controllers/`, cabeceras |
| Cookies | Nombre, `Domain`, `SameSite`, `Secure` y `HttpOnly` de la cookie de sesión; si se envía en un iframe same-site y en uno cross-site | `config/initializers/session_store.rb`, controladores |
| SSO en iframe | `generate_sso_link` y `consume_sso_auth_token`: método (GET/POST), parámetro, redirección y si el token se consume dentro del iframe; si no admite POST, código de un solo uso canjeado server-side | `app/controllers/`, `app/models/` |
| Navegación interna | Rutas, Turbo/ActionCable, websockets y `connect-src` necesarios dentro del iframe | `app/javascript/`, `config/` |
| UI responsive | Barra lateral, encabezado, scroll y teclado en un contenedor de altura fija; comportamiento móvil | prueba manual |
| Aislamiento | Que el iframe no requiera enterprise ni cambios de esquema; que el fork solo ajuste cabeceras si hace falta | `enterprise/`, `db/schema.rb` |

**Resultado esperado:** una tabla de evidencia con `archivo:línea` y un veredicto por restricción. Si el framing no se puede habilitar sin un cambio de lógica, la decisión D-32 queda bloqueada y se reporta; no se sustituye por redirección.

## 7. ERD

Dos diagramas en `erd.mmd`, porque mezclan escalas distintas:

1. **Grafo administrativo**: `accounts` → `account_users` → `users`; `inboxes` → `channel_*`; `teams`, `labels`, `custom_attribute_definitions`.
2. **Grafo operativo**: `contacts` → `contact_inboxes` → `conversations` → `messages`.

No se dibuja un único ERD de 104 tablas: es ilegible y no aporta a la decisión.

## 8. Actualización al sincronizar upstream

1. Reemplazar el checkout por el tag o commit nuevo.
2. Re-ejecutar la extracción completa.
3. Diferenciar los artefactos generados contra la versión anterior.
4. Si cambia autenticación, rutas o esquema, subir la versión menor de CHW-001.
5. Abrir una revisión de impacto sobre `ADM-001`.
6. No editar a mano los artefactos generados.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El upstream mueve la superficie de API | Pin por versión y procedimiento de actualización (§8) |
| Eliminar `enterprise/` rompe `prepend_mod_with` | Validar `ChatwootApp.enterprise?` y el arranque antes de recortar |
| `feature_flags` está 63/63 lleno | Capacidades nuevas van a `feature_flags_ext_1` o viven en `mocter-admin` |
| Doble escritor de contactos | Decisión O-01 antes de implementar `ADM-001` |
| Token de servicio con blast radius amplio | Decisión O-02; cifrado en reposo y rotación |
| Deriva entre el fork y la referencia | Comparar commit del fork contra el pin en cada release |
| Chatwoot 4.19.1 no está soportado oficialmente sobre PostgreSQL 18 | Validación de 4.19.1 en T-01A/T-17/T-18; rollback operativo documentado en DAT-001 §9.7 |

## 10. Insumos para `ADM-001` (fuera de alcance de CHW-001)

El negocio prevé comunidades u organizaciones de dropshipping, con intercambio de productos y lectura de los inquilinos bajo liderazgo. Tres consecuencias deben resolverse en `ADM-001` antes de crear el esquema, porque condicionan la integración con Chatwoot:

1. **Lectura cross-tenant.** Chatwoot no tiene lectura entre cuentas: un `User` ve solo las cuentas donde tiene `AccountUser`. Por eso el liderazgo no se resuelve con membresías: `mocter-admin` agrega métricas con los tokens de servicio por inquilino (O-04 cerrada, ADM-001 D-19) y expone solo los datos que el inquilino comparte. La membresía cruzada daría lectura total de la cuenta y cruzaría celdas, contra D-09 y el aislamiento de DAT-001.
2. **Clonación de producto, no migración.** Un inquilino clona un producto propuesto por el líder de su comunidad: la fila se inserta en su propia partición con identificador nuevo, así que la PK `(client_id, id)` se mantiene estable y no hace falta un `product_uid` global. Lo que sí conviene registrar, porque no se deduce del clon, es el **evento de adopción** (`proposal_id`, `client_id`, `product_id`, `adopted_at`): sin él no se puede responder cuántos inquilinos adoptaron una propuesta, que es el KPI del programa. Si además se quisiera propagar cambios de la propuesta hacia los clones ya creados, ahí sí hace falta guardar el linaje; mientras no se quiera, no.
3. **Fan-out de particiones.** Consultar una organización con N inquilinos toca N particiones. Si la lectura agregada es frecuente, conviene una proyección por organización.

### 10.1 Revisión de impacto sobre `ADM-001`

Qué decisiones de `ADM-001` habilita o bloquea este inventario. Las heredadas D-01 a D-09 se originan en CHW-001 y no cambian; la revisión cubre las propias y las abiertas.

| Decisión de `ADM-001` | Efecto | Estado |
|---|---|---|
| D-10 · `mocter-admin` en el monorepo | No depende de Chatwoot: el inventario es insumo documental | Habilitada |
| D-11 · Esquema por base, no por aplicación | Compatible: Chatwoot conserva su base en el plano de soporte (D-08 de CHW-001, DAT-001 RF-01) | Habilitada |
| D-12 · Identidad en el Router Global | No toca Chatwoot: sus usuarios siguen siendo cuentas locales por `account_users` | Habilitada |
| D-13 · Catálogo global de archivos | Habilitada; depende de no replicar ActiveStorage (`data-model.md` §5.6) | Habilitada |
| O-04 · Lectura del líder sobre inquilinos subordinados | **Bloqueante** para el panel del líder. Membresía en cada cuenta → lectura total y cruce de celdas; métricas agregadas con tokens de servicio → coherente con D-09 | Resuelta el 2026-10-21: agregación en `mocter-admin`, sin `AccountUser` en cuentas ajenas (ADM-001 D-19) |
| O-05 · `mocter-core` como capa o servicio | **Bloqueante** para el maestro de contactos: define si la proyección de contactos (D-06) sale de `mocter-admin` o de un tercer servicio con persistencia propia | Bloqueada hasta resolver O-05 |
| O-13 · Retención de chats | Chatwoot no la hace cumplir sin enterprise: `mocter-admin` debe operarla por API o asumir el costo | Insumo, no bloquea el inventario |
| O-14 · Retención y cuota de adjuntos | ActiveStorage no deduplica ni se cuenta en la cuota; la política es de `ADM-001` | Insumo, no bloquea el inventario |
| O-08, O-11, O-12, O-15, O-16 | Sin impacto en la integración con Chatwoot: pertenecen a archivos, roles, registro, identidad y clonación | Fuera del alcance de CHW-001 |


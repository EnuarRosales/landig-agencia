# CHW-001 · Diseño · Inventario técnico de Chatwoot

| Atributo | Valor |
|---|---|
| ID | CHW-001 |
| Versión | 1.0 |
| Fecha | 2026-10-20 |
| Depende de | [`requirements.md`](requirements.md) |
| Fuente fijada | `chatwoot/chatwoot` · commit `042b438fe31d2a2ef00c396379b7064ab6d0034f` · release `4.19.0` |

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
| Etiquetas | `labels` | `/api/v1/accounts/{id}/labels` | Opcional | `mocter-admin` |
| Atributos personalizados | `custom_attribute_definitions` | `/api/v1/accounts/{id}/custom_attribute_definitions` | Sí | `mocter-admin` |
| Contactos | `contacts`, `contact_inboxes` | `/api/v1/accounts/{id}/contacts` | Proyección desde `mocter-core` | `mocter-core` |
| Conversaciones y mensajes | `conversations`, `messages` | `/api/v1/accounts/{id}/conversations` | No | `chatwoot` |
| Automatizaciones, macros, SLA, campañas | tablas propias | `/api/v1/accounts/{id}/...` | No | `chatwoot` |
| Webhooks e integraciones | `integrations_hooks` | `/api/v1/accounts/{id}/integrations` | Opcional | Por definir |

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

## 10. Insumos para `ADM-001` (fuera de alcance de CHW-001)

El negocio prevé comunidades u organizaciones de dropshipping, con intercambio de productos y lectura de los inquilinos bajo liderazgo. Tres consecuencias deben resolverse en `ADM-001` antes de crear el esquema, porque condicionan la integración con Chatwoot:

1. **Lectura cross-tenant.** Chatwoot no tiene lectura entre cuentas: un `User` ve solo las cuentas donde tiene `AccountUser`. Si un líder debe leer los inquilinos bajo su liderazgo, hay que crearle membresía en cada cuenta subordinada —y verá toda la cuenta, no un subconjunto de lectura— o agregar métricas en `mocter-admin` con los tokens de servicio por inquilino (O-04). La segunda opción es la coherente con D-09, y queda como inclinación pendiente de confirmación.
2. **Clonación de producto, no migración.** Un inquilino clona un producto propuesto por el líder de su comunidad: la fila se inserta en su propia partición con identificador nuevo, así que la PK `(client_id, id)` se mantiene estable y no hace falta un `product_uid` global. Lo que sí conviene registrar, porque no se deduce del clon, es el **evento de adopción** (`proposal_id`, `client_id`, `product_id`, `adopted_at`): sin él no se puede responder cuántos inquilinos adoptaron una propuesta, que es el KPI del programa. Si además se quisiera propagar cambios de la propuesta hacia los clones ya creados, ahí sí hace falta guardar el linaje; mientras no se quiera, no.
3. **Fan-out de particiones.** Consultar una organización con N inquilinos toca N particiones. Si la lectura agregada es frecuente, conviene una proyección por organización.


# Frontera enterprise de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Método | Inventario por ruta y por `app/helpers/super_admin/features.yml` |

## 1. Cómo se activa el código enterprise

No hay un interruptor de licencia en el arranque. Hay una comprobación de existencia de directorio.

```ruby
# lib/chatwoot_app.rb
def self.enterprise?
  return if ENV.fetch('DISABLE_ENTERPRISE', false)

  @enterprise ||= root.join('enterprise').exist?
end
```

| Hecho | Evidencia |
|---|---|
| `enterprise?` es verdadero si existe el directorio | `lib/chatwoot_app.rb` |
| `DISABLE_ENTERPRISE` lo anula | `lib/chatwoot_app.rb`, primera línea del método |
| Las extensiones se resuelven desde `ChatwootApp.extensions` | `config/initializers/01_inject_enterprise_edition_module.rb:75-83` |
| La inyección es por `prepend`, no por carga condicional | `config/initializers/01_inject_enterprise_edition_module.rb:24-35` |

> **Trampa de configuración.** `lib/chatwoot_app.rb:15` es `return if ENV.fetch('DISABLE_ENTERPRISE', false)`. En Ruby la cadena `"false"` es verdadera, así que **cualquier valor definido** —`true`, `false`, `0`, `no`— desactiva enterprise. Solo *no definir* la variable lo mantiene activo. Un `.env` con `DISABLE_ENTERPRISE=false` no habilita nada: lo apaga.
>
> Verificado en un intérprete Ruby 3.4: `ENV.fetch('DISABLE_ENTERPRISE', false)` con la variable en `"false"` devuelve `"false"`, que es truthy.

### 1.1 Consecuencia

**Conservar `enterprise/` en el fork activa el código enterprise.** No es un directorio inerte.

Con el directorio presente y sin `DISABLE_ENTERPRISE`:

- `ChatwootApp.enterprise?` devuelve un valor verdadero.
- `ChatwootApp.extensions` devuelve `%w[enterprise]`.
- Los módulos de `enterprise/` se anteponen a las clases base.

### 1.2 La carga no es condicional

`config/application.rb` incorpora el árbol enterprise al arranque **sin ninguna comprobación**:

| Línea | Efecto |
|---|---|
| `config/application.rb:43` | `enterprise/lib` en `eager_load_paths` |
| `config/application.rb:44` | `enterprise/listeners` en `eager_load_paths` |
| `config/application.rb:46` | `enterprise/app/**` en `eager_load_paths` |
| `config/application.rb:49` | Vistas enterprise al frente de los view paths |
| `config/application.rb:53` | Initializers enterprise cargados con `require` |

Ninguna de esas cinco líneas consulta `ChatwootApp.enterprise?`.

Consecuencia: `enterprise?` **no decide qué código se carga**. Decide dos cosas distintas:

1. Si `prepend_mod_with` inyecta los módulos sobre las clases base (`config/initializers/01_inject_enterprise_edition_module.rb:24`).
2. Si las rutas condicionales se montan (`config/routes.rb`).

Con `DISABLE_ENTERPRISE=true` el código sigue cargado y resoluble; lo que desaparece es la inyección y el montaje.

La decisión D-05 del proyecto afirma que conservar el código no habilita su uso. **Esa afirmación es incorrecta en el plano técnico.** El código se antepone igual; lo que cambia es qué capacidad concreta se muestra o se ejecuta, porque varias comprueban además el plan.

## 2. Inventario

| Medida | Valor |
|---|---|
| Archivos `.rb` totales | 488 |
| Directorios bajo `enterprise/app` | 18: `actions`, `builders`, `controllers`, `dispatchers`, `drops`, `fields`, `finders`, `helpers`, `jobs`, `listeners`, `mailers`, `models`, `policies`, `presenters`, `services`, `validators`, `views` |
| Configuración | `enterprise/config` (1 archivo) |
| Librería | `enterprise/lib` (28 archivos) |

## 3. Capacidades premium declaradas

`app/helpers/super_admin/features.yml` declara seis capacidades con `enterprise: true`. La expresión de activación es distinta en cada caso y es lo que realmente decide.

| Capacidad | Clave | Expresión de activación | Evidencia |
|---|---|---|---|
| SAML SSO | `saml` | `ChatwootApp.enterprise?` | `features.yml`, bloque `saml` |
| Marca personalizada | `custom_branding` | `ChatwootHub.pricing_plan != 'community'` | `features.yml`, bloque `custom_branding` |
| Capacidad de agentes | `agent_capacity` | `ChatwootHub.pricing_plan != 'community'` | `features.yml`, bloque `agent_capacity` |
| Registro de auditoría | `audit_logs` | `ChatwootHub.pricing_plan != 'community'` | `features.yml`, bloque `audit_logs` |
| Quitar marca | `disable_branding` | `ChatwootHub.pricing_plan != 'community'` | `features.yml`, bloque `disable_branding` |
| Llamadas de voz | `voice_calls` | `ChatwootHub.pricing_plan != 'community'` | `features.yml`, bloque `voice_calls` |

Dos observaciones:

1. `saml` depende **solo** de la existencia del directorio. Es la capacidad que se activa con más facilidad y la que exige más cuidado.
2. Las otras cinco dependen de `ChatwootHub.pricing_plan`, que a su vez es sobrescrito por `prepend_mod_with('ChatwootHub')` (`lib/chatwoot_hub.rb:133`).

## 4. Rutas condicionadas por enterprise

Rutas declaradas con `if ChatwootApp.enterprise?` en `config/routes.rb`:

| Línea | Ruta | Efecto |
|---|---|---|
| 192 | `resources :campaign_history` | Historial de campañas |
| 194 | `post :auto_translate` | Traducción automática de mensajes |
| 224 | `get :reporting_events` | Eventos de reporte por conversación |
| 257 | `resource :enrichment` | Enriquecimiento de contactos |
| 279 | `post :call` | Llamadas desde contacto |
| 300 | `patch :update` | Actualización de respuestas CSAT |
| 309 | `resources :reporting_events` | Eventos de reporte de cuenta |
| 422 | `resource :access_request` | Solicitud de acceso a canal |

Además, `config/routes.rb:613-634` declara un espacio `enterprise/api/v1` con la superficie de facturación:

| Línea | Ruta | Efecto |
|---|---|---|
| 618 | `post :reconnect_shopify` | Reconexión de Shopify |
| 619 | `get :billing_summary` | Resumen de facturación |
| 620 | `post :checkout` | Inicio de compra |
| 621 | `post :subscription` | Gestión de suscripción |
| 622 | `post :select_billing_currency` | Moneda de facturación |
| 623 | `get :limits` | Límites del plan |
| 624 | `post :toggle_deletion` | Baja de cuenta |
| 625 | `post :topup_checkout` | Recarga |
| 626 | `get :topup_options` | Opciones de recarga |
| 632 | `post webhooks/stripe` | Webhook de Stripe |
| 633 | `post webhooks/firecrawl` | Webhook de Firecrawl |

En total hay **14 puntos condicionales** en el archivo de rutas: 8 rutas sueltas y 6 bloques (`59`, `175`, `311`, `342`, `612`, `745`).

### 4.1 Rutas sin guardia con controlador enterprise

Seis grupos de rutas se montan **incondicionalmente** y su controlador existe solo en `enterprise/`:

| Ruta | Línea | Controlador en `app/` | Controlador en `enterprise/` |
|---|---|---|---|
| `resource :saml_settings` | 138 | No | Sí |
| `resource :audit_logs` | 150 | No | Sí |
| `resources :sla_policies` | 166 | No | Sí |
| `resources :custom_roles` | 167 | No | Sí |
| `resources :agent_capacity_policies` | 168 | No | Sí |
| `resources :applied_slas` | 303 | No | Sí |

Se verificó por existencia de archivo sobre ocho controladores (`saml_settings`, `audit_logs`, `custom_roles`, `agent_capacity_policies`, `sla_policies`, `applied_slas`, `calls`, `reporting_events`): ninguno tiene contraparte en `app/controllers/`.

Por qué importa: estas rutas **no** dan 404. Con el directorio presente, el autoload las resuelve aunque `DISABLE_ENTERPRISE` esté activo.

### 4.2 Qué pasa realmente con `DISABLE_ENTERPRISE`

`Api::V1::Accounts::EnterpriseAccountsController` es una clase **vacía** (`enterprise/app/controllers/api/v1/accounts/enterprise_accounts_controller.rb:1-2`). No aporta guarda ni dependencia: solo marca la base. Los controladores cargan porque el autoload es incondicional, y cada uno resuelve el gate por su cuenta.

| Controlador | Guarda | Resultado real | Evidencia |
|---|---|---|---|
| `SlaPoliciesController` | `feature_enabled?('sla')` | 401 limpio | `sla_policies_controller.rb:34-36` · `config/features.yml:130-133` |
| `AppliedSlasController` | `feature_enabled?('sla')` | 401 limpio | `applied_slas_controller.rb` (misma guarda) |
| `CustomRolesController` | `feature_enabled?('custom_roles')` | 401 limpio | `custom_roles_controller.rb:33-35` · `config/features.yml:147-150` |
| `SamlSettingsController` | `feature_enabled?('saml')` | 403 limpio | `saml_settings_controller.rb:52-56` · `config/features.yml:213-216` |
| `AuditLogsController` | `feature_enabled?(:audit_logs)` | 401 limpio | `audit_logs_controller.rb:62-64` · `config/features.yml:111-114` |
| `AgentCapacityPoliciesController` | **ninguna de feature** | **500 `NoMethodError`** | `agent_capacity_policies_controller.rb:5-13`, `:34-36` |

`Pundit::NotAuthorizedError` se traduce a respuesta limpia en `app/controllers/concerns/request_exception_handler.rb:24-26`. Y las cuatro features tienen `enabled: false` por defecto: `config/features.yml` es la fuente que carga `app/models/concerns/featurable.rb:13`.

Conclusión: en una instalación recién creada, **cinco de los seis devuelven 401/403 limpio**. Mi afirmación previa —"es un modo de falla peor que una ruta ausente"— era incorrecta para esos cinco.

### 4.3 La excepción real

`AgentCapacityPoliciesController` no consulta ninguna feature porque `agent_capacity` **no existe** en `config/features.yml`. Su única guarda es `check_authorization`, y la policy solo exige `administrator?` (`enterprise/app/policies/agent_capacity_policy_policy.rb:2-20`). Después llama a `Current.account.agent_capacity_policies`, asociación definida en `enterprise/app/models/enterprise/concerns/account.rb`, que solo se inyecta cuando `enterprise?` es verdadero.

Resultado: con `DISABLE_ENTERPRISE=true`, un administrador que abre esa ruta recibe un **500 por `NoMethodError`**. Es el único de los seis con falla dura.

### 4.4 Riesgo de segundo orden

`sla`, `custom_roles`, `saml` y `audit_logs` son features `premium: true` con `enabled: false`. Si alguien activa el bit en `feature_flags` de la cuenta sin que el código enterprise esté inyectado, la guarda pasa y el controlador cae en la asociación ausente → 500.

La guarda protege **por defecto**, no por diseño. El riesgo no está en la ruta: está en encender la bandera.

## 5. Riesgo para el proyecto

`mocter-admin` no puede usar estas capacidades. El riesgo no es solo funcional.

Mitigaciones verificables, y qué garantiza cada una:

| # | Mitigación | Qué garantiza | Qué **no** garantiza |
|---|---|---|---|
| 1 | `DISABLE_ENTERPRISE=true` | No se inyectan módulos; no se montan las 14 rutas condicionales; las 4 features premium quedan en `false` y 5 de las 6 rutas sin guardia devuelven 401/403 limpio | No descarga el código (`config/application.rb:43-53`); `AgentCapacityPoliciesController` sigue devolviendo 500 |
| 2 | Comprobar en el arranque que `ChatwootApp.enterprise?` es falso | Detecta una configuración incorrecta | No detecta el 500 de `agent_capacity_policies` ni una feature premium encendida a mano |
| 3 | Retirar el directorio | Elimina la inyección, el montaje y la resolución de los controladores | **Empeora las seis rutas sin guardia**: pasan a fallar por constante ausente, no por guarda |

**`DISABLE_ENTERPRISE` es la mejor de las tres, no porque sea completa sino porque falla mejor.** Conserva el directorio para sincronizar con upstream y convierte cinco de las seis rutas en un 401/403 limpio.

La que queda mal es `agent_capacity_policies`, y no depende de la variable: depende de que nadie navegue a esa ruta. Mitigación concreta para `mocter-admin`: no enlazarla, y no encender `agent_capacity`, `sla`, `custom_roles`, `saml` ni `audit_logs` en `feature_flags` mientras el enterprise no esté inyectado.

La decisión es del dueño del producto. Lo que no admite discusión es el hecho: **conservar el directorio activa el código**, y la variable de entorno lo desconecta parcialmente.

## 6. Lo que no se verificó

- No se ejecutó la aplicación para comprobar el valor efectivo de `ChatwootApp.enterprise?` en un despliegue real.
- No se auditó cada uno de los 488 archivos para clasificar su capacidad. El inventario se hizo por ruta, por `features.yml` y por el mecanismo de inyección.
- No se evaluó el cumplimiento de la licencia. Este documento describe comportamiento técnico, no autoriza uso.

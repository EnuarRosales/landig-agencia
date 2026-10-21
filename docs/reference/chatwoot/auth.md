# Autenticación y autorización de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Método | Lectura del código. **No** se ejecutó la aplicación. |

## 1. Tres superficies, tres autoridades

| Superficie | Controlador base | Credencial | Autorización |
|---|---|---|---|
| `/api/v1/accounts/:account_id/...` | `Api::BaseController` | Token de `User` o de `AgentBot` | Pundit por cuenta |
| `/platform/api/v1/...` | `PlatformController` | Token de `PlatformApp` | Tabla `platform_app_permissibles` |
| `/public/api/v1/inboxes/:inbox_identifier/...` | controladores públicos | Identificador de inbox | Ninguna sesión de usuario |

Las tres conviven en el mismo proceso y **no comparten credencial**. Un token de `PlatformApp` no sirve en `/api/v1`, y un token de `User` no sirve en `/platform/api/v1`.

## 2. El token de acceso

`AccessToken` es polimórfico:

| Hecho | Evidencia |
|---|---|
| El dueño puede ser de cualquier tipo | `app/models/access_token.rb:23` (`belongs_to :owner, polymorphic: true`) |
| El token se genera con `has_secure_token` | `app/models/access_token.rb:22` |
| El token es único en la base | `db/schema.rb:28` (índice único sobre `token`) |
| La tabla no lleva `account_id` | `db/schema.rb:21-29` |

Los dueños reales son tres: `User`, `AgentBot` y `PlatformApp`. El tipo del dueño es lo que decide en qué superficie vale el token.

## 3. La cadena de `/api/v1`

`Api::BaseController` resuelve el token antes de llegar a cualquier acción:

| Línea | Efecto |
|---|---|
| `app/controllers/api/base_controller.rb:2` | Incluye `AccessTokenAuthHelper` |
| `app/controllers/api/base_controller.rb:4` | Omite `set_current_user` si el token es de API |
| `app/controllers/api/base_controller.rb:6` | Ejecuta `authenticate_access_token!` si el token es de API |
| `app/controllers/api/base_controller.rb:7` | Ejecuta `validate_bot_access_token!` si el token es de API |
| `app/controllers/api/base_controller.rb:8` | Ejecuta `authenticate_user!` si el token **no** es de API |

La bifurcación central está en `authenticate_by_access_token?`:

| Hecho | Evidencia |
|---|---|
| Hay token de API si viene el encabezado legado o un Bearer que no es de Devise | `app/controllers/concerns/access_token_auth_helper.rb:9-11` |
| El encabezado legado es `api_access_token` | `app/controllers/concerns/access_token_auth_helper.rb:18-20` |
| El Bearer se extrae de `Authorization` | `app/controllers/concerns/access_token_auth_helper.rb:23-28` |
| Se distingue el Bearer del panel del Bearer de API | `app/controllers/concerns/access_token_auth_helper.rb:31` |
| La búsqueda es `AccessToken.find_by(token:)` | `app/controllers/concerns/access_token_auth_helper.rb:13-16` |

Consecuencia: el panel y la API usan el mismo esquema `Bearer`. Lo que los separa es si el token corresponde a una sesión de DeviseTokenAuth o a una fila de `access_tokens`.

### 3.1 Qué dueño puede actuar

| Hecho | Evidencia |
|---|---|
| Solo `User` y `AgentBot` establecen `Current.user` | `app/controllers/concerns/access_token_auth_helper.rb:48-53` |
| Un dueño de otro tipo no se acepta | misma función, retorno temprano |

Esto es lo que rechaza un token de `PlatformApp` en `/api/v1`.

## 4. La restricción de los bots

Un `AgentBot` no puede llamar cualquier endpoint. Hay una lista blanca explícita:

| Hecho | Evidencia |
|---|---|
| Cuatro grupos de controlador permitidos | `app/controllers/concerns/access_token_auth_helper.rb:2-7` |
| Acciones permitidas por grupo | mismo bloque |
| La validación compara controlador y acción | `app/controllers/concerns/access_token_auth_helper.rb:55-64` |

Grupos permitidos: conversaciones (7 acciones), mensajes de conversación (1), asignaciones (1), etiquetas de conversación (2). Total: **11 acciones**.

## 5. La Platform API

`PlatformController` hereda de `ActionController::API` y aplica cuatro filtros:

| Línea | Filtro | Efecto |
|---|---|---|
| `app/controllers/platform_controller.rb:5` | `ensure_access_token` | Resuelve el token |
| `app/controllers/platform_controller.rb:6` | `set_platform_app` | Exige que el dueño sea `PlatformApp` |
| `app/controllers/platform_controller.rb:7` | `set_resource` | Cada controlador declara su recurso |
| `app/controllers/platform_controller.rb:8` | `validate_platform_app_permissible` | Exige que el recurso sea suyo |

Los dos rechazos:

| Situación | Respuesta | Evidencia |
|---|---|---|
| El token no pertenece a una `PlatformApp` | `401` con `{"error":"Invalid access_token"}` | `app/controllers/platform_controller.rb:18-21` |
| El recurso no está en sus permisos | `401` con `{"error":"Non permissible resource"}` | `app/controllers/platform_controller.rb:28-32` |

### 5.1 El permiso se crea solo al crear la cuenta

En `Platform::Api::V1::AccountsController#create`:

| Línea | Efecto |
|---|---|
| `app/controllers/platform/api/v1/accounts_controller.rb:12` | `Account.create!(account_params)` |
| `app/controllers/platform/api/v1/accounts_controller.rb:15` | `find_or_create_by(permissible: @resource)` |

Consecuencia operativa: **una cuenta creada a mano en la interfaz no es administrable por la Platform API** hasta sembrar `platform_app_permissibles`. Es la razón por la que el aprovisionamiento de `mocter-admin` debe crear la cuenta por API y no por la interfaz.

## 6. Pundit

| Hecho | Evidencia |
|---|---|
| Pundit se incluye en el controlador de aplicación | `app/controllers/application_controller.rb:4` |
| El usuario de Pundit se define una sola vez | `app/controllers/application_controller.rb:21` |
| La API verifica autorización | `app/controllers/api/base_controller.rb:12` |
| Existe una verificación adicional de administrador | `app/controllers/api/base_controller.rb:18` |
| Hay 27 policies | `app/policies/` |

La autorización es **por cuenta**: el rol vive en `account_users.role` (`db/schema.rb:46`) y es único por par cuenta–usuario (`db/schema.rb:55`). No hay un rol global de plataforma en este esquema.

## 7. SSO nativo

Chatwoot emite un enlace de sesión temporal, sin contraseña.

| Hecho | Evidencia |
|---|---|
| El token son 32 bytes aleatorios en hexadecimal | `app/models/concerns/sso_authenticatable.rb:4-5` |
| Se guarda en Redis con TTL de 5 minutos | `app/models/concerns/sso_authenticatable.rb:6` |
| Se marca si es impersonación | `app/models/concerns/sso_authenticatable.rb:7` |
| `consume` borra la clave y devuelve si existía | `app/models/concerns/sso_authenticatable.rb:16-18` |
| `valid?` solo consulta, no consume | `app/models/concerns/sso_authenticatable.rb:20-22` |
| `generate_sso_link` arma la URL del panel | `app/models/concerns/sso_authenticatable.rb:24-27` |
| La variante con impersonación existe | `app/models/concerns/sso_authenticatable.rb:37-43` |
| Las claves de Redis están centralizadas | `lib/redis/redis_keys.rb:56` |

**Es de un solo uso**: `consume_sso_auth_token` borra la clave. Un enlace consumido no se puede reutilizar, y a los 5 minutos expira aunque no se haya usado.

El controlador de sesiones lo procesa antes de autenticar (`app/controllers/devise_overrides/sessions_controller.rb:13`), lo consume cuando es impersonación (`:70`) y lo invalida después del uso (`:94`). El callback de OmniAuth emite el enlace con el correo y el token en la query (`app/controllers/devise_overrides/omniauth_callbacks_controller.rb:44`).

## 8. Segundo factor

Chatwoot **ya tiene** TOTP nativo, y no está detrás de `enterprise?`.

| Hecho | Evidencia |
|---|---|
| Secreto TOTP por usuario | `db/schema.rb:1684` (`otp_secret`) |
| Marca de último paso consumido | `db/schema.rb:1685` (`consumed_timestep`) |
| Bandera de 2FA activo | `db/schema.rb:1686` (`otp_required_for_login`) |
| Códigos de respaldo | `db/schema.rb:1687` (`otp_backup_codes`) |
| Versión de confianza de dispositivo | `db/schema.rb:1688` (`device_trust_version`) |
| El secreto es único | `db/schema.rb:1691` (índice único sobre `otp_secret`) |
| Endpoints de MFA | `config/routes.rb:525-528` |
| Sesiones y dispositivos confiables | `config/routes.rb:529-530` |

Esto es independiente de `AUTH-001`. `mocter-admin` no hereda este 2FA: son sistemas separados con padrones de usuario distintos.

## 9. Un token de servicio no pasa por 2FA

El camino de `AccessToken` no consulta `otp_required_for_login`. Un token emitido por la Platform API es una credencial estática: vale hasta que se borre la fila.

Consecuencias para `mocter-admin`:

1. El token de servicio por inquilino debe rotarse por procedimiento, no por expiración. La columna `expiry` del endpoint de emisión es informativa; no hay vencimiento aplicado en `access_tokens`.
2. Un token filtrado da acceso completo a la cuenta con el rol de su dueño.
3. La revocación es `DELETE` de la fila. No hay lista de revocación intermedia.

## 10. Consecuencias para `mocter-admin`

| Necesidad | Camino verificado |
|---|---|
| Crear la cuenta del inquilino | `POST /platform/api/v1/accounts` |
| Que la cuenta sea administrable por la app | Debe crearla la `PlatformApp`, no la interfaz |
| Crear el usuario de servicio | `POST /platform/api/v1/users` |
| Darle rol de administrador en la cuenta | `POST /platform/api/v1/accounts/{id}/account_users` con `role` |
| Obtener su token para `/api/v1` | `POST /platform/api/v1/users/{id}/token` |
| Entrar al panel como ese usuario | `GET /platform/api/v1/users/{id}/login` (enlace SSO de 5 minutos) |
| Revocar el acceso | `DELETE` del `AccessToken` o del `AccountUser` |

La distinción importa: borrar el `AccountUser` quita la pertenencia; borrar el `AccessToken` invalida la credencial. Son operaciones distintas y ninguna reemplaza a la otra.

## 11. Lo que no se verificó

- No se ejecutó el resolutor de rutas ni una petición real. Las rutas se leen de `config/routes.rb`.
- No se auditó el contenido de las 27 policies una por una; se verificó su existencia y el punto de aplicación.
- No se comprobó el comportamiento de DeviseTokenAuth en ejecución, solo su inclusión y el punto de bifurcación.

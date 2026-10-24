# AUTH-001 · Diseño · Sistema híbrido de autenticación y autorización

| Atributo | Valor |
|---|---|
| ID | AUTH-001 |
| Versión | 1.0 |
| Fecha | 2026-10-20 · actualizado 2026-10-22 |
| Depende de | [`requirements.md`](requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [CHW-001](../chw-001-inventario-chatwoot/design.md) · [OPS-001](../ops-001-operacion-continuidad-observabilidad/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Una identidad, una sesión, un inquilino activo.** La identidad es global; la membresía de inquilino es 1:0..1. La sesión transporta solo un identificador opaco y el servidor resuelve el resto.
2. **El navegador no guarda autoridad.** No hay JWT en el panel ni roles en la cookie. La cookie de sesión `__Host-` es `HttpOnly`, `Secure` y `SameSite=Strict`; el estado vive en Postgres y Redis.
3. **La identidad no se mezcla con la tenencia.** `AUTH-001` autentica; `ADM-001` decide membresía, roles y permisos. `tenant_users` no se consulta para validar una contraseña.
4. **Falla cerrado.** Sin Postgres no se valida una sesión; sin Redis no se aceptan logins nuevos ni se omiten límites de tasa. Un fallo de un proveedor externo no habilita un camino alternativo inseguro.
5. **No se filtra la existencia de cuentas.** Registro, login y recuperación responden de forma genérica; el correo es el canal que confirma la existencia.
6. **Los secretos no viven con los datos que protegen.** La clave TOTP está fuera de la base; las contraseñas se guardan con Argon2id; los tokens de correo se guardan como hash.
7. **La sesión es revocable y horizontal.** Cualquier réplica valida contra el store compartido; no hay sesiones locales ni sticky sessions.
8. **La ubicación de la identidad se resuelve antes de autenticar.** El Router conserva el correo y el puntero; una celda dedicada conserva credenciales e identidades y el Router no las replica.

> **Cómo leer este documento.** §2 fija límites. §3 ubica la arquitectura. §4 define el modelo. §5 explica los flujos. §6 fija contratos HTTP y cookies. §7 cubre seguridad. §8 operación. §9 verificación. §10 riesgos. §11 traza requisitos.

## 2. Contexto y límites

| Documento | Qué fija | Qué deja a AUTH-001 |
|---|---|---|
| DAT-001 | Router Global, celdas, RLS, `routing_version`, Redis dedicado del plano de control. | Cómo se resuelve la ubicación de identidad y cómo se guarda la sesión sin fijar `cell_id`. |
| ADM-001 | `users` global, `active_client_id`, `tenant_users`, `owner_user_id`, onboarding, invitaciones, roles y scopes. | Autenticación, vinculación de identidades, 2FA, sesión y SSO a Chatwoot. |
| CHW-001 | Chatwoot no comparte credenciales; SSO nativo con TTL de 5 minutos y un solo uso; un solo `AccountUser` por usuario. | Emisión del token SSO y verificación de que el usuario tiene una sola membresía activa. |
| OPS-001 | Redis 7+ del plano de control, respaldo del Router y RTO. | Qué se invalida tras un restore y cómo se comporta auth cuando Redis o Postgres fallan. |

**AUTH-001 hace:** registro nativo, login nativo, Google y Facebook, verificación de correo, recuperación de contraseña como soporte operativo, 2FA TOTP, sesión opaca, vinculación/desvinculación de identidades, rate limiting y emisión del SSO a Chatwoot.

**AUTH-001 no hace:** crear inquilinos, asignar planes, crear `tenant_users`, aprovisionar cuentas de Chatwoot, definir roles de plataforma, inquilino o comunidad, ni autenticar contactos finales. La landing sigue pública.

## 3. Arquitectura

```text
Navegador
   │ HTTPS
   ▼
Traefik ──► apps/admin (módulo identity)
              ├── Router Global: users · identities · sessions · tokens
              ├── Redis 7+: caché de sesión · rate limit · state OAuth · challenges
              ├── Celda dedicada: users · identities (solo identidad aislada)
              ├── Google / Facebook
              ├── SMTP
              └── Chatwoot: SSO nativo
```

| Componente | Dónde corre | Función |
|---|---|---|
| `identity` | `apps/admin`, sin servicio aparte | Orquesta registro, login, federación, 2FA, sesión y SSO |
| Router Global | PostgreSQL del plano de control | Identidad, identidades federadas, sesiones y tokens de un solo uso |
| Redis 7+ | Plano de control | Caché de sesión, revocación, rate limiting, state OAuth y challenges |
| Celda dedicada | PostgreSQL de la celda | Credenciales e identidades cuando el aislamiento normativo lo exige |
| Google | Externo | OIDC; correo verificado |
| Facebook | Externo | OAuth 2.0 + Graph API; correo solo si el proveedor lo devuelve |
| SMTP | Externo | Verificación de correo y recuperación de contraseña |
| Chatwoot | Plano de soporte | Consume el token SSO; no comparte contraseñas |

### 3.1 Ubicación de la identidad

| Caso | Credenciales y TOTP | Identidades federadas | Sesión | Login |
|---|---|---|---|---|
| Usuario en Router | Router | Router | Router | `users.email` → Router |
| Usuario en celda dedicada | Celda | Celda | Router | `users.email` → `identity_location` → celda |
| Usuario sin inquilino | Router | Router | Router | `active_client_id` nulo |

`identity_location` usa `router` o el UUID de la celda (`cell_id`). En una celda dedicada, el Router conserva `email`, `identity_location` y `active_client_id`; no conserva `password_hash`, secretos TOTP ni filas de `identities`. La sesión siempre vive en el Router, incluso cuando la verificación ocurrió en una celda.

### 3.2 Camino de una petición autenticada

1. Traefik entrega la petición a cualquier réplica de `apps/admin`.
2. El middleware lee `__Host-mocter_sid`, calcula SHA-256 y busca la sesión en Redis.
3. Si Redis no la tiene, consulta `sessions` en Postgres y repuebla la caché.
4. Si la sesión está vencida o revocada, responde `401` y borra la cookie.
5. `ADM-001` resuelve roles y permisos contra `tenant_users` y los scopes de plataforma; la cookie no contiene roles.
6. Si el usuario tiene una membresía activa, la sesión debe llevar el mismo `client_id`; una discrepancia revoca la sesión.

## 4. Modelo de datos

### 4.1 Router Global — schema `admin`

| Tabla | Clave | Reglas |
|---|---|---|
| `users` | `id` | Ancla global: `email` único sin distinguir mayúsculas, `email_verified_at`, `identity_location`, `active_client_id` nullable, `password_hash` nullable, secretos TOTP, `status`, `display_name`, `avatar_url` |
| `identities` | `id` | Identidad federada: `user_id`, `provider` (`google` o `facebook`), `provider_user_id`, `provider_email`, `email_verified`, `display_name`, `avatar_url`, `linked_at`, `last_login_at` |
| `sessions` | `id` | `sid_hash` único, `user_id`, `client_id` nullable, `routing_version`, `csrf_hash`, `auth_method`, `mfa_at`, `reauth_at`, `created_at`, `last_seen_at`, `expires_at`, `absolute_expires_at`, `revoked_at`, `revoked_reason`, `ip_hash`, `user_agent_hash` |
| `email_verification_tokens` | `id` | `user_id`, `token_hash` único, `expires_at`, `consumed_at`, `created_at`, `requested_ip_hash` |
| `password_reset_tokens` | `id` | `user_id`, `token_hash` único, `purpose` (`reset` o `setup`), `expires_at`, `consumed_at`, `created_at`, `requested_ip_hash` |
| `user_consents` | `id` | `user_id`, `purpose` (`data_treatment`, `commercial_comms`), `policy_version`, `status` (`granted`/`revoked`), `granted_at`, `revoked_at`, `channel`, `evidence_ref` |

`users` no tiene `client_id` y no usa RLS. `sessions` puede llevar `client_id`, pero no es una tabla de tenencia. `identities` no lleva tenencia. Estas seis tablas (identidad, sesión, tokens y `user_consents`) se protegen con el rol `mocter_auth` y filtros de aplicación. Todas siguen la convención global de auditoría (DAT-001 RF-10.9): `created_at`, `updated_at`, `created_by`, `updated_by`; `sessions` usa `revoked_at` y los tokens `consumed_at` como su baja lógica, sin duplicar `deleted_at`.

Columnas de `users`:

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` | PK; UUIDv7 |
| `email` | `text` | `NOT NULL`; minúsculas; `CHECK (email = lower(email))`; índice único sobre `lower(email)` |
| `email_verified_at` | `timestamptz` | Nulo = pendiente de verificación |
| `password_hash` | `text` | Nulo = cuenta solo federada; Argon2id con parámetros y salt incluidos |
| `password_updated_at` | `timestamptz` | Nulo si no tiene contraseña |
| `totp_secret_ciphertext` | `bytea` | Nulo si 2FA inactivo; AES-256-GCM con nonce y tag |
| `totp_key_id` | `text` | Identifica la clave usada; nulo si no hay secreto |
| `totp_enabled_at` | `timestamptz` | Nulo = 2FA inactivo |
| `totp_pending_secret_ciphertext` | `bytea` | Secreto de enrolamiento aún no confirmado |
| `totp_pending_key_id` | `text` | Clave del secreto pendiente |
| `totp_pending_created_at` | `timestamptz` | Vence a los 10 minutos |
| `totp_last_used_step` | `bigint` | Último `time_step` aceptado; evita reutilizar un código |
| `identity_location` | `text` | `router` o el UUID de la celda (`cell_id`); `CHECK` correspondiente |
| `active_client_id` | `uuid` | FK `clients(id)` `ON DELETE SET NULL`; guardián global de 1:0..1 |
| `status` | `text` | `active` o `disabled` |
| `display_name` | `text` | Nombre para la interfaz; puede venir del proveedor |
| `avatar_url` | `text` | URL validada; nunca se descarga en el login |
| `created_at` / `updated_at` | `timestamptz` | Auditoría básica |

`identities` tiene `UNIQUE (provider, provider_user_id)` y `UNIQUE (user_id, provider)`. No guarda access tokens, refresh tokens ni códigos OAuth. `provider_email` es el correo que devolvió el proveedor y puede diferir del correo del ancla; la vinculación usa el correo verificado del ancla.

`sessions` usa `id uuid PRIMARY KEY`, `sid_hash bytea UNIQUE NOT NULL` (32 bytes), `csrf_hash bytea NOT NULL` (32 bytes) y `CHECK (absolute_expires_at > created_at)` y `CHECK (expires_at <= absolute_expires_at)`. No se guarda el `sid` en claro. `auth_method` es `password`, `google` o `facebook`. `mfa_at` nulo si la sesión no pasó 2FA. `reauth_at` es la última prueba explícita de contraseña/TOTP y habilita acciones sensibles durante 5 minutos. `routing_version` es nullable: queda nulo cuando el usuario no tiene membresía. `id` es el identificador público que usa `GET /auth/sessions`; `sid_hash` nunca se expone.

El cifrado de los secretos TOTP usa AES-256-GCM con nonce y tag, y AAD `user_id:key_id`; el AAD impide mover un ciphertext entre usuarios o claves.

Los tokens de verificación y de recuperación son de 32 bytes, se guardan solo como `token_hash = SHA-256(token)`, tienen `expires_at` y `consumed_at`, y se consumen en una transacción con la marca. El token de `password_reset_tokens` lleva `purpose`: `reset` para una cuenta con contraseña y `setup` para una cuenta federada que establece la primera. `requested_ip_hash` es un hash con `AUTH_RATE_LIMIT_PEPPER`; no se guarda la IP en claro. El token en claro solo existe en el enlace enviado por correo.

`user_consents` registra el consentimiento de los usuarios de la plataforma (Habeas Data, Ley 1581 de 2012, Colombia): el registro exige aceptación del aviso de privacidad y autorización de tratamiento (`purpose = data_treatment`); el consentimiento comercial (`commercial_comms`) es opcional y puede capturarse en el onboarding (ADM-001). Append-only por otorgamiento; la revocación marca `revoked_at` en la fila vigente. Los derechos del titular (acceso, corrección, supresión con anonimización, revocación) se ejercen por procedimiento de soporte auditado.

### 4.2 Celda dedicada — schema `admin`

| Tabla | Clave | Reglas |
|---|---|---|
| `users` | `id` | Mismo `id` que el Router; `client_id`, `email`, `email_verified_at`, `password_hash`, `password_updated_at`, secretos TOTP (`totp_secret_ciphertext`, `totp_key_id`, `totp_enabled_at`, `totp_pending_secret_ciphertext`, `totp_pending_key_id`, `totp_pending_created_at`, `totp_last_used_step`), `status`, `display_name`, `avatar_url`; RLS |
| `identities` | `id` | `client_id`, `user_id`, `provider`, `provider_user_id`, `provider_email`, `email_verified`, `display_name`, `avatar_url`, `linked_at`, `last_login_at`; RLS |

La celda dedicada no tiene `sessions`: la sesión sigue en el Router. `users.id` se copia desde el Router y no se genera uno nuevo; `users` usa `UNIQUE (client_id, lower(email))`. `identities` lleva `client_id` para RLS y usa `UNIQUE (client_id, provider, provider_user_id)` y `UNIQUE (client_id, user_id, provider)`.

La tabla `users` de la celda es la misma proyección local que define ADM-001 §5.2; AUTH-001 le agrega las columnas de credenciales y TOTP. `identities` es propiedad de AUTH-001.

El rol `mocter_auth` de la celda puede `SELECT` y `UPDATE` en `users`, y `SELECT`, `INSERT` y `UPDATE` en `identities`; el `INSERT` es necesario para vincular una identidad federada nueva. Antes de consultar, la aplicación ejecuta `SET LOCAL app.current_client_id` con el `client_id` resuelto en el Router; no usa `BYPASSRLS`.

### 4.3 Invariantes e índices

```sql
-- Un correo global, sin distinguir mayúsculas.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Una identidad por proveedor y sujeto; una por proveedor y usuario.
CREATE UNIQUE INDEX identities_provider_subject_unique
  ON identities (provider, provider_user_id);
CREATE UNIQUE INDEX identities_user_provider_unique
  ON identities (user_id, provider);

-- Sesiones activas y limpieza.
CREATE INDEX sessions_user_active_idx
  ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_client_active_idx
  ON sessions (client_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Tokens de un solo uso.
CREATE UNIQUE INDEX email_verification_token_hash_unique
  ON email_verification_tokens (token_hash);
CREATE UNIQUE INDEX password_reset_token_hash_unique
  ON password_reset_tokens (token_hash);
```

En la celda dedicada, la unicidad es por inquilino:

```sql
CREATE UNIQUE INDEX cell_users_email_unique
  ON users (client_id, lower(email));
CREATE UNIQUE INDEX cell_identities_provider_subject_unique
  ON identities (client_id, provider, provider_user_id);
CREATE UNIQUE INDEX cell_identities_user_provider_unique
  ON identities (client_id, user_id, provider);
```

Reglas que no se pueden dejar solo al índice:

- `users.active_client_id` se reserva con `UPDATE ... WHERE active_client_id IS NULL` en la operación de alta o invitación de ADM-001. AUTH-001 no crea membresías.
- Un usuario puede tener varias sesiones activas, con un máximo de 10 por usuario; al superarlo se revoca la más antigua.
- Un token de correo se consume una sola vez; el consumo y la marca `consumed_at` ocurren en la misma transacción.
- `email` se normaliza con `trim` y `lowercase`; no se eliminan sufijos `+` ni puntos.
- La contraseña no se recorta: los espacios iniciales y finales son parte del secreto.

Toda tabla y columna no evidente lleva comentario en la base, según `.agents/AGENTS.md` §4.5. Las migraciones son expandir → contraer; no se editan migraciones ya versionadas.

## 5. Flujos

### 5.1 Registro nativo

1. `POST /auth/register` recibe correo y contraseña. Valida `Origin`, content type y rate limit. Normaliza el correo y aplica la política antes de tocar la base. Exige aceptación del aviso de privacidad y autorización de tratamiento de datos personales (Ley 1581 de 2012, Colombia); sin ella no se crea la cuenta, y el otorgamiento se registra en `user_consents` con `policy_version` y canal.
2. Si el correo ya existe, responde siempre `202` con el mensaje genérico: «Si la cuenta existe, enviamos un correo con instrucciones.» No crea un usuario nuevo ni revela el método existente.
   - Si la cuenta es federada, el correo enviado contiene un token `setup` de 30 minutos; al confirmarlo se setea `email_verified_at`, se guarda la contraseña Argon2id y se vincula la credencial nativa al mismo `user_id` sin crear otra cuenta. La contraseña enviada en el registro no se persiste para una cuenta federada: el formulario de `setup` la solicita de nuevo junto con el token.
   - Si la cuenta es nativa y no está verificada, el correo reenvía el enlace de verificación; si ya está verificada, invita a iniciar sesión o a recuperar la contraseña.
3. Si el correo no existe, crea `users` con `email_verified_at = NULL`, `password_hash` Argon2id y `status = 'active'`.
4. Genera un token de verificación de 32 bytes; guarda solo `token_hash` con vencimiento de 24 horas y envía el enlace por SMTP. No crea sesión.
5. Responde `202` con el mismo mensaje genérico. Un fallo de SMTP se registra y permite reenviar; no se expone el token ni el error interno.

La verificación se confirma con `POST /auth/email/verify/confirm`, no con un `GET` que consuma el token: los escáneres de correo no deben invalidarlo. El `GET` solo muestra la pantalla de confirmación. Al confirmar, se marca `email_verified_at` y se consume el token; el usuario vuelve al login.

Con Google el correo se considera verificado y `email_verified_at` se completa en el alta. Con correo y contraseña, `ADM-001` impide crear el inquilino hasta que `email_verified_at` exista (RF-14.6). El login puede completarse antes de verificar para permitir reenviar el correo, pero las rutas de negocio y el onboarding consultan la marca y rechazan el alta.

### 5.2 Inicio de sesión nativo

1. `POST /auth/login` aplica rate limit y normaliza el correo.
2. Resuelve `users.email` en el Router. Si `identity_location` no es `router`, conecta a la celda indicada con `mocter_auth`, fija `SET LOCAL app.current_client_id = users.active_client_id` y verifica contra `users` de la celda. Si la celda no responde, devuelve `503`; no hay fallback al Router porque allí no están las credenciales. Si `identity_location` apunta a una celda y `active_client_id` es nulo, la identidad está inconsistente: responde `503`, alerta y no autentica.
3. Si el usuario no existe, no tiene `password_hash` o está `disabled`, ejecuta una verificación Argon2id ficticia con un hash de costo equivalente y responde `401` genérico. El tiempo de respuesta no debe distinguir esos casos.
4. Verifica Argon2id. Si el hash usa parámetros anteriores a los vigentes, lo rehasha en el mismo login.
5. Si `totp_enabled_at` no es nulo, crea un challenge de 2FA y no emite sesión todavía. Si no, crea la sesión.
6. La sesión toma `client_id = users.active_client_id` y el `routing_version` vigente de `client_routing`; si no hay membresía, `client_id` y `routing_version` quedan nulos.
7. Crea la sesión con `reauth_at = now()`; devuelve `200` con `user`, `emailVerified`, `clientId` y `expiresAt`, y setea la cookie de sesión y la cookie CSRF.

Mensaje de credenciales inválidas: «Correo o contraseña incorrectos.» No se distingue correo inexistente, contraseña incorrecta, cuenta federada o cuenta deshabilitada.

### 5.3 Federación Google y Facebook

**Inicio.** `GET /auth/{provider}/start` genera un `state` aleatorio de 32 bytes, un verificador PKCE S256 y, en Google, un `nonce`. Guarda en Redis `auth:oauth:<provider>:<sha256(state)>` con proveedor, verificador, nonce, `return_to` relativo y vencimiento de 10 minutos. Setea una cookie de state separada, `SameSite=Lax`, `HttpOnly`, `Secure`, con `Path` acotado al proveedor. El `return_to` solo acepta rutas relativas de la aplicación; nunca una URL absoluta.

**Callback.** `GET /auth/{provider}/callback` valida que el `state` de la query coincida con la cookie, consume la entrada de Redis una sola vez y canjea el código. Google se valida como OIDC: emisor, audiencia, `exp`, `nonce` y `email_verified`. Facebook no expone un proveedor OIDC completo; se usa OAuth 2.0 + Graph API, la interfaz oficial del proveedor, con `state` y redirect URI exacta. Solo se acepta el correo si el proveedor lo devuelve y la cuenta lo expone como verificado; si no, se rechaza con «El proveedor no devolvió un correo verificado.» La desviación se registra en §10.

**Resolución.** El orden es:

1. Buscar `identities` por `(provider, provider_user_id)` en la ubicación de identidad del usuario (`identity_location`). Si existe, iniciar sesión con ese `user_id`.
2. Si no existe, buscar `users` por correo verificado del proveedor en esa misma ubicación.
3. Si no existe usuario, crear `users` con `email_verified_at` completo, crear `identities` y emitir sesión.
4. Si existe usuario, aplicar §5.4; nunca se vincula automáticamente una identidad a una cuenta cuya verificación de correo no esté probada.

La búsqueda usa la misma resolución que el login nativo: Router o celda dedicada. Si la celda no responde, el callback devuelve `503` y no intenta el Router.

Un error del proveedor devuelve `503` con el texto exacto «Proveedor temporalmente fuera de servicio»; no se muestran trazas ni se afecta el login nativo. Los tokens de acceso del proveedor no se persisten.

### 5.4 Vinculación y desvinculación

| Caso | Acción |
|---|---|
| La identidad federada ya existe | Login directo; actualiza `last_login_at` |
| El correo federado coincide con una cuenta nativa verificada y la sesión tiene `reauth_at` de menos de 5 minutos | Vincular tras reautenticación |
| El correo federado coincide con una cuenta nativa verificada sin sesión | Pedir contraseña y, si tiene 2FA, código TOTP; luego vincular |
| El correo federado coincide con una cuenta solo federada | Enviar confirmación al correo; al confirmar, vincular y emitir sesión |
| El correo federado coincide con una cuenta no verificada | No vincular; exigir primero la verificación del correo |
| El registro nativo usa el correo de una cuenta federada | Enviar enlace para establecer contraseña; no crear otra cuenta |

La vinculación se hace en una transacción sobre la ubicación de identidad del usuario (Router o celda dedicada): inserta `identities`, actualiza el usuario y audita. Si el proveedor devuelve un correo distinto al del ancla, se conserva `provider_email` como dato informativo y la decisión se toma por el correo del ancla. Cuando la vinculación parte de una sesión existente, `POST /auth/link/{provider}/start` exige sesión y CSRF, guarda en Redis el `user_id`, el proveedor y el `return_to`, y usa una cookie de state con `Path=/auth/link`. El callback `/auth/link/{provider}/callback` valida la cookie de state y la entrada de Redis, no la cookie de sesión: la cookie `__Host-mocter_sid` es `SameSite=Strict` y el navegador no la envía en la navegación de vuelta desde el proveedor. La entrada de Redis, consumida una sola vez, identifica al usuario y la intención; no reutiliza la cookie del login ni relaja la cookie de sesión.

**Desvinculación.** Requiere sesión, reautenticación con contraseña o TOTP y al menos otro método de acceso. No se puede desvincular el último método. Si se desvincula el proveedor usado para el último login, se revocan las demás sesiones y se rota la actual. No se toca Chatwoot: la vinculación es de la cuenta de plataforma, no del directorio de Chatwoot.

### 5.5 Autenticación de doble factor

**Disponibilidad.** Solo para cuentas con contraseña: `password_hash` no nulo en el Router o en la celda dedicada donde vive su identidad. Una cuenta exclusivamente federada no puede activar 2FA; si establece una contraseña, pasa a ser elegible. La restricción viene de RF-03 y se aplica en servidor, no solo en la interfaz.

**Enrolamiento.**

1. `POST /auth/2fa/enroll` exige contraseña válida y `reauth_at` de menos de 5 minutos; si la ventana venció, vuelve a pedir la contraseña en la misma petición.
2. Genera un secreto de 20 bytes, lo codifica en base32 y lo cifra con AES-256-GCM usando la clave activa. Guarda `totp_pending_secret_ciphertext`, `totp_pending_key_id` y `totp_pending_created_at`.
3. Devuelve la URI `otpauth://totp/Mocter:<email>?secret=...&issuer=Mocter&algorithm=SHA1&digits=6&period=30` y el secreto en texto plano una sola vez. El frontend dibuja el QR; el servidor no guarda la imagen.
4. `POST /auth/2fa/confirm` valida un código de 6 dígitos con tolerancia de ±1 paso de 30 segundos. Si es válido, mueve el secreto pendiente a activo, setea `totp_enabled_at`, limpia el pendiente y registra `totp_last_used_step`.
5. Al activar 2FA se revocan las demás sesiones y se rota la actual; el usuario continúa autenticado con `mfa_at` actualizado.

**Login con 2FA.** El login nativo válido no crea sesión: crea `auth:challenge:<sha256(challenge)>` en Redis, con `user_id`, `client_id` propuesto, `routing_version`, `identity_location`, intentos y vencimiento de 5 minutos. Setea una cookie `__Host-mocter_challenge` `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age=300`. `POST /auth/2fa/verify` valida el código contra el secreto de esa ubicación; si es correcto, consume el challenge y crea la sesión con `mfa_at` y `reauth_at` actuales. Si falla 5 veces, se elimina el challenge y se exige un login nuevo.

**Replay.** Un código no se acepta dos veces. `totp_last_used_step` se actualiza en la misma transacción que la validación; un código de un paso anterior o igual al último aceptado se rechaza. La tolerancia ±1 se evalúa sobre el paso actual antes de comparar con `totp_last_used_step`: el primer código de la ventana puede ser anterior, pero después de un login exitoso solo avanza el paso.

**Desactivación.** Exige contraseña actual y código TOTP válido. Borra el secreto activo y el pendiente, revoca las demás sesiones, rota la actual y audita. No se permite desactivar 2FA solo con la sesión, ni por correo.

**Pérdida del dispositivo.** No hay códigos de recuperación de autoservicio en esta versión. El acceso se restablece con un procedimiento de soporte que verifica identidad, revoca todas las sesiones, borra el secreto TOTP en la ubicación de identidad del usuario (Router o celda dedicada) y deja registro en `audit_log`; el usuario debe volver a enrolar. El dueño del procedimiento se define en T-20. Esta ausencia es un riesgo operativo, no un requisito nuevo.

### 5.6 Sesión

**Cookie.** `__Host-mocter_sid` con `sid` de 32 bytes en base64url. Atributos: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sin `Domain`, `Max-Age=43200`. El prefijo `__Host-` obliga a `Secure`, `Path=/` y ausencia de `Domain`; no se usa en desarrollo sobre HTTP, donde las pruebas usan HTTPS local.

**Registro.** `sessions` guarda `id`, `sid_hash = SHA-256(sid)`, `user_id`, `client_id`, `routing_version`, `csrf_hash`, `auth_method`, `mfa_at`, `reauth_at`, `created_at`, `last_seen_at`, `expires_at` y `absolute_expires_at`. `expires_at` es el vencimiento por inactividad (30 minutos); `absolute_expires_at` es el máximo absoluto (12 horas) y no se extiende. `last_seen_at` se actualiza como máximo una vez por minuto para no escribir en cada petición; en la misma escritura, `expires_at` se extiende a `now() + 30 minutos`, sin superar `absolute_expires_at`.

**Validación.** Busca `auth:session:<sha256(sid)>` en Redis. Si no está, consulta Postgres; si la fila existe, no está revocada y no venció, repuebla Redis con TTL de 30 minutos. Si Redis está caído, usa Postgres. La caché es una optimización, no la autoridad: la petición igual resuelve el estado del usuario y sus permisos contra Postgres; si Postgres no responde, contesta `503` aunque la sesión esté en Redis. No hay caché de sesión en memoria del pod ni sticky sessions.

**Rotación.** Se emite un `sid` nuevo y se revoca el anterior en login, verificación de 2FA, cambio de contraseña, activación/desactivación de 2FA, vinculación/desvinculación de identidad y elevación de privilegios de plataforma o cambio de scope sensible. Un cambio de rol de inquilino no exige reemitir la cookie porque los roles se resuelven en cada petición; si ADM-001 retira un rol o un scope sensible, llama a `revokeUserSessions`. La rotación también renueva el token CSRF. La cookie vieja se sobrescribe; si el navegador conserva dos, solo la nueva tiene una fila válida.

**Revocación.** `revokeSession` marca `revoked_at` y `revoked_reason` y borra la clave de Redis. `revokeUserSessions` revoca todas las sesiones del usuario, opcionalmente excepto la actual. `revokeClientSessions` revoca todas las sesiones con un `client_id` cuando el inquilino se suspende o se da de baja. La revocación es inmediata para las réplicas porque no hay caché local ni sticky sessions.

**CSRF y Origin.** El token CSRF es aleatorio de 32 bytes; se guarda su hash en `sessions.csrf_hash` y se setea en la cookie `__Host-mocter_csrf` (`Secure`, `SameSite=Strict`, `Path=/`, sin `HttpOnly` para que el cliente la lea). Las mutaciones autenticadas exigen `X-CSRF-Token`; el servidor compara el hash del valor recibido con `sessions.csrf_hash` en tiempo constante. La rotación de sesión renueva la cookie CSRF. Todas las peticiones con origen cruzado se rechazan contra una allowlist exacta configurada por entorno (`https://admin.mocter.co` en producción); no se acepta `null` ni comodines. Los POST públicos de login y registro también validan `Origin` y content type.

**Sesiones múltiples y logout.** Se permiten hasta 10 sesiones activas por usuario. Al crear la 11.ª se revoca la más antigua. `GET /auth/sessions` lista las sesiones por su `id` sin exponer el `sid` ni el `sid_hash`; `DELETE /auth/sessions/:id` revoca una sesión propia usando ese `id`; `POST /auth/logout` revoca la actual y borra las cookies `__Host-mocter_sid`, `__Host-mocter_csrf` y `__Host-mocter_challenge`; `POST /auth/logout-all` revoca todas y borra las mismas cookies.

**Cambio de membresía o estado.** Si `users.active_client_id` cambia, ADM-001 llama a `revokeUserSessions(user_id, 'membership_changed')`; la única excepción es el flujo de onboarding o invitación, que puede llamar a `bindSessionToClient(sid, client_id, routing_version)` en la misma transacción y revocar las demás. Si `users.status` pasa a `disabled`, ADM-001 revoca todas las sesiones y el middleware de autorización también rechaza un usuario deshabilitado. Si el `client_id` de la sesión no coincide con `users.active_client_id`, la sesión se revoca.

**`routing_version`.** La sesión guarda la versión vigente; si DAT-001 incrementa la versión por una migración de celda, la aplicación recarga la ruta y actualiza la sesión. Nunca se firma un `cell_id` en la cookie.

**Restore.** Después de un restore del Router, antes de abrir tráfico se ejecuta `UPDATE sessions SET revoked_at = now(), revoked_reason = 'restore' WHERE revoked_at IS NULL` y se vacían las claves `auth:session:*`, `auth:challenge:*` y `auth:oauth:*`. Todos los usuarios vuelven a iniciar sesión.

### 5.7 Verificación de correo

`POST /auth/email/verify/request` acepta un correo o una sesión. Responde `202` siempre. Si existe una cuenta nativa no verificada, invalida el token anterior, crea uno nuevo con 32 bytes, guarda el hash, vence en 24 horas y envía el enlace. Límite: 3 reenvíos por usuario cada 15 minutos y 10 por IP por hora.

`POST /auth/email/verify/confirm` recibe el token, calcula su hash, verifica que no esté vencido ni consumido, marca `email_verified_at` y consume el token en una transacción. Un token inválido responde `400` genérico. No se registra el token en logs, analítica ni `Referer`.

### 5.8 Recuperación y cambio de contraseña

La recuperación no está en el documento de origen, pero es necesaria para una cuenta nativa; se trata como soporte operativo, no como una capacidad nueva de negocio.

- `POST /auth/password/forgot` responde `202` genérico. Si la cuenta tiene contraseña, invalida tokens anteriores, crea un token de 32 bytes con hash, vence en 30 minutos y envía el enlace. Límite: 3 por cuenta/hora y 10 por IP/hora. Si la cuenta es solo federada, `forgot` no emite token: el enlace para establecer la primera contraseña nace del flujo de registro (§5.1).
- `POST /auth/password/reset` valida el token, la política y consume el token. Si `purpose = 'setup'`, exige que la cuenta no tenga contraseña y setea `email_verified_at`; si `purpose = 'reset'`, exige que ya tenga contraseña. Actualiza `password_hash`, `password_updated_at`, revoca todas las sesiones y audita. No inicia sesión automáticamente.
- `POST /auth/password/change` exige sesión y contraseña actual; si hay 2FA, exige TOTP. Actualiza el hash, `reauth_at`, revoca las demás sesiones y rota la actual.

### 5.9 Invitaciones, onboarding y tenencia

La invitación y el alta del inquilino son de `ADM-001` (D-26, D-29, RF-14). AUTH-001 aporta las piezas que no puede decidir ADM:

1. El invitado debe autenticarse con el correo invitado y tener `email_verified_at`; si no tiene cuenta, se registra por el camino nativo o federado y verifica el correo.
2. Antes de crear `tenant_users`, ADM-001 reserva `users.active_client_id` con `UPDATE ... WHERE active_client_id IS NULL`. Si no afecta una fila, rechaza la invitación o el alta; no hay segunda membresía.
3. AUTH-001 no crea `tenant_users` ni `clients`. Expone `bindSessionToClient` para que ADM-001 actualice la sesión del onboarding después de crear la membresía; las demás sesiones se revocan.
4. El alta manual de `platform_sales` crea o vincula el usuario en la misma operación; si el correo ya existe, usa la identidad existente, nunca duplica. Si el usuario ya tiene `active_client_id`, la operación falla.
5. La invitación y el alta no cambian `identity_location` por sí mismas. Si el inquilino recibe celda dedicada, la migración de identidad es una operación separada y transaccional (§5.12).

Un usuario con membresía activa en un inquilino no puede aceptar una invitación a otro. La regla se valida en ADM-001; AUTH-001 solo garantiza que la sesión y el correo sean del usuario correcto.

### 5.10 SSO a Chatwoot

`GET /auth/chatwoot/sso?client_id=<uuid>` exige sesión válida, `session.client_id = client_id`, membresía activa y cuenta de Chatwoot en estado `active`. La verificación de membresía la hace ADM-001; `mocter_auth` no consulta `tenant_users` directamente. AUTH-001 no aprovisiona la cuenta; eso es ADM-001/CHW-001.

El módulo emite un JWT HS256 firmado con `CHATWOOT_SSO_SECRET`, con `email`, `name`, `identifier` (el `user_id`), `iat` y `exp` a 5 minutos. El token es de un solo uso: Chatwoot lo consume con `consume_sso_auth_token` (CHW-001 RF-02.3), no se guarda en la base, no se escribe en logs y se entrega a Chatwoot por HTTPS. El secreto se comparte solo entre `apps/admin` y Chatwoot; no se usa la contraseña del usuario. La ruta exacta y el nombre del parámetro se validan contra Chatwoot 4.19.0 en T-33.

No se crea ni se reutiliza un `AccountUser` para un usuario con membresía en otro inquilino. Chatwoot puede ser multi-cuenta a nivel técnico, pero la capa de sincronización de Mocter rechaza esa operación (CHW-001 RF-02.7).

### 5.11 JWT de API (reservado)

El panel no usa JWT en el navegador. Para APIs públicas o máquina-a-máquina futuras se reserva el contrato: access token de 15 minutos, refresh opaco rotativo de 30 días, revocación en Redis, claims `sub`, `client_id`, `routing_version`, `scope`, `jti` y `exp`; nunca `cell_id`. Esta spec no implementa ese camino ni lo usa para autenticar el panel.

### 5.12 Migración de identidad a celda dedicada

La migración es una operación de ADM-001 que AUTH-001 ejecuta en cuatro pasos, dentro de una ventana de mantenimiento y con la celda ya creada:

1. **Expandir.** Crear o actualizar en la celda la fila `users` con el mismo `id`, `client_id`, `email`, `email_verified_at`, `status`, `display_name` y `avatar_url` del Router. No se genera un `id` nuevo. Verificar que el correo coincide.
2. **Copiar.** Copiar `password_hash`, `password_updated_at`, los secretos TOTP activo y pendiente con su `key_id` y `totp_last_used_step`. Copiar las identidades federadas con `provider`, `provider_user_id`, `provider_email`, `email_verified`, `display_name`, `avatar_url`, `linked_at` y `last_login_at`; verificar que la cantidad y el sujeto de cada proveedor coinciden.
3. **Conmutar.** En una transacción del Router, setear `users.identity_location = '<cell_id>'` y `client_routing.identity_location = '<cell_id>'`, anular `password_hash`, `password_updated_at`, `totp_secret_ciphertext`, `totp_key_id`, `totp_enabled_at`, `totp_pending_secret_ciphertext`, `totp_pending_key_id`, `totp_pending_created_at` y `totp_last_used_step`, borrar las filas de `identities` del Router e invalidar los tokens de verificación y recuperación pendientes. Mantener `email`, `active_client_id`, `status`, `display_name` y `avatar_url`. Revocar todas las sesiones del usuario, vaciar `auth:challenge:*` e invalidar la caché de `client_routing`; si algo falla, no se conmuta.
4. **Verificar.** Iniciar sesión de prueba en la celda, verificar 2FA si estaba activo, revocar la sesión de prueba y auditar. La celda es ahora la única fuente de credenciales; el Router no tiene secretos.

Mientras la celda no responda, el login de ese usuario devuelve `503`; no se intenta el Router, porque ya no tiene credenciales. La operación inversa (celda → Router) no está contemplada en esta versión; si se necesita, es una spec aparte.

## 6. Contratos

### 6.1 Endpoints

| Método | Ruta | Auth | CSRF | Límite principal |
|---|---|---|---|---|
| `POST` | `/auth/register` | Pública | Origin | 5/h por IP |
| `POST` | `/auth/login` | Pública | Origin | 5/15 min por cuenta+IP |
| `GET` | `/auth/google/start` | Pública | — | 20/15 min por IP |
| `GET` | `/auth/google/callback` | Pública | State | 20/15 min por IP |
| `GET` | `/auth/facebook/start` | Pública | — | 20/15 min por IP |
| `GET` | `/auth/facebook/callback` | Pública | State | 20/15 min por IP |
| `POST` | `/auth/email/verify/request` | Pública o sesión | Origin | 3/15 min por usuario |
| `POST` | `/auth/email/verify/confirm` | Pública | Origin | 5/15 min por IP |
| `POST` | `/auth/password/forgot` | Pública | Origin | 3/h por cuenta |
| `POST` | `/auth/password/reset` | Pública | Origin | 5/15 min por token |
| `POST` | `/auth/2fa/verify` | Challenge | Origin | 5 intentos / 5 min por challenge |
| `GET` | `/auth/session` | Sesión | — | — |
| `POST` | `/auth/logout` | Sesión | Sí | — |
| `POST` | `/auth/logout-all` | Sesión | Sí | — |
| `GET` | `/auth/sessions` | Sesión | — | — |
| `DELETE` | `/auth/sessions/:id` | Sesión | Sí | — |
| `POST` | `/auth/password/change` | Sesión | Sí | 3/h por usuario |
| `POST` | `/auth/2fa/enroll` | Sesión | Sí | 5/15 min por usuario |
| `POST` | `/auth/2fa/confirm` | Sesión | Sí | 5/15 min por usuario |
| `POST` | `/auth/2fa/disable` | Sesión | Sí | 5/15 min por usuario |
| `POST` | `/auth/link/:provider/start` | Sesión | Sí | 10/15 min por usuario |
| `GET` | `/auth/link/:provider/callback` | State | State | 10/15 min por usuario |
| `DELETE` | `/auth/identities/:provider` | Sesión | Sí | 5/15 min por usuario |
| `GET` | `/auth/chatwoot/sso` | Sesión | — | 30/15 min por usuario |

Los `GET` que redirigen a un proveedor no requieren CSRF porque el `state` es el control; el callback lo valida. La cookie CSRF se setea al crear o rotar la sesión y solo es válida junto con una sesión activa; no se emite para una cookie anónima.

### 6.2 Cookies

| Cookie | Atributos | Uso |
|---|---|---|
| `__Host-mocter_sid` | `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sin `Domain`, `Max-Age=43200` | Sesión opaca |
| `__Host-mocter_csrf` | `Secure`, `SameSite=Strict`, `Path=/`, sin `Domain`, sin `HttpOnly`, `Max-Age=43200` | Token CSRF legible por el cliente |
| `__Host-mocter_challenge` | `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=300` | Challenge de 2FA |
| `mocter_oauth_state_google` | `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/google`, `Max-Age=600` | State OAuth Google |
| `mocter_oauth_state_facebook` | `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/facebook`, `Max-Age=600` | State OAuth Facebook |
| `mocter_oauth_link_state_google` | `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/link`, `Max-Age=600` | State de vinculación Google |
| `mocter_oauth_link_state_facebook` | `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/auth/link`, `Max-Age=600` | State de vinculación Facebook |

Las cookies de OAuth no usan el prefijo `__Host-` porque su `Path` está acotado; esa restricción es intencional y no se relaja la cookie de sesión. La vinculación desde una sesión existente usa las cookies `link_state` porque su callback vive en `/auth/link`, no en `/auth/google` ni `/auth/facebook`. La cookie CSRF no es `HttpOnly` porque el cliente debe leerla para enviar la cabecera; no es un secreto de autenticación y no permite reutilizar la sesión. El cliente lee el token de la cookie; una página SSR puede embeberlo. No se guarda en `localStorage` ni en la URL.

### 6.3 Errores públicos

| Situación | HTTP | Mensaje |
|---|---|---|
| Credenciales inválidas | `401` | «Correo o contraseña incorrectos.» |
| Contraseña fuera de política | `422` | «La contraseña debe tener al menos 7 caracteres, una mayúscula, un número y un carácter especial.» |
| Código 2FA inválido | `401` | «Código de verificación inválido o vencido.» |
| Proveedor caído | `503` | «Proveedor temporalmente fuera de servicio» |
| Proveedor sin correo verificado | `422` | «El proveedor no devolvió un correo verificado.» |
| Rate limit | `429` | «Demasiados intentos. Intentá de nuevo más tarde.» |
| Cuenta existente en registro | `202` | «Si la cuenta existe, enviamos un correo con instrucciones.» |
| 2FA en cuenta federada | `403` | «La autenticación de doble factor solo está disponible para cuentas con contraseña.» |
| Sesión inválida | `401` | «La sesión venció. Iniciá sesión de nuevo.» |

Los errores internos devuelven `500` o `503` con un código opaco; nunca incluyen stack traces, SQL, correo, token ni nombre del proveedor. Todos los mensajes de usuario de esta sección viven en los diccionarios de la directiva de i18n (`es`/`en`, Español por defecto); la tabla muestra el texto en español.

### 6.4 Operaciones internas

| Operación | Contrato |
|---|---|
| `resolveIdentityLocation(email)` | Devuelve `router` o `cell_id`; no autentica |
| `authenticateNative(email, password)` | Verifica el hash en la ubicación de identidad y determina si requiere challenge 2FA; devuelve usuario o challenge |
| `createSession(userId, clientId, routingVersion, method, mfaAt)` | Crea `sessions`, cookie de sesión y cookie CSRF; devuelve `sid` |
| `validateSession(sid)` | Devuelve sesión vigente o `null`; consulta Redis y Postgres |
| `rotateSession(sid, reason)` | Revoca la anterior y emite una nueva |
| `revokeSession(sid, reason)` | Revoca una sesión y borra su caché |
| `revokeUserSessions(userId, reason, exceptSid?)` | Revoca todas las del usuario |
| `revokeClientSessions(clientId, reason)` | Revoca todas las del inquilino |
| `bindSessionToClient(sid, clientId, routingVersion)` | Solo onboarding/invitación; actualiza la sesión y revoca las demás |
| `issueChatwootSso(userId, clientId)` | Genera el JWT SSO de 5 minutos; no lo persiste |

Estas operaciones son internas de `apps/admin`; no se exponen como API pública. ADM-001 las invoca en la misma transacción de negocio cuando corresponde.

## 7. Seguridad

### 7.1 Amenazas y controles

| Amenaza | Control |
|---|---|
| Fuerza bruta o credential stuffing | Rate limit por cuenta+IP, IP y cuenta; Argon2id; errores genéricos; alertas por pico |
| Enumeración de cuentas | Respuestas genéricas en registro, login y recuperación; el correo es el único canal que confirma existencia |
| Robo de cookie de sesión | `HttpOnly`, `Secure`, `SameSite=Strict`, `__Host-`, TTL corto, rotación, revocación y sin localStorage |
| CSRF | `SameSite=Strict`, allowlist de `Origin`, token CSRF por sesión en cabecera |
| CSRF de OAuth o mezcla de proveedores | `state` de un solo uso en Redis, cookie separada, PKCE, `nonce` y redirect URI exacta |
| Takeover por vinculación | Solo se vincula con correo verificado y reautenticación; nunca automático con correo no verificado |
| Replay de TOTP | `totp_last_used_step`, tolerancia ±1 y challenge de un solo uso |
| Fuga de secreto TOTP | AES-256-GCM, clave en Docker secret fuera de la base, rotación por `key_id` |
| Fuga de token de correo | Token aleatorio, hash en base, un solo uso, TTL, confirmación por `POST` y sin logs |
| Open redirect | `return_to` solo relativo y allowlist de rutas |
| Fuga por logs | Redacción de correo, contraseña, token, cookie, TOTP y secretos; IP y user-agent solo como hash |
| Abuso del SSO de Chatwoot | JWT de 5 minutos, un solo uso, `client_id` de la sesión, cuenta activa y sin `AccountUser` cruzado |
| Restore con sesiones viejas | Revocación masiva de sesiones antes de abrir tráfico |
| Insiders | `mocter_auth` sin DDL ni `BYPASSRLS`; auditoría de eventos de seguridad; mínimo privilegio |

### 7.2 Contraseñas y correo

- Argon2id con `m=64 MiB`, `t=3`, `p=1`, salt de 16 bytes y hash de 32 bytes. El parámetro se guarda en el hash; si baja, se rehasha en el login.
- Longitud 7–128; al menos una mayúscula, un dígito y un carácter especial ASCII. La validación se repite en servidor; el frontend solo mejora la experiencia.
- No se recortan espacios; no se permiten bytes nulos. El correo se normaliza a minúsculas y se valida con una librería RFC 5322; máximo 254 caracteres.
- Un correo solo se considera verificado por el enlace de verificación o por Google con `email_verified`; Facebook debe devolver un correo que el proveedor considere verificado.

### 7.3 Rate limiting

| Propósito | Clave | Límite | Ventana |
|---|---|---|---|
| Login por cuenta+IP | HMAC(correo)+HMAC(IP) | 5 fallos | 15 min |
| Login por IP | HMAC(IP) | 30 fallos | 15 min |
| Login por cuenta | HMAC(correo) | 10 fallos | 15 min |
| Registro | HMAC(IP) | 5 | 1 h |
| Reenvío de verificación | usuario | 3 | 15 min |
| Reenvío de verificación | HMAC(IP) | 10 | 1 h |
| Confirmación de verificación | HMAC(IP) | 5 | 15 min |
| Recuperación | cuenta | 3 | 1 h |
| Recuperación | HMAC(IP) | 10 | 1 h |
| Reset de contraseña | token | 5 | 15 min |
| Cambio de contraseña | usuario | 3 | 1 h |
| OAuth start/callback | HMAC(IP) | 20 | 15 min |
| Challenge 2FA | challenge | 5 intentos | 5 min |
| Confirmación 2FA | usuario | 5 | 15 min |
| Enrolamiento 2FA | usuario | 5 | 15 min |
| Desactivación 2FA | usuario | 5 | 15 min |
| Vinculación de identidad | usuario | 10 | 15 min |
| Desvinculación de identidad | usuario | 5 | 15 min |
| SSO Chatwoot | usuario | 30 | 15 min |

Las claves usan HMAC-SHA-256 con `AUTH_RATE_LIMIT_PEPPER`; Redis no guarda correos ni IP en claro. Los contadores se incrementan con una operación atómica y TTL. Un `429` incluye `Retry-After` y no revela si la cuenta existe.

### 7.4 Fallos de dependencias

| Fallo | Comportamiento |
|---|---|
| Redis no disponible | Sesiones existentes se validan contra Postgres; login, registro, recuperación, OAuth, 2FA y rate limit responden `503`; no se crean sesiones locales |
| Postgres no disponible | Auth falla cerrado: la caché de Redis no sustituye la autoridad; toda petición autenticada necesita Postgres para estado y permisos y responde `503` |
| Celda de identidad no disponible | Los usuarios de esa celda no pueden iniciar sesión; `503`; no se usa el Router como fallback de credenciales. Las sesiones ya emitidas siguen hasta su vencimiento, salvo que la operación requiera la celda |
| SMTP no disponible | Registro y recuperación mantienen la respuesta genérica `202` y registran el fallo; el token no se consume y se puede reenviar |
| Google/Facebook no disponible | `503` con «Proveedor temporalmente fuera de servicio»; el login nativo sigue disponible |
| Chatwoot no disponible | SSO responde `503`; la sesión de `mocter-admin` no se afecta |

### 7.5 Secretos y rotación

| Secreto | Dónde vive | Rotación |
|---|---|---|
| Clave TOTP activa | Docker secret `/run/secrets/totp_key_<id>`, 32 bytes base64, permisos 0400, solo identity | Anual o ante sospecha; job de re-cifrado y retiro de la clave vieja |
| `AUTH_RATE_LIMIT_PEPPER` | Docker secret | Anual; invalida contadores, no sesiones |
| `GOOGLE_CLIENT_SECRET` | Docker secret | Según el proveedor |
| `FACEBOOK_APP_SECRET` | Docker secret | Según el proveedor |
| `CHATWOOT_SSO_SECRET` | Docker secret compartido con Chatwoot | Anual o ante sospecha; coordina con Chatwoot |
| Credenciales SMTP | Docker secret | Según el proveedor |

La clave TOTP no entra en el respaldo de la base. Si se pierde, los secretos TOTP no se recuperan y cada usuario debe volver a enrolar; el resto de la identidad sigue disponible. La clave anterior se conserva solo mientras exista un ciphertext con su `key_id`.

### 7.6 Auditoría, logs y retención

`audit_log` registra, sin contenido sensible: alta de usuario, verificación de correo, cambio o reset de contraseña, 2FA activado/desactivado, identidad vinculada/desvinculada, revocación masiva de sesiones, cambio de membresía y reset de 2FA por soporte. El registro lo escribe el servicio de auditoría de `mocter_admin`; `mocter_auth` no recibe `INSERT` sobre `audit_log` y mantiene el mínimo privilegio. Los intentos fallidos se registran como métrica y log estructurado con correo hasheado; no se guarda la contraseña ni el código TOTP.

Los logs de aplicación incluyen `request_id`, `user_id` cuando existe, ruta, resultado y latencia. No incluyen correo, token, cookie, `sid`, `csrf`, código TOTP, secreto, cabecera `Authorization` ni cuerpo de formularios.

Retención: sesiones vencidas se purgan a los 30 días; tokens vencidos a los 30 días; `audit_log` sigue la retención de ADM-001. Un restore del Router revoca todas las sesiones y vacía la caché de auth.

## 8. Operación

### 8.1 Despliegue y escalado

`apps/admin` es stateless. Cualquier réplica atiende cualquier sesión porque el estado está en Postgres y Redis; no hay sticky sessions ni archivos locales. El escalado horizontal no requiere cambios de cookie. La cookie no fija `cell_id`; la ruta se resuelve por `client_routing` y `routing_version`.

### 8.2 Observabilidad

Métricas sin etiquetas personales:

- `auth_login_total{method,result}`
- `auth_rate_limited_total{purpose}`
- `auth_session_active`
- `auth_session_redis_fallback_total`
- `auth_2fa_challenge_total{result}`
- `auth_oauth_total{provider,result}`
- `auth_email_send_total{result}`
- `auth_chatwoot_sso_total{result}`

Alertas: pico de fallos de login, caída de Redis, fallback de sesión a Postgres, error de SMTP, tasa alta de fallos 2FA, error de proveedor OAuth y error de SSO. OPS-001 define los canales y la retención.

### 8.3 Respaldo y restore

Las tablas de identidad del Router entran en el respaldo de OPS-001. La clave TOTP no; un restore sin la clave deja los 2FA irrecuperables y exige re-enrolar. Las tablas de identidad de una celda dedicada entran en el respaldo de esa celda. Después de un restore del Router o de una celda, se revocan las sesiones afectadas antes de abrir tráfico y se vacían las claves de auth en Redis.

### 8.4 Capacidad y limpieza

Un job diario purga sesiones vencidas hace más de 30 días, tokens vencidos y challenges de Redis vencidos. La tabla `sessions` tiene índices por usuario, cliente y vencimiento. El número de sesiones activas por usuario se limita a 10. La carga objetivo se prueba con 1000 sesiones concurrentes y 100 logins por minuto en T-34.

## 9. Verificación

### 9.1 Pruebas automatizadas

| Control | Prueba |
|---|---|
| Política de contraseña | Rechaza 6 caracteres, sin mayúscula, sin número o sin especial; acepta 7 con todos |
| Hash | Argon2id verificable; rehash al cambiar parámetros; nunca texto plano |
| Correo | Normalización, unicidad case-insensitive y token de un solo uso |
| Registro | Cuenta existente responde igual que cuenta nueva; no duplica |
| Login | Usuario inexistente, contraseña mala y cuenta federada tienen respuesta y tiempo equivalentes |
| 2FA | Enrolamiento, confirmación, login, replay y bloqueo tras 5 intentos |
| Sesión | TTL por inactividad, TTL absoluto, rotación, revocación y cookie con flags; Postgres caído no valida ni con una copia en Redis |
| CSRF | Mutación sin token falla; token de otra sesión falla; Origin cruzado falla |
| OAuth | State inválido, state reutilizado, nonce inválido, redirect no permitido y proveedor caído |
| Vinculación | Correo verificado, no verificado, con y sin 2FA; no auto-link inseguro; el callback se resuelve por `state` sin cookie de sesión |
| Rate limit | Límite por cuenta+IP, por IP y por cuenta; `Retry-After`; Redis caído falla cerrado |
| Aislamiento | `mocter_auth` no lee `tenant_users`, `clients` ni datos de negocio, y no escribe `audit_log` |
| Celda dedicada | Login resuelto por `identity_location`, 2FA en la celda, migración sin identidad dividida y sin fallback al Router |
| SSO Chatwoot | Token de 5 minutos, un solo uso, `client_id` correcto y sin `AccountUser` cruzado |

### 9.2 Laboratorio

- T-30: Google y Facebook reales, redirect URIs exactas y errores de proveedor.
- T-31: entrega de correo, SPF/DKIM/DMARC y enlaces que no se consumen por prefetch.
- T-32: Google Authenticator, Microsoft Authenticator y Authy; deriva de reloj ±1.
- T-33: SSO contra Chatwoot 4.19.0, TTL, single-use y cuenta inexistente.
- T-34: dos réplicas, Redis caído, Postgres caído, 1000 sesiones y 100 logins/minuto.
- T-35: restore de Router y celda dedicada; revocación de sesiones y clave TOTP.

### 9.3 Criterios de aceptación

Los criterios de aceptación del documento de origen y los requisitos verificables del encaje se verifican así:

| Criterio | Evidencia |
|---|---|
| 2FA deniega acceso sin TOTP | T-18/T-19 y prueba de login con 2FA |
| Contraseña débil se rechaza en UI y API | T-06 y prueba de política |
| Desvincular Facebook no pierde acceso con contraseña | T-16 y prueba de desvinculación |
| Google/Facebook crean o vinculan sin duplicar | T-14/T-15/T-16 |
| Sesión revocable y horizontal | T-21/T-23/T-34 |
| Rate limit entre réplicas | T-12/T-34 |
| 1:0..1 no se rompe desde auth | T-26 y pruebas de ADM-001 |

## 10. Riesgos y pendientes

| Riesgo | Estado | Mitigación |
|---|---|---|
| Pérdida de dispositivo 2FA sin códigos de recuperación | Diseño | Procedimiento de soporte auditado (T-20); no autoservicio |
| Facebook no devuelve correo verificado | Diseño | Rechazo explícito; el usuario usa otro método |
| Facebook no ofrece OIDC completo | **No verificado** | Se usa OAuth 2.0 + Graph API, la interfaz oficial; T-30 valida state, redirect y correo. Si se exige OIDC estricto, Facebook no lo cumple. |
| Entrega de correo (rebotes, spam) | **No verificado** | T-31 con SPF/DKIM/DMARC y monitoreo de rebotes |
| Contrato SSO de Chatwoot 4.19.0 | **No verificado** | T-33 contra la versión fijada |
| Pérdida de la clave TOTP | Diseño | Re-enrolamiento; la clave no va al backup |
| Redis como dependencia de login | Diseño | Fallback de sesión a Postgres; fail-closed para nuevas autenticaciones |
| Migración de identidad a celda dedicada | Diseño | Transacción expandir → copiar → conmutar → verificar; T-27 |
| Enumeración vs. mensaje claro de RF-04 | Diseño | Respuesta genérica y correo; se prioriza no filtrar |
| Crecimiento de `sessions` | Diseño | Purga diaria e índice por vencimiento |
| Recuperación de contraseña no está en el documento de origen | Supuesto operativo aceptado | Se implementa como soporte mínimo para cuentas nativas; no agrega una capacidad de negocio ni cambia el alcance de identidad |

No quedan decisiones de producto abiertas. Las verificaciones de laboratorio no bloquean la aprobación documental, pero sí la implementación en producción.

## 11. Trazabilidad

| Sección | Requisitos | Decisiones |
|---|---|---|
| §3 Arquitectura | RF-01.7, RF-02.1, RF-10.13, RF-10.14 | AUTH-D-01, AUTH-D-02, AUTH-D-03 |
| §4 Modelo | RF-01.10, RF-10.13, RNF-01, RNF-02 | AUTH-D-01, AUTH-D-03, AUTH-D-05, AUTH-D-06 |
| §5 Flujos | RF-01, RF-02, RF-03, RF-04, RF-14.6 | AUTH-D-01 a AUTH-D-06 |
| §6 Contratos | RNF-02, RNF-03 | AUTH-D-06 |
| §7 Seguridad | RNF-01, RNF-02, RNF-03 | AUTH-D-02, AUTH-D-04, AUTH-D-06 |
| §8 Operación | OPS-001, DAT-001 | AUTH-D-02, AUTH-D-06 |
| §9 Verificación | Criterios de aceptación de `requirements.md` §4 | AUTH-D-01 a AUTH-D-06 |



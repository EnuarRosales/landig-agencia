# AUTH-001 · Tareas · Sistema híbrido de autenticación y autorización

| Atributo | Valor |
|---|---|
| ID | AUTH-001 |
| Versión | 1.0 |
| Fecha | 2026-10-20 · actualizado 2026-10-22 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) · ADM-001 · DAT-001 · CHW-001 · OPS-001 |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que AUTH-001 esté aprobada y el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; no se ejecutan solas.
- Las tareas **[LAB]** se validan fuera de producción y no tocan datos reales.
- Toda tarea de código incluye su prueba. Ningún cambio se cierra sin la verificación indicada.
- AUTH-001 no modifica el esquema ni el código de Chatwoot; solo consume su SSO.
- Dependencias de entrada: ADM-001 T-02 (`apps/admin`), T-03 (schemas/roles), T-05 (ancla de identidad), T-07 (onboarding), T-08 (invitaciones) y T-11 (Chatwoot). OPS-001 debe tener el Redis del plano de control y el respaldo del Router.

## Fase 0 · Fundaciones

- [ ] **T-01 · Confirmar el estado de la app y las dependencias**
  - Verificar que `apps/admin` existe o está creado por ADM-001 T-02; que el Router tiene el schema `admin`; que Redis 7+ del plano de control está disponible; que OPS-001 tiene el respaldo del Router.
  - Verificación: `design.md` §2 y §3 no atribuyen componentes inexistentes; el inventario de dependencias queda en la evidencia.
  - Evidencia: `git status`, `pnpm -v`, `turbo --version` y salida de `docker compose config -q`.

- [ ] **T-02 · Crear las migraciones de identidad del Router**
  - Crear `users`, `identities`, `sessions`, `email_verification_tokens`, `password_reset_tokens` y `user_consents` en el schema `admin` del Router.
  - Aplicar los índices del Router de `design.md` §4.3, los `CHECK` de `identity_location`, `status`, proveedor y `purpose`, y comentarios de tabla y columna.
  - Verificación: `drizzle-kit check` pasa; la migración aplica desde cero y desde el estado anterior; el índice de correo rechaza mayúsculas duplicadas; no se guarda `sid` ni token en claro.

- [ ] **T-03 · Crear el rol `mocter_auth` y sus permisos**
  - Router: `SELECT`/`INSERT`/`UPDATE` sobre `users`, `identities`, `sessions` y tokens; sin DDL, sin `BYPASSRLS`, sin acceso a `tenant_users`, `clients` ni datos de negocio, y sin `INSERT` en `audit_log`.
  - Celda dedicada: `SELECT`/`UPDATE` sobre `users`; `SELECT`/`INSERT`/`UPDATE` sobre `identities`; la aplicación fija `SET LOCAL app.current_client_id`.
  - Verificación: pruebas negativas por tabla y por rol; `mocter_auth` no lee `tenant_users` ni `clients` ni escribe `audit_log`; una consulta de celda sin contexto RLS no devuelve filas.

- [ ] **T-04 · Crear la identidad de celda dedicada**
  - Crear o extender `users` e `identities` en la celda con el mismo `id` del Router, `client_id`, RLS forzado y los índices de celda de `design.md` §4.3.
  - Incluir la rutina de migración de §5.12, con expandir → copiar → conmutar → verificar; la ejecución end-to-end se valida en T-27.
  - Verificación: un usuario migrado inicia sesión en la celda; el Router ya no tiene `password_hash` ni secretos TOTP; una falla a mitad de la copia no conmuta `identity_location`.

- [ ] **T-05 · [HUMANO] Provisionar secretos y aplicaciones OAuth**
  - Crear las apps de Google y Facebook con redirect URIs exactas; generar `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_SECRET`, `CHATWOOT_SSO_SECRET`, `AUTH_RATE_LIMIT_PEPPER`, las credenciales SMTP y la clave TOTP de 32 bytes.
  - Guardar los secretos en Docker secrets o en el gestor aprobado; no en Git ni en `.env` versionado.
  - Verificación: `git grep` no encuentra secretos; las redirect URIs coinciden carácter por carácter; la clave TOTP tiene 32 bytes y permisos restringidos.

## Fase 1 · Autenticación nativa

- [ ] **T-06 · Implementar normalización de correo y política de contraseña**
  - Normalizar con `trim` y minúsculas; validar RFC 5322 y máximo 254; no eliminar `+` ni puntos.
  - Aplicar longitud 7–128, mayúscula, dígito y especial ASCII en frontend y servidor; no recortar la contraseña.
  - Verificación: el servidor rechaza contraseñas de 6, sin mayúscula, sin número o sin especial; una contraseña de 7 con todo se acepta; el mismo texto se valida en UI y API.

- [ ] **T-07 · Implementar Argon2id y rehash**
  - Usar `m=64 MiB`, `t=3`, `p=1`, salt de 16 bytes y hash de 32; guardar parámetros en el hash.
  - Verificación: el hash verifica; nunca se guarda texto plano; al bajar los parámetros, el login rehasha; una verificación ficticia tarda un orden equivalente.

- [ ] **T-08 · Implementar registro nativo**
  - Crear usuario no verificado, token de 24 horas y envío SMTP; respuesta genérica para correo existente y nuevo.
  - No crear sesión ni inquilino; no revelar si la cuenta es nativa o federada.
  - Verificación: dos registros con el mismo correo no duplican; la respuesta es idéntica; el token no aparece en la respuesta; el correo existente recibe instrucciones, no una cuenta nueva; si la cuenta existente es federada, recibe un enlace `setup` para establecer su primera contraseña y la contraseña del registro no se persiste; un registro sin consentimiento de tratamiento se rechaza y no crea cuenta, y el consentimiento queda en `user_consents` con versión y canal.

- [ ] **T-09 · Implementar verificación de correo**
  - `POST /auth/email/verify/request` y `POST /auth/email/verify/confirm`; token de 32 bytes, hash, un solo uso, TTL 24 h y reenvío limitado.
  - Verificación: un token vencido o consumido falla; el `GET` no consume; el reenvío invalida el anterior; `email_verified_at` queda seteado y auditado.

- [ ] **T-10 · Implementar login nativo**
  - Resolver `identity_location`; verificar en Router o celda; usar verificación ficticia para usuarios inexistentes, sin contraseña o deshabilitados; rehash si corresponde.
  - Si hay 2FA, emitir challenge; si no, crear sesión con `client_id` y `routing_version`.
  - Verificación: los cuatro casos de fallo devuelven el mismo `401` y tiempo equivalente; una celda caída devuelve `503`; el login exitoso setea cookie y CSRF.

- [ ] **T-11 · Implementar recuperación, establecimiento y cambio de contraseña**
  - `forgot`, `reset` y `change`; token de 30 minutos, un solo uso, respuesta genérica y revocación de sesiones.
  - Verificación: el reset invalida sesiones y tokens anteriores; no inicia sesión sola; el cambio exige contraseña actual y TOTP si está activo; `forgot` no emite token para una cuenta solo federada; el reset con `purpose = 'setup'` establece la primera contraseña y el reset normal exige una existente.

- [ ] **T-12 · Implementar rate limiting en Redis**
  - Aplicar los límites de `design.md` §7.3 con HMAC y TTL; `429` con `Retry-After`.
  - Si Redis no responde, los endpoints sensibles fallan cerrado con `503`; no se usa memoria local.
  - Verificación: dos réplicas comparten el contador; el sexto intento falla; el éxito reinicia el contador de cuenta+IP; Redis caído no permite login nuevo.

## Fase 2 · Federación

- [ ] **T-13 · Implementar state, PKCE y cookies de OAuth**
  - Generar state, verificador S256 y nonce; guardar en Redis con TTL 10 min; cookies `SameSite=Lax` con `Path` por proveedor. En vinculación, la entrada de Redis guarda el `user_id` y el callback no depende de la cookie de sesión.
  - Validar `return_to` relativo y redirect URI exacta; consumir el state una sola vez.
  - Verificación: state inválido, reutilizado o de otro proveedor falla; una URL absoluta en `return_to` se rechaza; el callback de vinculación funciona sin cookie de sesión; el state no se escribe en logs.

- [ ] **T-14 · Implementar Google OIDC**
  - Discovery, code exchange, validación de emisor, audiencia, `exp`, `nonce` y `email_verified`; crear o vincular usuario.
  - Verificación: un ID token con audiencia o nonce incorrectos falla; un correo verificado crea usuario y sesión; un proveedor caído devuelve el texto exacto «Proveedor temporalmente fuera de servicio».

- [ ] **T-15 · Implementar Facebook OAuth**
  - OAuth 2.0, Graph API, `state` y redirect URI exacta; aceptar correo solo si el proveedor lo devuelve como verificado.
  - Verificación: sin correo verificado responde `422` y no crea usuario; con correo válido crea o vincula; no se guardan tokens de Facebook.

- [ ] **T-16 · Implementar vinculación y desvinculación**
  - Aplicar los seis casos de `design.md` §5.4; exigir reautenticación; no vincular correos no verificados; impedir desvincular el último método.
  - Verificación: un correo no verificado no se auto-vincula; con contraseña y TOTP se vincula; el callback de vinculación se resuelve por `state` sin cookie de sesión; desvincular Facebook con contraseña conserva el acceso; desvincular el último método falla.

## Fase 3 · Doble factor

- [ ] **T-17 · Implementar cifrado y rotación de secretos TOTP**
  - Cifrar con AES-256-GCM, nonce y AAD `user_id:key_id`; guardar `key_id`; implementar job de re-cifrado por lotes en Router y celdas dedicadas, y retiro de clave vieja.
  - Verificación: sin la clave no se descifra; el job migra todos los secretos; un secreto con `key_id` viejo sigue funcionando durante la transición; la clave no está en la base ni en Git.

- [ ] **T-18 · Implementar enrolamiento 2FA**
  - Exigir contraseña y reautenticación; generar secreto de 20 bytes, URI `otpauth` y QR; confirmar con TOTP ±1; activar solo si el código es válido; el secreto pendiente vence a los 10 minutos.
  - Verificación: una cuenta federada sin contraseña no puede enrolar; un código inválido no activa; el secreto se muestra una sola vez; al activar se revocan las demás sesiones y se rota la actual.

- [ ] **T-19 · Implementar challenge y login 2FA**
  - Challenge de 5 minutos y 5 intentos; cookie `__Host-mocter_challenge`; crear sesión solo tras TOTP válido; rechazar replay con `totp_last_used_step`.
  - Verificación: sin código no hay sesión; tras 5 fallos el challenge se invalida y el intento siguiente se rechaza; un código usado no se acepta; el login exitoso setea `mfa_at`.

- [ ] **T-20 · [HUMANO] Definir el procedimiento de pérdida de 2FA**
  - Designar al responsable de soporte, la verificación de identidad y el registro de auditoría; no implementar autoservicio de recuperación.
  - Verificación: el procedimiento está documentado y aprobado; una prueba de soporte revoca sesiones, borra el secreto en la ubicación de identidad del usuario y deja rastro en `audit_log`.

## Fase 4 · Sesión y SSO

- [ ] **T-21 · Implementar creación, validación y revocación de sesión**
  - `sid` de 32 bytes, hash SHA-256, cookie `__Host-mocter_sid`, `sessions` en Postgres y caché en Redis; rotación, `reauth_at` y revocación inmediata.
  - Verificación: la cookie no contiene `client_id` ni roles; el `sid` no se guarda en claro; una sesión revocada falla en otra réplica; Redis caído usa Postgres; Postgres caído falla cerrado incluso con la sesión en caché; `reauth_at` vence a los 5 minutos para acciones sensibles.

- [ ] **T-22 · Implementar CSRF y validación de Origin**
  - Token CSRF por sesión, hash en `sessions`, cookie `__Host-mocter_csrf` legible por el cliente (o embebida en SSR); exigir `X-CSRF-Token` en mutaciones autenticadas.
  - Verificación: sin token o con token de otra sesión falla; `Origin` cruzado falla; login y registro validan `Origin`; el token no se guarda en URL ni en `localStorage`.

- [ ] **T-23 · Implementar TTL, limpieza y gestión de sesiones**
  - Inactividad 30 min, absoluto 12 h, máximo 10 sesiones por usuario, purga diaria y listado/revocación propia.
  - Verificación: la sesión vence a los 30 min sin actividad; no se extiende más de 12 h; la 11.ª revoca la más antigua; la purga no borra sesiones vigentes.

- [ ] **T-24 · Integrar membresía y revocación con ADM-001**
  - `bindSessionToClient` para onboarding/invitación; `revokeUserSessions` al cambiar `active_client_id`; `revokeClientSessions` al suspender o dar de baja un inquilino.
  - Verificación: una segunda membresía se rechaza y no altera la sesión; una membresía nueva actualiza solo la sesión del onboarding y revoca las demás; un inquilino suspendido no conserva sesiones.

- [ ] **T-25 · Implementar SSO a Chatwoot**
  - Validar sesión, `client_id`, membresía activa y cuenta `active`; emitir JWT HS256 de 5 minutos con `email`, `name`, `identifier`, `iat`, `exp`; no persistir ni loguear el token.
  - Verificación: un `client_id` ajeno falla; una cuenta inexistente falla; el token vence a los 5 minutos; el segundo uso falla; no se crea `AccountUser` cruzado.

## Fase 5 · Integración con tenencia

- [ ] **T-26 · Integrar onboarding e invitaciones con ADM-001**
  - Exigir correo verificado y sesión del mismo correo; no crear `tenant_users` desde auth; reservar `active_client_id` antes de la membresía.
  - Verificación: un usuario con membresía activa no acepta otra invitación; una invitación con correo distinto falla; el alta manual reutiliza la identidad existente; `bindSessionToClient` solo se usa en la misma transacción del alta.
  - Evidencia: pruebas de integración con ADM-001 T-07/T-08.

- [ ] **T-27 · Implementar el login en celda dedicada y su migración**
  - Resolver `identity_location`; si es una celda, consultar su identidad con `mocter_auth` y RLS; ejecutar la migración de §5.12 con expandir → copiar → conmutar → verificar, reutilizando el esquema y la rutina de T-04.
  - Verificación: un usuario de celda inicia sesión aunque el Router no tenga credenciales; una celda caída devuelve `503`; el Router no conserva `password_hash` ni TOTP después de conmutar; una falla no deja identidad dividida.
  - Evidencia: prueba de migración en laboratorio con una celda y un usuario con 2FA.

- [ ] **T-28 · Integrar scopes y autorización sin roles en la sesión**
  - La sesión solo lleva `user_id` y `client_id`; `ADM-001` resuelve `tenant_users.role` y scopes de plataforma en cada petición. Un cambio de rol de inquilino no reemite la cookie; una elevación de plataforma o un scope sensible revoca o rota las sesiones.
  - Verificación: cambiar un rol no requiere reemitir cookie; retirar un rol sensible revoca la sesión; una sesión con `client_id` ajeno no obtiene permisos; `mocter_auth` no lee `tenant_users`.

## Fase 6 · Verificación

- [ ] **T-29 · Ejecutar la suite automatizada de auth**
  - Cubrir los controles de `design.md` §9.1: política, hash, correo, registro, login, 2FA, sesión, CSRF, OAuth, vinculación, rate limit, aislamiento y SSO.
  - Verificación: todos los casos pasan en CI; las pruebas negativas fallan por la razón correcta; no hay secretos ni datos personales en fixtures.

- [ ] **T-30 · [LAB] Validar Google y Facebook reales**
  - Probar redirect URIs, consentimiento, correo verificado, state reutilizado, nonce inválido y proveedor caído.
  - Verificación: cada caso produce el resultado de `design.md` §5.3; no se persisten tokens de proveedor; el login nativo sigue funcionando si el proveedor cae.

- [ ] **T-31 · [LAB] Validar entrega de correo**
  - Verificar SPF, DKIM, DMARC, rebotes, enlaces no consumidos por prefetch y límites de reenvío.
  - Verificación: el correo llega a Gmail, Outlook y un dominio corporativo; el enlace solo confirma por `POST`; un rebote no bloquea el registro.

- [ ] **T-32 · [LAB] Validar TOTP con aplicaciones reales**
  - Probar Google Authenticator, Microsoft Authenticator y Authy; deriva de reloj ±1; replay; pérdida de dispositivo.
  - Verificación: el código válido entra; el código repetido no; el procedimiento de T-20 revoca sesiones y permite re-enrolar.

- [ ] **T-33 · [LAB] Validar SSO contra Chatwoot 4.19.0**
  - Confirmar ruta, parámetro, secreto, TTL de 5 minutos, un solo uso y cuenta inexistente.
  - Verificación: un usuario con membresía activa entra a su `account_id`; un `client_id` ajeno no; el token no se reutiliza; no se crea `AccountUser` cruzado.

- [ ] **T-34 · [LAB] Validar Redis, concurrencia y carga**
  - Dos réplicas, Redis caído, Postgres caído, 1000 sesiones concurrentes y 100 logins/minuto.
  - Verificación: el rate limit es compartido; las sesiones sobreviven a la réplica; Redis caído usa Postgres para sesión y falla cerrado para login; Postgres caído no permite auth.

- [ ] **T-35 · [LAB] Validar restore y revocación masiva**
  - Restaurar Router y una celda dedicada; ejecutar la revocación de sesiones; verificar la clave TOTP y el re-enrolamiento.
  - Verificación: ninguna sesión anterior sigue válida; los 2FA sin clave se marcan para re-enrolar; las claves de Redis se reconstruyen vacías.

- [ ] **T-36 · Verificar los criterios de aceptación**
  - Recorrer los criterios de aceptación del documento de origen y `design.md` §9.3; registrar evidencia por criterio.
  - Verificación: cada criterio tiene prueba o evidencia de laboratorio; ninguno queda “asumido”.

- [x] **T-37 · [HUMANO] Aprobar AUTH-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`; decidir si se aprueba la spec.
  - Verificación: el estado pasa a `Aprobada` solo con decisión explícita; no se inicia implementación antes.


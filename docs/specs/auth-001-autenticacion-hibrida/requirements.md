# AUTH-001 · Requisitos · Sistema híbrido de autenticación y autorización

| Atributo | Valor |
|---|---|
| ID | AUTH-001 |
| Versión | 1.1 |
| Estado | Aprobada |
| Fecha | 2026-10-20 · actualizado 2026-10-25 |
| Documento de origen | Especificación de Requerimientos Técnicos v3.0 · Octubre 2026 · Estado: Aprobado |
| Depende de | DAT-001 (arquitectura de datos multi-inquilino) |
| Alcance | Módulo de accesos de `mocter-admin` |
| Relacionado | ADM-001 (núcleo administrativo) · CHW-001 (inventario de Chatwoot) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` |

---

## 1. Documento de origen (verbatim, sin edición)

### Especificación de Requerimientos Técnicos: Sistema Híbrido de Autenticación y Autorización

Versión: 3.0
Fecha: Octubre 2026
Estado: Aprobado

#### 1. Introducción y Objetivo

El objetivo de este documento es especificar los requerimientos técnicos y funcionales para el módulo de gestión de accesos de la plataforma web. El sistema debe permitir un mecanismo híbrido que elimine las barreras de entrada mediante autenticación federada, ofrezca una alternativa tradicional segura con credenciales nativas, y proporcione una capa opcional de máxima seguridad mediante Autenticación de Doble Factor (2FA).

#### 2. Requerimientos Funcionales (RF)

**RF-01: Autenticación Delegada (Federada y Parametrizable)**

- Proveedores Soportados y Administrables: Arquitectura multi-proveedor gestionada dinámicamente desde el backoffice de la SaaS (Google, Facebook, Microsoft y futuros proveedores OIDC). Cada proveedor cuenta con switch de activación/desactivación y parametrización de credenciales.
- Protocolo: Implementación estricta de OAuth 2.0 y OpenID Connect (OIDC).
- Flujo de Registro/Inicio de Sesión: Si el usuario no existe en la base de datos interna, el sistema debe crear un perfil automáticamente utilizando el ID único del proveedor (`provider_id`), el correo electrónico verificado, el nombre y la foto de perfil. Si ya existe, se inicia sesión directamente. En la interfaz de login solo se renderizan los proveedores marcados como activos en la configuración de la SaaS.

**RF-02: Registro y Autenticación Nativa (Correo y Contraseña)**

- Identificador: Dirección de correo electrónico válida y única.
- Política de Complejidad de Contraseña: La contraseña debe cumplir estrictamente con las siguientes reglas:
  - Longitud mayor a 6 caracteres.
  - Al menos una letra mayúscula.
  - Al menos un número.
  - Al menos un carácter especial (ej. @, #, $, %, *, etc.).
- Validación Dual: Las reglas de complejidad deben validarse en tiempo real en la interfaz de usuario (frontend) y re-verificarse obligatoriamente en el servidor (backend) antes de persistir los datos.

**RF-03: Autenticación de Doble Factor Optativa (2FA via TOTP)**

- Disponibilidad: Exclusiva y opcional para cuentas creadas mediante el método nativo (Correo y Contraseña).
- Protocolo Estándar: Basado en algoritmos TOTP (Time-Based One-Time Password) según la norma RFC 6238. Must ser compatible con aplicaciones estándar como Google Authenticator, Microsoft Authenticator o Authy.
- Flujo de Activación (Enrolamiento):
  - El usuario solicita activar 2FA desde su panel de configuración de seguridad.
  - El servidor genera una clave secreta criptográfica única (secret key).
  - El frontend muestra un código QR que codifica la URI de autenticación (que incluye el nombre de la plataforma y el correo del usuario) junto con la clave secreta en texto plano como respaldo.
  - El usuario escanea el código con su aplicación Authenticator.
  - Para confirmar la activación, el usuario debe introducir el código temporal de 6 dígitos generado por su aplicación. El sistema solo activará el flag 2fa_enabled = true si el código introducido es válido.
- Flujo de Desactivación: Requerirá que el usuario confirme su identidad introduciendo su contraseña actual y un código TOTP válido antes de remover la protección.

**RF-04: Gestión de Conflictos y Vinculación de Cuentas**

- Conflicto de Correo Duplicado: Si un usuario intenta registrarse con correo/contraseña utilizando una dirección que ya está asociada a una cuenta de Google o Facebook (o viceversa), el sistema no debe crear una cuenta duplicada.
- Resolución Dinámica:
  - Intento Nativo sobre Cuenta Federada: Se le informará al usuario que ya existe una cuenta asociada a ese correo mediante un proveedor social, invitándole a iniciar sesión con dicho botón. Opcionalmente, se le permitirá establecer una contraseña validando primero su correo.
  - Intento Federado sobre Cuenta Nativa: Si el correo devuelto por Google/Facebook coincide con una cuenta nativa preexistente, el sistema vinculará la identidad federada al usuario actual de forma automática (o tras una confirmación por contraseña) unificando ambos métodos bajo el mismo User ID interno.

#### 3. Requerimientos No Funcionales (RNF)

**RNF-01: Seguridad en Capa de Datos y Criptografía**

- Almacenamiento de Contraseñas: Queda estrictamente prohibido guardar contraseñas en texto plano. Se debe aplicar hashing utilizando algoritmos robustos y actualizados como Argon2id o bcrypt con un factor de costo adecuado.
- Almacenamiento de Secretos 2FA: Las llaves secretas TOTP deben almacenarse cifradas en reposo en la base de datos utilizando cifrado simétrico AES-256-GCM.

**RNF-02: Seguridad en Tránsito y Sesiones**

- Cifrado Global: Todo el tráfico del sitio web debe gestionarse obligatoriamente bajo HTTPS (TLS 1.3 recomendado).
- Protección OAuth/OIDC: Es obligatorio el uso e inspección del parámetro state en cada petición de autenticación social para mitigar ataques de Falsificación de Petición en Sitios Cruzados (CSRF).
- Tokens de Acceso: Tras una autenticación exitosa (incluyendo el segundo factor si está activo), el sistema emitirá tokens de sesión (JWT o cookies de sesión con atributos Secure, HttpOnly y SameSite=Strict).

**RNF-03: Mitigación de Ataques y Tolerancia a Fallos**

- Protección de Fuerza Bruta (Rate Limiting): El endpoint de inicio de sesión nativo debe implementar una limitación de tasa (ej. máximo 5 intentos fallidos por IP/cuenta en un lapso de 15 minutos).
- Ventana de Tiempo TOTP: El servidor de autenticación debe permitir una tolerancia de sincronización de ±1 bloque de tiempo (30 segundos antes y después) para absorber pequeñas discrepancias de reloj en los dispositivos de los usuarios.
- Resiliencia de Proveedores Exteriores: Si la API de Google o Facebook experimenta caídas, el sistema debe capturar el error de forma elegante, mostrando un mensaje claro al usuario ("Proveedor temporalmente fuera de servicio") sin exponer trazas de código (stack traces) ni comprometer la disponibilidad del inicio de sesión nativo.

#### 4. Criterios de Aceptación para QA

- Caso de Éxito 2FA: Verificar que, al activar 2FA, el sistema deniegue el acceso con la combinación correcta de correo y contraseña a menos que se provea un token TOTP válido y vigente.
- Caso de Bloqueo por Complejidad: Comprobar que el formulario de registro nativo rechace contraseñas de menos de 7 caracteres o que omitan mayúsculas, números o caracteres especiales, bloqueando la petición tanto en UI como en API.
- Caso de Desconexión de Redes: Validar que un usuario pueda desvincular su cuenta de Facebook desde su perfil sin perder el acceso a la plataforma, siempre y cuando tenga una contraseña nativa configurada.

---

## 2. Encaje en la plataforma (análisis del agente)

Esta sección no forma parte del documento aprobado: registra consecuencias del encaje y no modifica ningún requisito de origen.

### 2.1 Alcance de la identidad

La identidad descrita es la de los **usuarios de la plataforma**: el inquilino y su gente. No cubre los contactos finales, cuyo maestro pertenece a `mocter-core`, ni el directorio de usuarios de Chatwoot, que es un padrón distinto. La landing permanece pública y sin autenticación.

### 2.2 Relación con Chatwoot

1. `AUTH-001` resuelve la sesión en `mocter-admin`; el acceso a Chatwoot continúa por SSO nativo (RF-02.2 de ADM-001). No se comparten credenciales entre sistemas. El SSO se entrega **dentro de un iframe** (ADM-001 D-32): el nivel superior no navega y Chatwoot se presenta embebido en la shell.
2. Un usuario de Chatwoot **no** es un usuario de `mocter-admin`. Chatwoot comparte un mismo registro de usuario entre cuentas cuando el correo coincide; aquí, en cambio, una cuenta de plataforma pertenece a un solo inquilino. Chatwoot puede permitir multi-cuenta a nivel técnico, pero la sincronización de Mocter debe impedir que un usuario quede en dos `account_users`. La correlación es por inquilino.
3. La vinculación de identidades de RF-04 opera sobre la cuenta de plataforma. No vincula ni desvincula cuentas de Chatwoot.

### 2.3 Requisitos declarados con consecuencia de seguridad

Se registran porque cambian el diseño. No contradicen el documento.

| # | Consecuencia | Origen |
|---|---|---|
| 1 | **Enumeración de cuentas.** Informar en pantalla que un correo ya existe como cuenta federada confirma la existencia de esa cuenta a cualquiera que pruebe direcciones. La mitigación habitual es notificar por correo y responder de forma genérica. | RF-04 |
| 2 | **Gestión de la clave de cifrado.** RNF-01 exige AES-256-GCM para los secretos TOTP pero no define dónde vive la clave. Una clave guardada junto a los datos que protege no protege: debe residir fuera de la base, con rotación definida. | RNF-01 |
| 3 | **Federación sin segundo factor.** RF-03 restringe 2FA a las cuentas nativas. La consecuencia aceptada es que una cuenta federada queda protegida únicamente por el proveedor social. | RF-03 |
| 4 | **Limitación de tasa entre réplicas.** El contador de intentos no puede vivir en memoria del proceso cuando el servicio corre en más de una réplica. | RNF-03 |
| 5 | **Revocación de sesión.** RNF-02 admite "JWT o cookies de sesión". Un JWT sin estado no se revoca antes de su expiración; si se elige, hay que fijar su vigencia y aceptar el compromiso. | RNF-02 |

El almacén compartido de A-03 se resuelve en AUTH-D-02. A-02 se resuelve en AUTH-D-04. A-04 se resuelve en AUTH-D-05. A-05 se resuelve en AUTH-D-06: el panel usa sesión opaca de servidor y el JWT queda para APIs futuras; AUTH-D-02 cubre el rate limiting y la revocación.

### 2.4 Vacío detectado

El documento define cómo un usuario se registra y cómo se vinculan sus identidades. La incorporación quedó resuelta en su camino principal por ADM-001 D-26: el alta orgánica crea primero el usuario y crea el inquilino durante el onboarding; con Google el correo se considera verificado y con correo/contraseña el inquilino espera la confirmación. La invitación a un inquilino existente es un canal alternativo, usado para fidelización y para que el liderazgo vincule miembros. El rol del invitado y quién lo asigna quedan resueltos por AUTH-D-05: el invitado entra como `tenant_agent` y lo asigna el `tenant_owner`, que es único por inquilino. La invitación se rechaza si el usuario ya tiene una membresía activa en otro inquilino; la regla 1:0..1 se aplica antes de crear el vínculo.

### 2.5 Identidad global y RLS

La identidad de plataforma es global, pero la membresía de inquilino es 1:0..1. En el Router Global, `users`, `identities` y `sessions` son globales y no usan RLS por `client_id`. `users` no tiene `client_id` y lleva `active_client_id` nullable como puntero de membresía única; `identities` no tiene tenencia; `sessions` puede registrar el `client_id` activo, pero no es una tabla de tenencia. Se protegen con un rol de autenticación dedicado y filtros de aplicación. La membresía y su historial viven en `tenant_users`, que lleva `client_id` y usa RLS. Un usuario tiene como máximo una membresía activa.

La tabla `users` de cada celda es distinta: es la proyección de los usuarios que pertenecen al inquilino, lleva `client_id` y usa RLS. No es la tabla de identidad global. En una celda dedicada por aislamiento normativo, la identidad se aloja en la celda (AUTH-D-01) y puede usar RLS por `client_id`; el Router Global conserva solo el puntero de enrutamiento, sin credenciales.

El Router Global conserva el ancla de enrutamiento del usuario: su correo y el puntero de ubicación. En una celda dedicada, las credenciales, el secreto TOTP y las identidades federadas viven en la celda; el Router no los replica. ADM-001 D-29 fija que el inquilino referencia a su usuario dueño por `owner_user_id` y que esa relación recupera correo, roles y permisos.

Ver DAT-001 RF-05.5 y [`design.md`](../dat-001-arquitectura-datos-multiinquilino/design.md) §5.4.

### 2.6 Habeas Data para los usuarios de la plataforma

La Ley 1581 de 2012 (Colombia) no alcanza solo a los contactos finales: también a los **usuarios del SaaS** (dueño y agentes del inquilino). El registro exige aceptación del aviso de privacidad y autorización de tratamiento (`user_consents`, `purpose = data_treatment`) y sin ella no se crea la cuenta; el consentimiento comercial (`commercial_comms`) es opcional y puede capturarse en el onboarding (ADM-001). Los derechos del titular (acceso, corrección, supresión con anonimización y revocación) se ejercen por procedimiento de soporte auditado. La supresión de un usuario es lógica y anonimizada, preservando las reglas de negocio (1:0..1, historial de `tenant_users`).

### 2.7 Punto de entrada y acceso unificado a la plataforma

El acceso a la zona administrativa `mocter-admin` (tanto para los operadores de la SaaS como para los inquilinos) se realiza desde la landing page pública mediante un botón en el header principal posicionado inmediatamente a continuación del botón «Solicitar demo». Dicho botón redirige al flujo de autenticación unificada (`/login`), permitiendo el ingreso mediante credenciales nativas o mediante los proveedores federados habilitados.

## 3. Decisiones

### Tomadas

| ID | Decisión | Consecuencia de diseño |
|---|---|---|
| AUTH-D-01 | El almacén de identidad —credenciales, secreto TOTP e identidades federadas— vive en el Router Global. Un inquilino con requisito normativo de aislamiento recibe una celda dedicada que además contiene su identidad; en ese caso el Router Global conserva solo el puntero de enrutamiento, sin credenciales ni secretos. | El correo único global y la vinculación de cuentas de RF-04 se resuelven en un único lugar. La ubicación de la identidad se resuelve **antes** de autenticar, consultando la tabla de enrutamiento (ADM-001, RF-10.3). El módulo de identidad debe soportar ambas ubicaciones desde el diseño, no como excepción posterior. Corresponde a D-12 de ADM-001. |
| AUTH-D-02 | El almacén compartido para rate limiting y revocación de sesión es el Redis 7+ dedicado del plano de control (DAT-001, O-01). No comparte instancia con el Redis de Chatwoot. Las claves de auth usan prefijos propios y TTL; se comparte con la caché de enrutamiento sin mezclar espacios de nombres. | El rate limiting funciona entre réplicas y la revocación no depende del Redis de Chatwoot. La disponibilidad de auth queda acoplada al Redis del plano de control, no al plano de soporte. |
| AUTH-D-03 | En el Router Global, `users`, `identities` y `sessions` son globales y no usan RLS por `client_id`. `users` no tiene `client_id`; lleva `active_client_id` nullable como puntero de membresía única. La membresía/tenencia (`tenant_users`) y la proyección `users` de cada celda usan RLS. En una celda dedicada por aislamiento normativo, la identidad vive en la celda (AUTH-D-01) y puede usar RLS por `client_id`; el Router Global conserva solo el puntero de enrutamiento. | Ver DAT-001 RF-05.5 y [`design.md`](../dat-001-arquitectura-datos-multiinquilino/design.md) §5.4. El login por email no queda bloqueado por una política de tenant; la separación es por rol y filtro, no por RLS de `client_id`. La membresía 1:0..1 se valida en el Router antes de crear el vínculo en la celda. |
| AUTH-D-04 | La clave AES-256-GCM de los secretos TOTP vive en secretos de archivo de Docker Compose (`/run/secrets/totp_key_<id>`, 32 bytes en base64), montados read-only solo en el servicio de identidad. No se guarda en la base, en el repositorio ni en variables de entorno. El ciphertext lleva el `key_id`; la rotación agrega `totp_key_<nuevo>`, cambia `TOTP_ACTIVE_KEY_ID` y ejecuta un job de re-cifrado por lotes; la clave anterior se retira cuando no queda ningún secreto cifrado con ella. | RNF-01 se cumple sin KMS externo. Un host comprometido compromete la clave; se mitiga con permisos 0400, montaje exclusivo y rotación anual o ante sospecha. La clave no entra en el respaldo de la base; si se pierde, los secretos TOTP no se recuperan y los usuarios deben re-vincular el segundo factor. |
| AUTH-D-05 | El vínculo usuario-inquilino vive en un objeto propio del inquilino (`tenant_users`), separado de `users` global. `tenant_owner` es único por inquilino y `tenant_agent` se limita por plan; el alta manual crea el `tenant_owner` inicial y este asigna los `tenant_agent`. Un usuario tiene como máximo una membresía activa: puede tener roles de plataforma globales y ser `tenant_owner` de un único inquilino (por ejemplo, el #1); no puede ser miembro de dos inquilinos. `users.active_client_id` es el guardián global de esa regla. | Cierra A-04. El rol del invitado es `tenant_agent`; el `tenant_owner` no se invita ni se duplica. El límite de asientos es del plan (ADM-001 RF-04.7, D-31). La separación evita mezclar identidad global con membresía y permite el caso del inquilino #1. Una invitación a un usuario con membresía activa en otro inquilino se rechaza; si una persona quiere operar otro negocio, necesita otra identidad. |
| AUTH-D-06 | El panel `mocter-admin` usa una sesión opaca de servidor, no JWT en el navegador. La cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, host-only y con prefijo `__Host-` cuando no se comparte con subdominios transporta un `sid` aleatorio. El servidor guarda el hash SHA-256 del `sid` en `sessions` del Router Global y usa el Redis 7+ del plano de control para lookup y revocación. TTL: 30 minutos de inactividad y 12 horas absolutas. El `sid` rota en login, 2FA, cambio de contraseña y elevación de privilegios; la revocación es inmediata por usuario, rol o `client_id`. Los pods no guardan sesión local: cualquier réplica valida contra el store compartido y no se usan sticky sessions. JWT queda reservado para APIs públicas o máquina-a-máquina futuras, con access token corto, refresh opaco rotativo y revocación; el panel no usa JWT en el navegador. | Cierra A-05. La revocación inmediata y el escalado horizontal no compiten: el pod es stateless y el estado vive en Postgres/Redis. Redis es una dependencia del plano de control; si cae, las sesiones existentes se validan contra Postgres y las nuevas autenticaciones fallan cerrado. La cookie de sesión no se relaja para OAuth: los flujos de login y vinculación usan cookies de `state` separadas, `SameSite=Lax`, de corta vida y alcance acotado a `/auth/google`, `/auth/facebook` y `/auth/link`. Se mantiene token CSRF y validación de `Origin`. La sesión guarda `client_id` y `routing_version`; la cookie solo lleva el `sid`. |
| AUTH-D-07 | El SSO a Chatwoot se entrega **dentro del iframe** mediante `GET /auth/chatwoot/embed?client_id=<uuid>`, que devuelve una página mínima con auto-POST del JWT al endpoint SSO de Chatwoot. El nivel superior no navega; el token no viaja en el `src` del iframe, en el historial del top-level ni en logs. | ADM-001 D-32 exige una sola plataforma sin redirección. El handoff embebido conserva el JWT de 5 minutos y un solo uso; la sesión de Chatwoot vive en su subdominio same-site. La ruta y el método se validan en T-39. |
| AUTH-D-08 | Proveedores OAuth federados dinámicos y parametrizables desde el backoffice de la SaaS. Los proveedores activos (Google, Facebook, Microsoft, etc.) se gestionan en base de datos (`auth_providers_config`) con banderas de habilitación y credenciales cifradas, permitiendo activar o desactivar proveedores sin redespliegue de código. | Flexibilidad comercial y operativa para la plataforma. El login renderiza dinámicamente los botones sociales habilitados en runtime. |

### Abiertas

No quedan decisiones abiertas. A-05 se cerró con AUTH-D-06.

## 4. Trazabilidad

- 2026-10-20: alineación con DAT-001 (T-13): A-03 resuelta con el Redis dedicado del plano de control (O-01); identidad global sin RLS por `client_id` y RLS solo en tenencia (O-03); A-02, A-04 y A-05 siguen abiertas.
- 2026-10-21: ADM-001 D-26 resolvió el alta orgánica (usuario sin inquilino, inquilino creado en el onboarding, verificación por proveedor o confirmación de correo). A-04 se acota al rol del usuario invitado y a quién lo asigna.
- 2026-10-21: ADM-001 D-29 fijó el ancla de identidad: el inquilino referencia a su usuario dueño por `owner_user_id`; el Router conserva correo y puntero de ubicación, y no replica credenciales de una celda dedicada. Cierra O-15 de ADM-001.
- 2026-10-21: A-02 resuelta (AUTH-D-04): la clave AES-256-GCM de TOTP vive en secretos de archivo de Docker Compose, read-only, fuera de la base y del repositorio; rotación por `key_id` y job de re-cifrado. A-04 resuelta (AUTH-D-05): `tenant_users` separa la membresía de la identidad global; `tenant_owner` único y `tenant_agent` por plan, asignado por el `tenant_owner`. A-05 quedó abierta en ese momento.
- 2026-10-22: A-05 resuelta (AUTH-D-06): el panel usa sesión opaca de servidor con cookie `HttpOnly`/`Secure`/`SameSite=Strict` y store compartido; el state de Google usa una cookie separada `Lax`. JWT queda para APIs futuras. Se corrige la membresía a 1:0..1: un usuario pertenece a un solo inquilino, `users.active_client_id` es el guardián global y el nombre canónico de la membresía es `tenant_users`.
- 2026-10-22: se crean `design.md` y `tasks.md`. El diseño fija sesión opaca, identidad en Router o celda dedicada, 2FA TOTP, OAuth con state/PKCE, rate limiting en Redis y SSO a Chatwoot. Estado de la spec: Borrador; no se inicia implementación ni RDD.
- 2026-10-22: revisión de consistencia de `design.md` y `tasks.md`: se corrigieron la fuente del token CSRF, el callback de vinculación sin cookie de sesión, el fail-closed de Postgres frente a la caché de Redis, los permisos de `mocter_auth` (`INSERT` en `identities` de celda, sin `audit_log`), los índices de celda, el alcance del rate limiting y la migración de identidad. Sin cambios de alcance.
- 2026-10-22: **AUTH-001 aprobada.** La revisión de control cerró además el flujo `setup` para que una cuenta federada establezca su primera contraseña (`purpose` en `password_reset_tokens`) y alineó las referencias a los criterios de aceptación del documento de origen. AUTH-D-01 a AUTH-D-06 quedan cerradas; el planeamiento no inicia implementación ni RDD.
- 2026-10-23: alineación con DAT-001 RF-10.9: las tablas de identidad siguen la convención global de auditoría (`created_at`, `updated_at`, `created_by`, `updated_by`); `sessions` usa `revoked_at` y los tokens `consumed_at` como baja lógica, sin duplicar `deleted_at`.
- 2026-10-23: Habeas Data para usuarios de la plataforma (con CRM-001): nueva tabla `user_consents` en el Router, consentimiento obligatorio de tratamiento en el registro (Ley 1581 de 2012), consentimiento comercial opcional en el onboarding y derechos del titular por soporte auditado (§2.6, design §4.1 y §5.1).
- 2026-10-24: AUTH-D-07: el SSO a Chatwoot se entrega dentro de un iframe mediante `/auth/chatwoot/embed`; el nivel superior no navega y el token no se expone en el `src` ni en logs. Alineado con ADM-001 D-32.
- 2026-10-24: AUTH-D-08: proveedores OAuth dinámicos y parametrizables desde el backoffice de la SaaS (`auth_providers_config`); acceso unificado a `mocter-admin` desde el botón del header de la landing contiguo a «Solicitar demo» (§2.7).
- 2026-10-25: **AUTH-001 1.1 (Fase 1):** se agregan criterios BDD y anexo i18n; se mantienen RNF-01 a RNF-03 del documento de origen.

## 5. Criterios de Aceptación (BDD)

### CA-AUTH-01 · Login nativo y sesión
- **Dado** un usuario verificado con correo y contraseña,
- **Cuando** inicia sesión,
- **Entonces** recibe la cookie `__Host-mocter_sid` (`HttpOnly`, `Secure`, `SameSite=Strict`) y la sesión se valida contra el store compartido.

### CA-AUTH-02 · OAuth parametrizable
- **Dado** Google habilitado y Facebook deshabilitado en `auth_providers_config`,
- **Cuando** se renderiza el login,
- **Entonces** solo aparece Google y el callback valida `state`/PKCE.

### CA-AUTH-03 · 2FA TOTP
- **Dado** un usuario con 2FA activo,
- **Cuando** ingresa su código TOTP válido,
- **Entonces** se crea la sesión con `mfa_at`; un código inválido no crea sesión.

### CA-AUTH-04 · Revocación inmediata
- **Dado** un usuario con sesiones activas,
- **Cuando** se revoca su acceso o cambia de membresía,
- **Entonces** las réplicas rechazan la sesión en ≤ 1 s y Redis/Postgres fallan cerrado si no responden.

### CA-AUTH-05 · SSO Chatwoot embebido
- **Dado** un usuario con membresía activa y cuenta Chatwoot `active`,
- **Cuando** carga `/auth/chatwoot/embed?client_id=...` en el iframe,
- **Entonces** se emite un JWT de 5 min de un solo uso, sin exponerlo en el `src`, el historial o logs.

### CA-AUTH-06 · Rate limiting
- **Dado** intentos repetidos de login o registro,
- **Cuando** se supera la cuota configurada,
- **Entonces** el endpoint responde `429` con `Retry-After`.

## 6. Anexo i18n · Catálogo de Cadenas

| Clave | Español | Inglés |
|---|---|---|
| `auth.login.title` | Iniciar sesión | Sign in |
| `auth.register.title` | Crear cuenta | Create account |
| `auth.email` | Correo electrónico | Email |
| `auth.password` | Contraseña | Password |
| `auth.2fa.title` | Verificación en dos pasos | Two-step verification |
| `auth.2fa.code` | Código de 6 dígitos | 6-digit code |
| `auth.error.invalid_credentials` | Correo o contraseña incorrectos | Invalid email or password |
| `auth.error.rate_limited` | Demasiados intentos; intenta más tarde | Too many attempts; try again later |
| `auth.error.session_expired` | Tu sesión expiró | Your session expired |

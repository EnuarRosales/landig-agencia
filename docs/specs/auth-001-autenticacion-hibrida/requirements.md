# AUTH-001 · Requisitos · Sistema híbrido de autenticación y autorización

| Atributo | Valor |
|---|---|
| ID | AUTH-001 |
| Versión | 1.0 |
| Estado | Aprobado (documento de origen) · Pendiente de `design.md` y `tasks.md` |
| Fecha | 2026-10-20 |
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

**RF-01: Autenticación Delegada (Federada)**

- Proveedores Soportados: Google y Facebook.
- Protocolo: Implementación estricta de OAuth 2.0 y OpenID Connect (OIDC).
- Flujo de Registro/Inicio de Sesión: Si el usuario no existe en la base de datos interna, el sistema debe crear un perfil automáticamente utilizando el ID único del proveedor (provider_id), el correo electrónico verificado, el nombre y la foto de perfil. Si ya existe, se inicia sesión directamente.

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

1. `AUTH-001` resuelve la sesión en `mocter-admin`; el acceso a Chatwoot continúa por SSO nativo (RF-02.2 de ADM-001). No se comparten credenciales entre sistemas.
2. Un usuario de Chatwoot **no** es un usuario de `mocter-admin`. Chatwoot comparte un mismo registro de usuario entre cuentas cuando el correo coincide; aquí, en cambio, una cuenta de plataforma puede pertenecer a varios inquilinos. La correlación es por inquilino.
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

El almacén compartido de A-03 se resuelve en AUTH-D-02. La elección entre JWT y cookie de sesión (A-05) sigue abierta; AUTH-D-02 sirve para ambas.

### 2.4 Vacío detectado

El documento define cómo un usuario se registra y cómo se vinculan sus identidades, pero **no define cómo un usuario pasa a pertenecer a un inquilino**. El alta por autogestión (ADM-001, RF-01.3) implica que quien la realiza queda como administrador del inquilino creado, pero la incorporación de usuarios adicionales, la invitación y el rol resultante no están especificados.

### 2.5 Identidad global y RLS

La identidad de plataforma es global: un usuario puede pertenecer a varias organizaciones o inquilinos. Por eso, en el Router Global, `users`, `identities` y `sessions` no tienen un `client_id` único y no usan RLS por `client_id`; se protegen con un rol de autenticación dedicado y filtros de aplicación. Las tablas de membresía y tenencia (`organization_members`, `client_users`) sí llevan `client_id` y usan RLS.

La tabla `users` de cada celda es distinta: es la proyección de los usuarios que pertenecen al inquilino, lleva `client_id` y usa RLS. No es la tabla de identidad global. En una celda dedicada por aislamiento normativo, la identidad se aloja en la celda (AUTH-D-01) y puede usar RLS por `client_id`; el Router Global conserva solo el puntero de enrutamiento, sin credenciales.

Ver DAT-001 RF-05.5 y `design.md` §5.4.

## 3. Decisiones

### Tomadas

| ID | Decisión | Consecuencia de diseño |
|---|---|---|
| AUTH-D-01 | El almacén de identidad —credenciales, secreto TOTP e identidades federadas— vive en el Router Global. Un inquilino con requisito normativo de aislamiento recibe una celda dedicada que además contiene su identidad; en ese caso el Router Global conserva solo el puntero de enrutamiento, sin credenciales ni secretos. | El correo único global y la vinculación de cuentas de RF-04 se resuelven en un único lugar. La ubicación de la identidad se resuelve **antes** de autenticar, consultando la tabla de enrutamiento (ADM-001, RF-10.3). El módulo de identidad debe soportar ambas ubicaciones desde el diseño, no como excepción posterior. Corresponde a D-12 de ADM-001. |
| AUTH-D-02 | El almacén compartido para rate limiting y revocación de sesión es el Redis 7+ dedicado del plano de control (DAT-001, O-01). No comparte instancia con el Redis de Chatwoot. Las claves de auth usan prefijos propios y TTL; se comparte con la caché de enrutamiento sin mezclar espacios de nombres. | El rate limiting funciona entre réplicas y la revocación no depende del Redis de Chatwoot. La disponibilidad de auth queda acoplada al Redis del plano de control, no al plano de soporte. |
| AUTH-D-03 | En el Router Global, las tablas de identidad y sesión (`users`, `identities`, `sessions`) son globales: un usuario puede pertenecer a varias organizaciones o inquilinos y no tiene un `client_id` único. No usan RLS por `client_id`; se protegen con un rol de autenticación dedicado y filtros de aplicación. Las tablas de membresía/tenencia (`organization_members`, `client_users`) y la proyección `users` de cada celda usan RLS. En una celda dedicada por aislamiento normativo, la identidad vive en la celda (AUTH-D-01) y puede usar RLS por `client_id`; el Router Global conserva solo el puntero de enrutamiento. | Ver DAT-001 RF-05.5 y `design.md` §5.4. El login por email no queda bloqueado por una política de tenant; la separación es por rol y filtro, no por RLS de `client_id`. |

### Abiertas

| ID | Pregunta | Impacto |
|---|---|---|
| A-02 | ¿Dónde vive la clave de cifrado de los secretos TOTP y cuál es su plan de rotación? | Sin esto, RNF-01 no se puede cumplir. |
| A-04 | ¿Cómo se incorpora un usuario a un inquilino y con qué rol? | Vacío del documento de origen (ver 2.4). |
| A-05 | ¿Sesión con JWT sin estado o cookie con sesión en servidor? | Define si la revocación inmediata es posible. |

## 4. Trazabilidad

- 2026-10-20: alineación con DAT-001 (T-13): A-03 resuelta con el Redis dedicado del plano de control (O-01); identidad global sin RLS por `client_id` y RLS solo en tenencia (O-03); A-02, A-04 y A-05 siguen abiertas.

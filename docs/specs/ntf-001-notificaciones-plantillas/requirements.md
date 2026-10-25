# NTF-001 · Requisitos · Notificaciones transaccionales y plantillas de correo

| Atributo | Valor |
|---|---|
| ID | NTF-001 |
| Versión | 1.1 (Aprobada — RabbitMQ no bloqueante) |
| Fecha | 2026-10-25 |
| Depende de | [ADM-001](../adm-001-mocter-admin/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [BILL-001](../bill-001-facturacion-saas/requirements.md) · [REF-001](../ref-001-programa-referidos/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-database-postgres-drizzle.md` · `.agents/rules/rules-for-i18n.md` |
| Estado | Aprobada |

## 1. Propósito

Centralizar el correo transaccional de la SaaS: **remitentes**, **proveedor de envío**, **catálogo de eventos**, **plantillas versionadas con editor de texto enriquecido**, **preview/test**, **outbox con reintentos** y **log de entregas**. Los módulos de negocio no envían correo directamente: emiten un evento con variables y NTF-001 resuelve la plantilla y el remitente.

## 2. Requisitos de origen (decisión del usuario, verbatim)

- «De todo lo planeado no se ha establecido un adminstrable donde configurar el o los correos que la SaaS utilizara para notificar diferenten evento dentro de la plataforma a sus inquilinos, tambien se requier una administrable de plantillas de correo electronico que se puedan actualizar con facilidad usando editores de texto enriquecido, por ejemplo al registrarse un nuevo inquilino por branding se deberia enviar un correo de bienvenida, cuando se realizan pagos de renovacion de suscripcion, cuando el usuario es elevado a lider de comunidad o colider, cuando es aceptado en una comunidad o cuando un referido se registra. Por el lado del formulario de la landing page es necesario generarle una vista adminitrativa en la cual se pueda gestionar los contactos realizados por ese canal.»
- La bandeja de contactos de la landing se documenta en ADM-001 (decisión de ownership del 2026-10-25).

## 3. Alcance

### Incluye

1. Configuración de uno o varios remitentes y del proveedor de correo.
2. Catálogo de eventos transaccionales y sus variables.
3. Plantillas por evento e idioma, versionadas y editables con editor de texto enriquecido.
4. Preview, envío de prueba, publicación y retiro de plantillas.
5. Outbox, worker de envío, reintentos, idempotencia y log de entregas.
6. Administración desde el backoffice SaaS con permisos `platform_owner`/`platform_admin`.
7. i18n es/en de la UI y de las plantillas; auditoría global.

### Excluye

- Campañas masivas de marketing y listas de suscripción.
- Correo entrante (inbound), buzón de respuestas o parsing de rebotes avanzado.
- La lógica de negocio que origina cada evento (AUTH, BILL, REF, ADM).
- La vista de contactos de la landing: vive en ADM-001.
- El canal email de Chatwoot, que sigue siendo dominio de CHW-001.

## 4. Requisitos Funcionales

### RF-01 · Remitentes

| ID | Requisito |
|---|---|
| RF-01.1 | Existen uno o varios remitentes (`email_senders`) con `key` único, `from_name`, `from_email`, `reply_to`, proveedor, `is_default` y estado. |
| RF-01.2 | Cada remitente pertenece a un proveedor configurado; el remitente por defecto se usa cuando el evento no define uno. |
| RF-01.3 | Solo `platform_owner`/`platform_admin` crean, editan, activan o retiran remitentes. |
| RF-01.4 | El dominio del `from_email` debe estar verificado (SPF/DKIM/DMARC) antes de habilitar el remitente en producción. |

### RF-02 · Proveedor de correo

| ID | Requisito |
|---|---|
| RF-02.1 | Existe una configuración de proveedor (`email_provider_configs`) con `driver`, host, puerto, TLS, credenciales y estado. |
| RF-02.2 | v1 soporta **SMTP** (cualquier proveedor compatible: Resend, SendGrid, Mailgun, SES, etc.); un driver API (p. ej. Resend) queda como extensión. |
| RF-02.3 | Las credenciales se cifran con AES-256-GCM y la maquinaria de claves de AUTH-D-04; nunca se muestran completas ni se escriben en logs. |
| RF-02.4 | La UI permite probar conexión y enviar un correo de prueba a una dirección autorizada. |

### RF-03 · Catálogo de eventos

| ID | Requisito |
|---|---|
| RF-03.1 | Existe `email_events` con `key` único, categoría, descripción, `variables_schema` JSONB, remitente por defecto, `is_enabled` e `is_system`. |
| RF-03.2 | Los eventos iniciales son: `auth.verify_email`, `auth.reset_password`, `tenant.welcome`, `billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`, `community.role_promoted`, `community.join_accepted`, `referral.registered` y `landing.lead_received`. |
| RF-03.3 | Los módulos emiten el evento con las variables declaradas; NTF-001 no contiene lógica de negocio ni decide destinatarios. |
| RF-03.4 | Los eventos `is_system` (auth) usan plantillas bloqueadas: variables fijas y revisión de plataforma; no se permite romper el flujo de verificación o reset. |

### RF-04 · Plantillas y editor

| ID | Requisito |
|---|---|
| RF-04.1 | Cada plantilla (`email_templates`) tiene `event_key`, `locale`, remitente, asunto, cuerpo en JSON (editor) y HTML sanitizado, versión y estado (`draft`/`published`/`retired`). |
| RF-04.2 | Solo puede haber una versión `published` por `(event_key, locale)`; publicar una nueva retira la anterior. |
| RF-04.3 | El cuerpo se edita con un editor de texto enriquecido **TipTap** (headless, React) y se guarda como JSON + HTML; el HTML se sanitiza en servidor antes de enviar. |
| RF-04.4 | Las variables se declaran en `variables_schema` y se insertan como `{{variable}}`; una variable desconocida o faltante bloquea la publicación/el envío. |
| RF-04.5 | La UI ofrece preview con datos de ejemplo, envío de prueba, duplicado y restauración de versión. |
| RF-04.6 | Las plantillas de sistema (`auth.*`) están bloqueadas para edición libre: solo `platform_owner` puede cambiar textos permitidos y variables fijas. |

### RF-05 · Despacho y entregas

| ID | Requisito |
|---|---|
| RF-05.1 | El módulo de negocio llama a `enqueueEmail(event_key, recipient, locale, variables, idempotency_key)`; NTF-001 resuelve plantilla y remitente. |
| RF-05.2 | **No bloqueante:** `enqueueEmail` solo persiste el mensaje en el outbox (`email_deliveries`) dentro de la transacción de negocio. Nunca espera a RabbitMQ, al worker ni al proveedor SMTP. |
| RF-05.3 | **Cola:** un relay publica el outbox en **RabbitMQ** y un worker independiente consume y envía por SMTP. Si RabbitMQ o SMTP fallan, la funcionalidad de negocio ya confirmada no falla ni se revierte. |
| RF-05.4 | La `idempotency_key` evita duplicados: el mismo evento/recipient no genera dos entregas. |
| RF-05.5 | Reintentos con backoff (máximo 3) y **dead-letter queue**; al agotarse, la entrega queda `failed` y se alerta, sin afectar la operación origen. |
| RF-05.6 | Cada entrega registra destinatario, plantilla/versión, remitente, estado, intentos, error y `provider_message_id`; el log es consultable. |
| RF-05.7 | El locale se toma de `clients.locale` o del usuario; fallback `es`. Si no hay plantilla publicada en ese locale, se usa la de `es`. |
| RF-05.8 | Si el outbox no puede persistirse, la transacción de negocio puede fallar; si falla la notificación después del commit, **nunca** se propaga el error al caso de uso original. |

### RF-06 · Administración y permisos

| ID | Requisito |
|---|---|
| RF-06.1 | Existe `/admin/settings/notifications` con secciones: remitentes, proveedor, eventos, plantillas y entregas. |
| RF-06.2 | `platform_owner`/`platform_admin` administran todo; `platform_sales` no accede a credenciales ni plantillas. |
| RF-06.3 | Toda acción (crear/editar/publicar/retirar/probar/reintentar) queda auditada con actor, entidad y fecha. |
| RF-06.4 | La UI y los correos están internacionalizados (es/en, Español por defecto). |

## 5. Requisitos No Funcionales (RNF)

| ID | Categoría | Métrica / Umbral |
|---|---|---|
| RNF-01 | Encolado | `enqueueEmail` P95 ≤ 100 ms y **nunca espera RabbitMQ/SMTP**; solo persiste el outbox. |
| RNF-02 | Render | Render de plantilla P95 ≤ 50 ms; sanitización incluida. |
| RNF-03 | Entrega | P95 de envío al proveedor ≤ 30 s desde el encolado; throughput ≥ 100 correos/min por worker. |
| RNF-04 | Disponibilidad | 99.9% del servicio de encolado; los fallos de RabbitMQ/proveedor no tumban la plataforma. |
| RNF-05 | Reintentos | Máximo 3 intentos con backoff y DLQ; entrega `failed` visible y alertable. |
| RNF-09 | No bloqueo | Con RabbitMQ caído, el 100% de las operaciones de negocio que encolan terminan correctamente; el outbox queda pendiente y se publica al recuperarse. |
| RNF-06 | Seguridad | Credenciales cifradas; HTML sanitizado; cero secretos o cuerpos completos en logs. |
| RNF-07 | i18n | Plantillas y UI es/en; fallback `es`; variables escapadas. |
| RNF-08 | Auditoría | 100% de cambios de remitente, plantilla, evento y entrega registrados. |

## 6. Criterios de Aceptación (BDD)

### CA-NTF-01 · Plantilla publicada
- **Dado** una plantilla en `draft`,
- **Cuando** se publica,
- **Entonces** pasa a `published`, la versión anterior se retira y el siguiente evento usa la nueva.

### CA-NTF-02 · Bienvenida al inquilino
- **Dado** un inquilino recién creado en el onboarding,
- **Cuando** se emite `tenant.welcome`,
- **Entonces** se envía un correo al `contact_email` con la plantilla y el remitente configurados, una sola vez por `idempotency_key`.

### CA-NTF-03 · Pago/renovación
- **Dado** un pago aprobado o una renovación de BILL-001,
- **Cuando** se emite `billing.payment_succeeded` o `billing.renewal`,
- **Entonces** el correo incluye plan, monto y período, sin datos de tarjeta.

### CA-NTF-04 · Comunidad
- **Dado** un usuario promovido a líder/co-líder o aceptado en una comunidad,
- **Cuando** ADM-001 emite `community.role_promoted` o `community.join_accepted`,
- **Entonces** recibe el correo con el rol/comunidad y el enlace correspondiente.

### CA-NTF-05 · Referido registrado
- **Dado** un referido que se registra con un código,
- **Cuando** REF-001 emite `referral.registered`,
- **Entonces** el referente recibe la notificación una sola vez.

### CA-NTF-06 · Reintento e idempotencia
- **Dado** un fallo temporal del proveedor,
- **Cuando** el worker reintenta,
- **Entonces** no duplica la entrega y el estado final queda visible; tras 3 fallos queda `failed`.

### CA-NTF-07 · Plantilla de sistema
- **Dado** una plantilla `auth.reset_password`,
- **Cuando** un rol no autorizado intenta editarla,
- **Entonces** la UI/API lo rechaza; solo `platform_owner` cambia textos permitidos y variables fijas.

### CA-NTF-08 · Aislamiento de administración
- **Dado** un `tenant_owner`,
- **Cuando** intenta acceder a `/admin/settings/notifications`,
- **Entonces** recibe 403; no ve remitentes, credenciales, plantillas ni entregas.

### CA-NTF-09 · RabbitMQ caído no bloquea el negocio
- **Dado** RabbitMQ no disponible,
- **Cuando** un caso de uso (alta de inquilino, pago o referido) encola una notificación,
- **Entonces** la operación de negocio termina correctamente y el outbox queda `queued`;
- **Y cuando** RabbitMQ se recupera, el relay publica el mensaje y el worker lo entrega sin duplicados.

## 7. Decisiones del documento

| ID | Decisión | Consecuencia |
|---|---|---|
| D-01 | NTF-001 centraliza todo el correo transaccional, incluido auth. | Un solo proveedor, remitentes y plantillas; AUTH/BILL/REF/ADM emiten eventos. |
| D-02 | SMTP v1, driver API futuro. | Compatible con cualquier proveedor; sin lock-in. |
| D-03 | TipTap como editor enriquecido. | JSON + HTML, extensiones y sanitización server-side. |
| D-04 | Plantillas versionadas y una publicada por evento/locale. | Cambios seguros y reversibles. |
| D-05 | Outbox + worker + reintentos. | El envío no bloquea la operación y los fallos son observables. |
| D-06 | Plantillas `auth.*` bloqueadas. | No se rompen verificación/reset por una edición comercial. |
| D-07 | **Outbox + RabbitMQ + worker independiente.** | El envío es asíncrono y tolerante a caídas de la cola o del proveedor. |
| D-08 | **La notificación nunca bloquea la funcionalidad.** | Un fallo de RabbitMQ/SMTP no revierte ni falla el caso de uso que originó el evento. |

## 8. Decisiones abiertas

No quedan decisiones abiertas en NTF-001.

## 9. Fuera de alcance

Campañas masivas, marketing, inbound, parsing avanzado de rebotes, deliverability consulting y la bandeja de contactos de la landing (ADM-001).

## 10. Impactos en otras especificaciones

| Spec | Impacto |
|---|---|
| ADM-001 | Emite `tenant.welcome`, `community.role_promoted`, `community.join_accepted`; aloja la bandeja de leads. |
| AUTH-001 | Delega verificación/reset en NTF-001 (`auth.*`); mantiene la lógica de tokens. |
| BILL-001 | Emite `billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`; deja de enviar correo directo. |
| REF-001 | Emite `referral.registered`. |
| DAT-001 | Router Global, auditoría RF-10.9 y claves cifradas. |
| DSN-001 | Patrón visual del editor/plantillas y estados vacíos. |
| OPS-001 | RabbitMQ health/queue depth, alertas de entregas `failed` y métricas del worker. |

## 11. Trazabilidad

- L1 (2026-10-25): «De todo lo planeado no se ha establecido un adminstrable donde configurar el o los correos que la SaaS utilizara para notificar diferenten evento dentro de la plataforma a sus inquilinos, tambien se requier una administrable de plantillas de correo electronico que se puedan actualizar con facilidad usando editores de texto enriquecido, por ejemplo al registrarse un nuevo inquilino por branding se deberia enviar un correo de bienvenida, cuando se realizan pagos de renovacion de suscripcion, cuando el usuario es elevado a lider de comunidad o colider, cuando es aceptado en una comunidad o cuando un referido se registra. Por el lado del formulario de la landing page es necesario generarle una vista adminitrativa en la cual se pueda gestionar los contactos realizados por ese canal.»
- L2 (2026-10-25): **NTF-001 aprobada (1.0).** Remitentes múltiples, SMTP v1, TipTap, catálogo de 10 eventos, plantillas versionadas, outbox/reintentos y administración en `/admin/settings/notifications`. La bandeja de leads se documenta en ADM-001.
- L3 (2026-10-25): regla del usuario: el servicio de notificaciones **no debe ser bloqueante**; si la notificación falla, la funcionalidad no falla. Se incorpora **outbox + RabbitMQ + worker independiente + DLQ**; con RabbitMQ caído, el negocio continúa y el outbox se publica al recuperarse.

## 12. Anexo i18n · Catálogo de Cadenas

| Clave | Español | Inglés |
|---|---|---|
| `notifications.title` | Notificaciones y correos | Notifications and email |
| `notifications.senders` | Remitentes | Senders |
| `notifications.provider` | Proveedor | Provider |
| `notifications.events` | Eventos | Events |
| `notifications.templates` | Plantillas | Templates |
| `notifications.deliveries` | Entregas | Deliveries |
| `notifications.test_send` | Enviar prueba | Send test |
| `notifications.preview` | Vista previa | Preview |
| `notifications.publish` | Publicar | Publish |
| `notifications.retry` | Reintentar | Retry |
| `notifications.status.sent` | Enviado | Sent |
| `notifications.status.failed` | Fallido | Failed |
| `notifications.status.queued` | En cola | Queued |

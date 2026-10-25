# NTF-001 · Diseño · Notificaciones transaccionales y plantillas de correo

| Atributo | Valor |
|---|---|
| ID | NTF-001 |
| Versión | 1.1 (Aprobada — RabbitMQ no bloqueante) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [ADM-001](../adm-001-mocter-admin/design.md) · [AUTH-001](../auth-001-autenticacion-hibrida/design.md) · [BILL-001](../bill-001-facturacion-saas/design.md) · [REF-001](../ref-001-programa-referidos/design.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/design.md) |
| Estado | Aprobada |

## 1. Principios

1. **Un solo correo transaccional.** AUTH, BILL, REF y ADM emiten eventos; NTF-001 resuelve remitente, plantilla y entrega.
2. **El negocio no espera a la cola ni al proveedor.** `enqueueEmail` solo persiste el outbox; el relay publica en RabbitMQ y el worker envía. Un fallo de RabbitMQ/SMTP no falla la funcionalidad.
3. **Plantillas seguras y versionadas.** Una publicada por evento/locale; HTML sanitizado.
4. **Remitentes administrables.** Múltiples identidades con remitente por defecto y asignación por evento.
5. **Secretos fuera de la base.** Credenciales SMTP y de RabbitMQ cifradas con la maquinaria de AUTH-D-04.
6. **Todo se audita.** Remitentes, eventos, plantillas, publicaciones, pruebas y entregas.

## 2. Arquitectura

```mermaid
flowchart TD
    subgraph Módulos de negocio
        AUTH[AUTH-001] -->|auth.*| ENQ
        ADM[ADM-001] -->|tenant.welcome / community.*| ENQ
        BILL[BILL-001] -->|billing.*| ENQ
        REF[REF-001] -->|referral.registered| ENQ
    end

    subgraph NTF-001
        ENQ[enqueueEmail] --> RES[Resolver evento + plantilla + remitente]
        RES --> RENDER[Render + sanitizar HTML]
        RENDER --> OUTBOX[(email_deliveries outbox)]
        OUTBOX --> RELAY[Relay de outbox]
        RELAY --> RABBIT[(RabbitMQ)]
        RABBIT --> WORKER[Worker de envío]
        WORKER --> PROVIDER[Proveedor SMTP]
        WORKER --> DLQ[Dead-letter queue]
        WORKER --> LOG[Log / reintentos]
    end

    subgraph Backoffice SaaS
        UI[/admin/settings/notifications] --> SENDERS[Remitentes]
        UI --> TEMPLATES[Plantillas TipTap]
        UI --> EVENTS[Catálogo de eventos]
        UI --> DELIVERIES[Entregas]
    end
```

## 3. Modelo de datos (Router Global, schema `admin`)

| Tabla | Columnas clave |
|---|---|
| `email_provider_configs` | `id`, `name`, `driver` (`smtp`; API futuro), `host`, `port`, `secure`, `username`, `password_ciphertext`, `key_id`, `status`, auditoría |
| `email_senders` | `id`, `key` único, `from_name`, `from_email`, `reply_to`, `provider_id` FK, `is_default`, `status`, auditoría |
| `email_events` | `id`, `key` único, `category` (`auth`/`billing`/`community`/`referral`/`tenant`/`landing`), `description`, `variables_schema` JSONB, `default_sender_key` nullable, `is_enabled`, `is_system`, auditoría |
| `email_templates` | `id`, `event_key` FK, `locale` (`es`/`en`), `sender_id` FK nullable, `subject`, `body_json` JSONB (TipTap), `body_html`, `version`, `status` (`draft`/`published`/`retired`), `is_locked`, `published_at`, auditoría; único `(event_key, locale, version)` y parcial `published` por evento/locale |
| `email_deliveries` | `id`, `event_key`, `template_id`, `sender_id`, `recipient`, `client_id` nullable, `locale`, `payload` JSONB (variables sin secretos), `idempotency_key` único, `status` (`queued`/`published`/`sending`/`sent`/`failed`/`dead`), `attempts`, `last_error`, `provider_message_id`, `rabbitmq_message_id`, `published_at`, `dead_lettered_at`, `scheduled_at`, `sent_at`, auditoría |
| `email_delivery_events` | `id`, `delivery_id`, `attempt`, `status`, `error`, `provider_message_id`, `created_at`; append-only para trazabilidad |

- Las credenciales usan AES-256-GCM con `key_id` y rotación de AUTH-D-04; no se guardan en logs ni en el repositorio.
- El payload de la entrega no incluye contraseñas, tokens ni datos de tarjeta.
- `email_templates.body_html` se regenera desde `body_json` y se sanitiza con una allowlist de tags/atributos.

### 3.1 RabbitMQ

- Contenedor `rabbitmq:3.13-management` en Docker Compose, en la red interna; **sin puertos públicos** y sin router de Traefik.
- Colas: `email.send` (principal), `email.retry` (TTL/backoff) y `email.dlq` (dead-letter).
- Credenciales en Docker secrets; el worker y el relay usan usuarios de mínimo privilegio.
- Healthcheck y métricas (queue depth, consumers, mensajes sin ack) se exponen a OPS-001.
- El outbox en PostgreSQL es la fuente de verdad: si RabbitMQ se cae, los mensajes quedan `queued` y el relay los publica al recuperarse. No se respalda la cola.

## 4. Catálogo inicial de eventos

| `event_key` | Categoría | Variables mínimas |
|---|---|---|
| `auth.verify_email` | auth | `user_name`, `verify_url`, `expires_minutes` |
| `auth.reset_password` | auth | `user_name`, `reset_url`, `expires_minutes` |
| `tenant.welcome` | tenant | `tenant_name`, `owner_name`, `login_url`, `brand_name` |
| `billing.payment_succeeded` | billing | `tenant_name`, `plan_name`, `amount`, `currency`, `period_end` |
| `billing.payment_failed` | billing | `tenant_name`, `plan_name`, `amount`, `retry_url` |
| `billing.renewal` | billing | `tenant_name`, `plan_name`, `amount`, `currency`, `renewal_date` |
| `community.role_promoted` | community | `user_name`, `community_name`, `role`, `community_url` |
| `community.join_accepted` | community | `user_name`, `community_name`, `community_url` |
| `referral.registered` | referral | `referrer_name`, `referred_name`, `reward_summary` |
| `landing.lead_received` | landing | `lead_name`, `lead_email`, `lead_phone`, `message` |

Los eventos `auth.*` son `is_system` y sus plantillas `is_locked`; las variables son fijas y no admiten HTML libre.

## 5. Flujo de envío

1. El módulo de negocio ejecuta `enqueueEmail(event_key, recipient, locale, variables, idempotency_key)`.
2. NTF-001 valida el evento, las variables y el locale; resuelve la plantilla `published` y el remitente (evento → remitente por defecto).
3. Renderiza asunto/cuerpo, escapa variables y sanitiza HTML; inserta `email_deliveries` en estado `queued` con `idempotency_key` único. **La llamada termina aquí: no espera RabbitMQ ni SMTP.**
4. Un relay lee el outbox `queued` con `FOR UPDATE SKIP LOCKED`, publica en RabbitMQ y marca `published` + `rabbitmq_message_id`.
5. El worker consume `email.send`, marca `sending`, envía por SMTP y registra `provider_message_id`; si falla, publica en `email.retry` con TTL/backoff.
6. Tras 3 fallos, el mensaje va a `email.dlq`, la entrega queda `dead`/`failed` y se alerta; el caso de uso original no se ve afectado.
7. Si RabbitMQ está caído, el relay reintenta y los mensajes permanecen `queued`; el negocio continúa.
8. Si el `idempotency_key` ya existe, no crea otra entrega; devuelve la existente.

## 6. Editor de plantillas

- **TipTap** headless sobre React 19; extensiones básicas (bold, italic, lists, links, headings, images por URL).
- Se guarda `body_json` (documento TipTap) y `body_html` generado; el HTML se sanitiza en servidor con allowlist.
- Variables disponibles desde `variables_schema`; el editor las inserta como chips y el render las escapa.
- Preview con datos de ejemplo y envío de prueba a una dirección autorizada; rate limit por usuario.
- Plantillas `auth.*` bloqueadas: solo `platform_owner` edita textos permitidos; las variables no se renombran.

## 7. Administración

Ruta `/admin/settings/notifications`:

1. **Remitentes:** lista, alta/edición, remitente por defecto, estado y verificación de dominio.
2. **Proveedor:** configuración SMTP, prueba de conexión y envío de prueba; credenciales enmascaradas.
3. **Eventos:** catálogo, variables, remitente por defecto, habilitado/deshabilitado.
4. **Plantillas:** por evento/locale, editor TipTap, versiones, preview, publicar/retirar.
5. **Entregas:** filtros por estado/fecha/evento, detalle, reintento manual y errores.

Permisos: `platform_owner`/`platform_admin`; `platform_sales` sin acceso; `tenant_*` 403.

## 8. Seguridad y auditoría

- Credenciales SMTP cifradas; `password_ciphertext` nunca se devuelve.
- HTML sanitizado; variables escapadas; no se permite JavaScript ni iframes.
- Logs sin secretos, tokens ni cuerpos completos; destinatario enmascarado en logs operativos.
- Auditoría de cambios de remitente, evento, plantilla, publicación, prueba y reintento (DAT-001 RF-10.9).
- Rate limit de envío de prueba y de `enqueueEmail` por tenant/evento.

## 9. Verificación

| Control | Prueba |
|---|---|
| Remitentes | Cambiar el remitente por defecto altera el `From` del siguiente envío, no el de las entregas ya encoladas |
| Plantillas | Publicar una versión nueva retira la anterior y el siguiente evento usa la nueva |
| Variables | Una variable faltante bloquea publicación/envío con error explícito |
| Bienvenida | Un alta nueva encola `tenant.welcome` una sola vez por `idempotency_key` |
| Pago/renovación | BILL emite el evento y el correo incluye plan, monto y período sin datos de tarjeta |
| Comunidad | Promoción/aceptación envía al usuario correcto con rol y enlace |
| Reintentos | Un fallo temporal reintenta sin duplicar; 3 fallos dejan `failed`/DLQ y alerta |
| RabbitMQ caído | El alta/pago/referido termina correctamente; el outbox queda `queued` y se publica al recuperarse |
| Seguridad | Un tenant recibe 403; las credenciales no aparecen en respuestas ni logs |
| i18n | Plantilla `en` para locale `en`; fallback `es` si falta |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Correo en spam | SPF/DKIM/DMARC, remitente verificado, pruebas de deliverability |
| Plantilla rota por edición | Versionado, preview, variables validadas, auth bloqueado |
| Duplicados | `idempotency_key` único y worker idempotente |
| Fuga de credenciales | AES-256-GCM, `key_id`, enmascarado, sin logs |
| Proveedor caído | Outbox, reintentos, DLQ, alerta y fallback de proveedor futuro |
| RabbitMQ caído | El negocio continúa; el outbox retiene los mensajes y el relay publica al recuperarse |
| HTML malicioso | Sanitización server-side y allowlist estricta |

## 11. Alineación con otras especificaciones

| Spec | Punto de contacto |
|---|---|
| AUTH-001 | Emite `auth.verify_email`/`auth.reset_password`; NTF-001 envía |
| ADM-001 | Emite bienvenida y eventos de comunidad; bandeja de leads |
| BILL-001 | Emite pagos/renovaciones; NTF-001 envía comprobantes |
| REF-001 | Emite `referral.registered` |
| DAT-001 | Router Global, auditoría y claves cifradas |
| DSN-001 | Editor, tablas y estados del backoffice |
| OPS-001 | RabbitMQ (health, queue depth, consumers), alertas de entregas fallidas y métricas del worker |

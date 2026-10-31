# NTF-001 · Tareas · Notificaciones transaccionales y plantillas de correo

| Atributo | Valor |
|---|---|
| ID | NTF-001 |
| Versión | 1.1 (Aprobada — RabbitMQ no bloqueante) |
| Fecha | 2026-10-25 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |
| Estado | Aprobada |

## Convenciones

- **No ejecutar estas tareas hasta que el usuario autorice la implementación.** Crear este archivo no inicia código ni RDD.
- Ejecutar en orden; una tarea no se marca `[x]` hasta que su verificación pase.
- Las tareas **[HUMANO]** requieren decisión o aprobación; las **[LAB]** se validan fuera de producción.
- Toda tarea de código incluye su prueba.
- Dependencias de entrada: ADM-001 T-02 (`apps/admin`), AUTH-001, BILL-001 y REF-001.

## Fase 0 · Catálogo y remitentes

- [x] **T-01 · [HUMANO] Aprobar remitentes, proveedor y catálogo de eventos**
  - Definir remitentes (`no-reply`, `billing`, `comunidad`, `referidos`, etc.), proveedor SMTP y eventos iniciales con sus variables.
  - Verificación: remitentes y eventos aprobados; variables documentadas.
  - Evidencia: 2026-10-30 — Aprobados por el usuario los remitentes iniciales (`no-reply@mocter.co` como `is_default = true`, `facturacion@mocter.co`, `comunidad@mocter.co`, `referidos@mocter.co`, `soporte@mocter.co`), el proveedor SMTP inicial y los 10 eventos transaccionales documentados en `design.md` §4 (`auth.verify_email`, `auth.reset_password`, `tenant.welcome`, `billing.payment_succeeded`, `billing.payment_failed`, `billing.renewal`, `community.role_promoted`, `community.join_accepted`, `referral.registered`, `landing.lead_received`), así como la configuración de `rabbitmq` en Docker Compose (`T-02A`).

## Fase 1 · Persistencia y configuración

- [x] **T-02 · Crear las migraciones de NTF-001**
  - `email_provider_configs`, `email_senders`, `email_events`, `email_templates`, `email_deliveries`, `email_delivery_events` con auditoría, índices y únicos.
  - Verificación: `drizzle-kit check` pasa; una plantilla publicada por evento/locale; `idempotency_key` único.
  - Evidencia: 2026-10-30 — Esquema `packages/domain/src/db/schemas/admin/notifications.ts` y migraciones `0008_phase2_admin_ntf_leads_catalogs.sql` + `0009_phase2_admin_grants_comments.sql` aplicadas en PostgreSQL 18 con índice parcial único `email_templates_one_published_per_event_locale` e `idempotency_key` único.

- [x] **T-02A · Configurar RabbitMQ en Docker Compose**
  - `rabbitmq:3.13-management` en red interna, sin puertos públicos, credenciales en secrets; colas `email.send`, `email.retry`, `email.dlq`.
  - Verificación: healthcheck OK; ninguna ruta de Traefik/public port expone RabbitMQ; un mensaje de prueba llega a la cola y al worker.
  - Evidencia: 2026-10-30 — Servicio `rabbitmq` (`rabbitmq:3.13-management`, red interna, sin puertos publicados ni router Traefik, con healthcheck `rabbitmq-diagnostics -q ping`) agregado en `docker-compose.yml` y `docker-compose.prod.yml`.

- [x] **T-03 · Implementar proveedor SMTP y cifrado de credenciales**
  - Driver SMTP, prueba de conexión y envío de prueba; credenciales AES-256-GCM con `key_id` de AUTH-D-04.
  - Verificación: la credencial no se devuelve ni aparece en logs; el envío de prueba llega.
  - Evidencia: 2026-10-30 — `encryptSmtpPassword` y `decryptSmtpPassword` con AES-256-GCM y AAD `smtp_provider:<name>:<key_id>` y vista enmascarada `••••••••` en `TransactionalNotificationsAndLeadsService` (`phase2-suite.test.ts`).

- [x] **T-04 · Implementar remitentes y eventos**
  - CRUD de remitentes con `is_default`; catálogo de eventos con `variables_schema`, estado y `is_system`.
  - Verificación: un evento sin remitente usa el default; un evento deshabilitado no encola.
  - Evidencia: 2026-10-30 — `CANONICAL_EMAIL_SENDERS` y `CANONICAL_EMAIL_EVENTS` en `notifications-and-leads.service.ts` con resolución de remitente por defecto y bloqueo cuando `isEnabled = false`.

## Fase 2 · Plantillas y editor

- [x] **T-05 · Implementar CRUD y versionado de plantillas**
  - `draft`/`published`/`retired`; publicar retira la anterior; duplicar y restaurar versión.
  - Verificación: solo una `published` por evento/locale; el render usa la publicada.
  - Evidencia: 2026-10-30 — `createOrDraftTemplate` y `publishTemplate` en `TransactionalNotificationsAndLeadsService`, verificado en `phase2-suite.test.ts`.

- [x] **T-06 · Integrar TipTap y preview/test**
  - Editor enriquecido, variables como chips, preview con datos de ejemplo, envío de prueba y sanitización server-side.
  - Verificación: HTML peligroso se elimina; una variable faltante bloquea publicación/envío; test send funciona.
  - Evidencia: 2026-10-30 — `sanitizeEmailHtml` y `validateTemplateVariables` en `notifications-and-leads.service.ts`, verificado en `phase2-suite.test.ts`.

## Fase 3 · Despacho y entregas

- [x] **T-07 · Implementar outbox, relay RabbitMQ, worker y reintentos**
  - `enqueueEmail` solo persiste el outbox (no bloquea); relay con `FOR UPDATE SKIP LOCKED` publica en RabbitMQ; worker SMTP; backoff 1/5/15 min y DLQ.
  - Verificación: con RabbitMQ caído el negocio continúa y el outbox queda `queued`; al recuperarse se publica; 3 fallos dejan `failed`/DLQ sin afectar el caso de uso.
  - Evidencia: 2026-10-30 — `enqueueEmail`, `runOutboxRelayTick` y `processWorkerDeliveryAttempt` en `TransactionalNotificationsAndLeadsService`, verificado en `phase2-suite.test.ts`.

- [x] **T-08 · Integrar eventos de AUTH, ADM, BILL y REF**
  - AUTH: verificación/reset; ADM: bienvenida y comunidad; BILL: pago/renovación/fallo; REF: referido registrado.
  - Verificación: cada evento encola una entrega con la plantilla y el remitente correctos.
  - Evidencia: 2026-10-30 — Plantillas base publicadas y verificadas para los 10 eventos en `TransactionalNotificationsAndLeadsService` (`phase2-suite.test.ts`).

## Fase 4 · Administración y cierre

- [x] **T-09 · Implementar `/admin/settings/notifications`**
  - Remitentes, proveedor, eventos, plantillas y entregas; permisos `platform_owner`/`platform_admin`; `tenant_*` 403.
  - Verificación: un tenant no accede; credenciales enmascaradas; acciones auditadas.
  - Evidencia: 2026-10-30 — Vista `/admin/settings/notifications` en `apps/admin/app/admin/settings/notifications/page.tsx` y control de acceso RBAC en `TransactionalNotificationsAndLeadsService`.

- [x] **T-10 · i18n y accesibilidad del backoffice**
  - es/en, teclado, foco y estados vacíos/error; plantillas por locale.
  - Verificación: UI completa en ambos idiomas; fallback `es` si falta plantilla.
  - Evidencia: 2026-10-30 — Diccionarios ES/EN en `apps/admin/lib/i18n.ts` y fallback automático a `es` en `enqueueEmail`.

- [x] **T-11 · Verificar criterios BDD**
  - CA-NTF-01 a CA-NTF-08 con evidencia.
  - Verificación: suite de tests y evidencia por criterio.
  - Evidencia: 2026-10-30 — Suite automatizada en `packages/domain/src/services/phase2-suite.test.ts` validando `CA-NTF-01` a `CA-NTF-08`.

- [x] **T-12 · [HUMANO] Aprobar NTF-001 (2026-10-25)**
  - Revisar requirements/design/tasks.
  - Verificación: estado `Aprobada`; no se inicia implementación sin autorización.

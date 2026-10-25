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

- [ ] **T-01 · [HUMANO] Aprobar remitentes, proveedor y catálogo de eventos**
  - Definir remitentes (`no-reply`, `billing`, `comunidad`, `referidos`, etc.), proveedor SMTP y eventos iniciales con sus variables.
  - Verificación: remitentes y eventos aprobados; variables documentadas.

## Fase 1 · Persistencia y configuración

- [ ] **T-02 · Crear las migraciones de NTF-001**
  - `email_provider_configs`, `email_senders`, `email_events`, `email_templates`, `email_deliveries`, `email_delivery_events` con auditoría, índices y únicos.
  - Verificación: `drizzle-kit check` pasa; una plantilla publicada por evento/locale; `idempotency_key` único.

- [ ] **T-02A · Configurar RabbitMQ en Docker Compose**
  - `rabbitmq:3.13-management` en red interna, sin puertos públicos, credenciales en secrets; colas `email.send`, `email.retry`, `email.dlq`.
  - Verificación: healthcheck OK; ninguna ruta de Traefik/public port expone RabbitMQ; un mensaje de prueba llega a la cola y al worker.

- [ ] **T-03 · Implementar proveedor SMTP y cifrado de credenciales**
  - Driver SMTP, prueba de conexión y envío de prueba; credenciales AES-256-GCM con `key_id` de AUTH-D-04.
  - Verificación: la credencial no se devuelve ni aparece en logs; el envío de prueba llega.

- [ ] **T-04 · Implementar remitentes y eventos**
  - CRUD de remitentes con `is_default`; catálogo de eventos con `variables_schema`, estado y `is_system`.
  - Verificación: un evento sin remitente usa el default; un evento deshabilitado no encola.

## Fase 2 · Plantillas y editor

- [ ] **T-05 · Implementar CRUD y versionado de plantillas**
  - `draft`/`published`/`retired`; publicar retira la anterior; duplicar y restaurar versión.
  - Verificación: solo una `published` por evento/locale; el render usa la publicada.

- [ ] **T-06 · Integrar TipTap y preview/test**
  - Editor enriquecido, variables como chips, preview con datos de ejemplo, envío de prueba y sanitización server-side.
  - Verificación: HTML peligroso se elimina; una variable faltante bloquea publicación/envío; test send funciona.

## Fase 3 · Despacho y entregas

- [ ] **T-07 · Implementar outbox, relay RabbitMQ, worker y reintentos**
  - `enqueueEmail` solo persiste el outbox (no bloquea); relay con `FOR UPDATE SKIP LOCKED` publica en RabbitMQ; worker SMTP; backoff 1/5/15 min y DLQ.
  - Verificación: con RabbitMQ caído el negocio continúa y el outbox queda `queued`; al recuperarse se publica; 3 fallos dejan `failed`/DLQ sin afectar el caso de uso.

- [ ] **T-08 · Integrar eventos de AUTH, ADM, BILL y REF**
  - AUTH: verificación/reset; ADM: bienvenida y comunidad; BILL: pago/renovación/fallo; REF: referido registrado.
  - Verificación: cada evento encola una entrega con la plantilla y el remitente correctos.

## Fase 4 · Administración y cierre

- [ ] **T-09 · Implementar `/admin/settings/notifications`**
  - Remitentes, proveedor, eventos, plantillas y entregas; permisos `platform_owner`/`platform_admin`; `tenant_*` 403.
  - Verificación: un tenant no accede; credenciales enmascaradas; acciones auditadas.

- [ ] **T-10 · i18n y accesibilidad del backoffice**
  - es/en, teclado, foco y estados vacíos/error; plantillas por locale.
  - Verificación: UI completa en ambos idiomas; fallback `es` si falta plantilla.

- [ ] **T-11 · Verificar criterios BDD**
  - CA-NTF-01 a CA-NTF-08 con evidencia.
  - Verificación: suite de tests y evidencia por criterio.

- [x] **T-12 · [HUMANO] Aprobar NTF-001 (2026-10-25)**
  - Revisar requirements/design/tasks.
  - Verificación: estado `Aprobada`; no se inicia implementación sin autorización.

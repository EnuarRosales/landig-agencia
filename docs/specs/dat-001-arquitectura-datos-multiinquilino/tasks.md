# DAT-001 · Tareas · Arquitectura de datos multi-inquilino basada en celdas

| Atributo | Valor |
|---|---|
| ID | DAT-001 |
| Versión | 1.2 |
| Estado | Aprobada |
| Fecha | 2026-10-20 · actualizado 2026-10-26 |
| Depende de | [`requirements.md`](requirements.md) · [`design.md`](design.md) |

## Convenciones

- Ejecutar en orden. `[x]` solo cuando la verificación pase.
- Las tareas de documentación se cierran cuando el documento contiene lo que la verificación exige.
- Las tareas **[HUMANO]** no se ejecutan; se reportan como pendientes.
- La implementación de esquemas, migraciones y código pertenece a especificaciones posteriores. Esta spec fija la arquitectura.

## Tareas

- [x] **T-01 · Definir el alcance y los tres planos**
  - Separar soporte, control y datos.
  - Excluir N8N, Kubernetes/CNPG y el esquema de Chatwoot del alcance.
  - Verificación: `requirements.md` §2 y `design.md` §2 contienen los tres planos y la exclusión explícita de N8N.

- [x] **T-02 · Fijar la clave de tenencia y el modelo de entidades**
  - `client_id` UUIDv7 con `uuidv7()`.
  - `clients.id` como PK; `client_id` como FK en las tablas hijas.
  - Organizaciones y membresías separadas del inquilino.
  - Verificación: `requirements.md` RF-02 y `design.md` §3.2 usan `clients.id` y `client_id`, y no usan `tenant_id`.

- [x] **T-03 · Diseñar el plano de control y las tablas de cuota**
  - Plano de control: `cells`, `clients`, `client_routing`, `client_migrations`, `plans`, `plan_limits`, `client_plan_overrides`, `media_catalog`, `chatwoot_accounts`, `organizations` y `organization_members`.
  - Celda: `client_media`, `product_media` y `client_usage`, con el contador autoritativo local.
  - Verificación: `design.md` §3.2 y §6.5 listan las tablas con propósito y columnas clave.

- [x] **T-04 · Diseñar el alta y el enrutamiento**
  - Modelar el alta como saga con compensación.
  - Definir la resolución `client_id` → `cell_id`, la jerarquía de caché y `routing_version`.
  - Verificación: `design.md` §3.4 y §4 contienen la saga, el DDL de reserva y el contrato de sesión sin `cell_id`.

- [x] **T-05 · Diseñar RLS, roles y PgBouncer**
  - `FORCE ROW LEVEL SECURITY` en tablas de inquilino.
  - `SET LOCAL app.current_client_id` dentro de la transacción.
  - Roles `mocter_migrator`, `mocter_app` y `mocter_readonly`.
  - PgBouncer en modo transacción.
  - Verificación: `design.md` §5 contiene la política, los roles y la tabla de parámetros de PgBouncer.

- [x] **T-06 · Diseñar el particionado selectivo de 3 tablas**
  - Tablas de bajo/medio volumen y catálogo transaccional (`products`, `users`, `audit_logs`) sin particionar, con `client_id`, índice B-Tree y RLS forzado.
  - `contacts`, `product_embeddings` y `contact_memories` particionadas por `client_id`.
  - Presupuesto de particiones = 300 por celda de 100 inquilinos (<< 10.000 límite).
  - Verificación: `design.md` §6 contiene la tabla de estrategia, el presupuesto, las funciones DDL de creación de las 3 particiones y la justificación técnica de no particionar `products`.

- [x] **T-07 · Diseñar pgvector, halfvec(1536) y memoria de contactos**
  - Estandarización de `halfvec(1536)` y operador `halfvec_cosine_ops` para ahorro del 50% de RAM en HNSW.
  - Diseño de perfilamiento (`profile` 1:1) y memoria episódica (`episode` 1:N) en `contact_memories`.
  - Flujo asíncrono de consolidación y consulta RAG híbrida (`UNION ALL`).
  - Verificación: `design.md` §6.6, §6.7 y §7 contienen el DDL, la consulta RAG híbrida y la estimación de memoria.

- [x] **T-08 · Diseñar la operación**
  - Backup, observabilidad, disparadores de escalado, migración, perfiles y secretos.
  - Verificación: `design.md` §8 y §9 contienen las tablas de perfiles, métricas, backup y el protocolo de migración.

- [x] **T-09 · Fijar la compatibilidad PostgreSQL 18 y el límite de N8N**
  - PostgreSQL 18 + pgvector en todas las instancias, incluida Chatwoot.
  - Chatwoot 4.19.1, Redis 7+ y Sidekiq.
  - N8N fuera de alcance.
  - Verificación: `requirements.md` RF-01, RF-11 y `design.md` §10 registran la decisión y el laboratorio validado de Chatwoot sobre PostgreSQL 18.

- [x] **T-10 · Verificar coherencia con ADM-001, AUTH-001 y CHW-001**
  - Listar las enmiendas pendientes y las decisiones que DAT-001 consume.
  - Verificación: `design.md` §11 contiene la tabla de alineación con las tres especificaciones.

- [x] **T-11 · [HUMANO] Aprobar DAT-001**
  - Revisar `requirements.md`, `design.md` y `tasks.md`.
  - Cambiar el estado de `requirements.md` de `Borrador` a `Aprobada`.
  - Verificación: el estado del documento coincide con la decisión humana.

- [x] **T-12 · Alinear ADM-001**
  - RF-05.2 ya coincide: `products` particionada por `client_id`; no requiere enmienda por particionado.
  - RF-04: agregar retención de chat y cuota de almacenamiento.
  - RF-07: agregar el modelo de dos dominios de archivos.
  - RF-10: agregar celdas, enrutamiento, RLS y particionado.
  - Cerrar O-07 con la fórmula de bytes facturados.
  - Abrir O-13 a O-16 según `DAT-001`.
  - Verificación: `ADM-001` referencia `DAT-001` y no contradice `client_id`, `clients.id` ni el particionado híbrido.

- [x] **T-13 · Alinear AUTH-001**
  - A-03: Redis para rate limiting y revocación de sesión; usar el Redis dedicado del plano de control (O-01 resuelta).
  - Identidad en el Router Global con rol dedicado y filtros; RLS solo en tablas de tenencia (O-03 resuelta).
  - Verificación: `AUTH-001` cita `DAT-001` y resuelve A-03 y O-03.

- [x] **T-14 · Alinear CHW-001**
  - Redis 7+, Sidekiq y PostgreSQL 18 validado en laboratorio en el plano de soporte.
  - T-13 de CHW-001 consume `DAT-001`.
  - Verificación: `CHW-001` cita `DAT-001` y no contradice la decisión de PostgreSQL 18 validada en laboratorio.

- [x] **T-15 · Registrar DAT-001, ADM-001, AUTH-001 y CHW-001 en el índice de especificaciones**
  - Agregar las filas en `.agents/AGENTS.md` §6.
  - Verificación: los enlaces apuntan a `docs/specs/<id>/requirements.md` y los estados coinciden con cada documento.

- [x] **T-16 · Alinear AUTH-D-06 y la membresía 1:0..1**
  - Sesión opaca de servidor para el panel; JWT solo para APIs; `users.active_client_id` como guardián global; la cookie solo transporta el `sid`.
  - Verificación: DAT-001 no afirma multipertenencia; RF-04.3 y RF-05.5 distinguen cookie, sesión de servidor y JWT de API.

- [x] **T-17 · Alinear módulo de Comunidades en Control Plane**
  - DDL de `communities` y `community_members` en el plano de control para relacionar transversalmente clientes de distintas celdas.
  - Verificación: `design.md` §3.2 y §3.3 contienen los esquemas DDL y las restricciones de integridad referencial física a `clients(id)`.

- [x] **T-18 · Formalizar el Verification Gate de aislamiento RLS en CI/CD**
  - Definir la prueba automatizada de intrusión cruzada (`cross-tenant intrusion test`) con rol de aplicación `mocter_app`.
  - Verificación: `design.md` §6.9 y `requirements.md` CA-29 documentan el paso obligatorio en el pipeline de CI/CD.

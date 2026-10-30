# Plan Maestro de Implementación Secuencial por Fases (Mocter Core)

## Resumen Ejecutivo
Plan estratégico de codificación modular dividido en **5 fases secuenciales de implementación**, precedidas por un **Gate 0 de preparación**, bajo la metodología **Spec-Driven Development (SDD)** y la Constitución del Proyecto ([`AGENTS.md`](file:///d:/DataDev/1.%20Proyectos%20Dev/landig-agencia/.agents/AGENTS.md)). Gate 0 alinea las decisiones y dependencias documentales y verifica los prerrequisitos operativos de autenticación; cada fase de implementación culmina en una **Compuerta de Verificación Automatizada (Verification Gate)** que debe superarse antes de iniciar la siguiente.

> [!NOTE]
> **Estado de la Hoja de Ruta:** La implementación está autorizada y se ejecutará de forma incremental. **Gate 0 está en curso; la Fase 1 de código no comienza hasta validar los Compose, el Redis privado y la evidencia de respaldo/restore requerida por AUTH-001.**

---

## 1. Topología de Infraestructura y Diferenciación de Ambientes

El sistema Mocter opera en contenedores **Docker con Docker Compose**, aplicando una separación clara por ambiente:

1. **Desarrollo Local:**
   - **No se utiliza Traefik en desarrollo local.** La aplicación corre mediante `docker-compose.yml` y publica solo en `127.0.0.1` (loopback), nunca en `0.0.0.0`. Los servicios de plataforma ya aprovisionados se consumen en las direcciones que defina el entorno local; como referencia: SeaweedFS `:8333`/`:8888`, imgproxy `:8080` y Chatwoot `:3001`.
2. **Ambientes de Pruebas (Staging) y Producción:**
   - **Traefik v2.11** actúa como reverse proxy único para todo el tráfico público (HTTP, HTTPS, WebSockets).
   - En staging/producción, ningún contenedor publica puertos directamente en el host (cumplimiento estricto de `R-10`); en desarrollo local solo se publican en `127.0.0.1`.
   - **Chatwoot (`chatwoot/chatwoot:v4.19.1`):** Corre en contenedor administrado por Traefik, accediendo a PostgreSQL 18 con pgvector y Redis 7+ en el plano de soporte (`CHW-001`).
   - **SeaweedFS v4.51:** servicio de plataforma **ya aprovisionado** en desarrollo, pruebas y producción; S3 **interno**, sin ruta pública, para la gestión y deduplicación de archivos multimedia de inquilinos (`ADM-001`, `OPS-001`).
   - **imgproxy v4.0.20:** servicio de plataforma **ya aprovisionado** en `media.mocter.co`; entrega imágenes con resize/WebP/AVIF y URLs firmadas HMAC. SeaweedFS no se expone.
   - **Chatwoot, SeaweedFS e imgproxy no se despliegan en este plan:** los contenedores ya existen en los tres ambientes. La documentación define cómo se consumen, no cómo se provisionan. El estado observado de producción está en [`docs/reference/production-services.md`](reference/production-services.md).
    - **RabbitMQ (`rabbitmq:3.13-management`):** Cola interna para notificaciones (`NTF-001`), sin puertos públicos ni router de Traefik; credenciales en secrets y healthcheck para OPS-001.
    - **Redis de control (`redis:8.8.4-alpine`):** servicio `redis-control` definido en Compose local, staging y producción; autenticado, interno y efímero. No se comparte con el Redis de Chatwoot.
   - **Mocter Web (`ghcr.io/enuarrosales/mocter-web`):** Contenedor único para la aplicación Next.js 16 App Router y el migrador Drizzle en modo standalone sobre Node.js 24 Alpine.

---

## 2. Mapa de Dependencias y Fases

```mermaid
flowchart TD
    subgraph INFRA ["Servicios de plataforma ya aprovisionados"]
        INFRA_TRAEFIK["Traefik (Reverse Proxy en Pruebas y Prod)"]
        INFRA_CHW["Chatwoot v4.19.1 (servicio de plataforma)"]
        INFRA_FS["SeaweedFS v4.51 (servicio de plataforma, S3 interno)"]
        INFRA_IMG["imgproxy v4.0.20 (servicio de plataforma, media.mocter.co)"]
        INFRA_TRAEFIK --> INFRA_CHW
        INFRA_TRAEFIK --> INFRA_IMG
        INFRA_IMG --> INFRA_FS
    end

    subgraph FASE0 ["Gate 0: Preparación y consistencia SDD"]
        F0_GATE["Decisiones, propiedad de users, dependencias, Redis y respaldo Router"]
    end

    subgraph FASE1 ["Fase 1: Cimientos y entrada pública"]
        F1_ADM["ADM-001: shell de apps/admin (T-02)"]
        F1_DAT["DAT-001 + ADM T-03/T-04: schemas, roles, plans y users base"]
        F1_AUTH["AUTH-001: Auth híbrida y OAuth parametrizable"]
        F1_DSN["DSN-001: tokens base"]
        F1_LND["LND-001 slice: landing, header, #planes, /login y /register?plan_code (sin T-08)"]
        F1_ADM --> F1_DAT
        F1_DAT --> F1_AUTH
        F1_AUTH --> F1_LND
        F1_DSN --> F1_LND
    end

    subgraph FASE2 ["Fase 2: Chatwoot base, núcleo administrativo y notificaciones"]
        F2_CHW["CHW-001 base: integración, API, account/inbox"]
        F2_ADM["ADM-001: integración de identidad/clientes, onboarding, producto demo y webchat"]
        F2_DSN["DSN-001: componentes y vistas base"]
        F2_NTF["NTF-001: remitentes, plantillas, outbox y admin"]
        F2_CHW --> F2_ADM
        F2_DSN --> F2_ADM
        F2_ADM -->|tenant.welcome / community.*| F2_NTF
    end

    subgraph FASE3 ["Fase 3: Chatwoot avanzado y CRM"]
        F3_CHW["CHW-001 avanzado: iframe same-site y SSO"]
        F3_CRM["CRM-001: prospectos, consentimiento y Habeas Data"]
        F3_CHW --> F3_CRM
    end

    subgraph FASE4 ["Fase 4: IA y pedidos"]
        F4_BOT["BOT-001/002: BYOK, prompts y contrato registrar_pedido"]
        F4_ORD["ORD-001: estados, idempotencia y fulfillment"]
        F4_AI["AI-001: asistente en textareas"]
        F4_BOT --> F4_ORD
        F4_BOT --> F4_AI
    end

    subgraph FASE5 ["Fase 5: Monetización, analítica y resiliencia"]
        F5_BILL["BILL-001: suscripciones, pagos, comprobantes y créditos"]
        F5_REP["REP-001: dashboards en caliente"]
        F5_REF["REF-001: créditos de referidos"]
        F5_OPS["OPS-001: backups R2, SeaweedFS y observabilidad"]
        F5_LND["LND-001: vista de upgrade"]
        F5_BILL --> F5_REP
        F5_BILL --> F5_REF
        F5_REP --> F5_OPS
        F5_BILL --> F5_LND
    end

    F0_GATE -->|Gate 0| F1_ADM
    F1_AUTH -->|identidad base| F2_ADM
    F1_LND -->|Gate 1| F2_CHW
    F2_ADM -->|Gate 2| F3_CHW
    F3_CRM -->|Gate 3| F4_BOT
    F4_ORD -->|Gate 4| F5_BILL
    F5_OPS -->|Gate 5| SistemaCompletado["Sistema Mocter Operativo en Producción"]
```

### Gate 0 · Preparación de implementación (no es una fase de código)

**Objetivo:** cerrar las contradicciones de secuencia y contrato antes de ejecutar las tareas que dependen de ellas. Gate 0 actualiza la documentación y define el servicio Redis en Compose; no inicia servicios ni modifica producción.

- **Dominio Chatwoot:** CHW-001 O-05 queda cerrada: `mocter-core` es un módulo de dominio dentro de `mocter-admin`, con la misma persistencia, según ADM-001 D-24 y CHW-001 D-12.
- **Propiedad del esquema de usuarios:** ADM-001 crea la fila canónica de `users` y es dueño de `active_client_id`; AUTH-001 añade los campos y tablas de autenticación. La FK `active_client_id → clients(id)` se agrega cuando ADM-001 T-06 crea `clients`.
- **Secuencia AUTH/ADM:** ADM-001 T-02/T-03/T-04 prepara la app, el schema/roles y las líneas de migración. AUTH puede iniciar con esa base y el preflight operativo. ADM-001 T-05/T-06 y el onboarding se integran después de que AUTH provea login/sesión; no son prerrequisitos para iniciar AUTH.
- **Prerrequisitos operativos:** Redis de control se define como `redis-control` con imagen `redis:8.8.4-alpine` en los tres Compose, red interna, `REDIS_PASSWORD` propio, healthcheck y sin persistencia; Chatwoot conserva su Redis independiente. OPS-001 monitorea, no provisiona Redis. Antes de ejecutar AUTH-001 T-01 deben validarse los Compose y registrarse la disponibilidad del servicio y la evidencia de respaldo/restore del Router (OPS-001 T-05 a T-10 y T-12). Si falta alguno, AUTH queda bloqueada; este plan no autoriza acceso remoto ni cambios de infraestructura.
- **Toolchain local:** pnpm/Turbo se ejecutan dentro de `web-portal` mediante Corepack; no se instala pnpm en el host. Los comandos de verificación local usan `docker compose exec`/`run`.
- **Calidad por fase:** antes de congelar cada fase, sus specs deben tener RNF medibles, criterios BDD verificables y requisitos de i18n completos. Las brechas detectadas en ADM, AUTH, BOT-001, CRM, OPS, CHW, AI, REF y NTF se cierran en el gate de la fase correspondiente.
- **LND-001:** T-01 a T-07 y T-09 cubren la entrada pública de Fase 1; T-08 (upgrade) queda en Fase 5, después de BILL-001.

**Criterio de salida:** las decisiones y tareas de esta sección están reflejadas de forma consistente en requirements/design/tasks; además, AUTH-001 T-01 cuenta con evidencia de Redis y respaldo/restore. La alineación documental de esta actualización no sustituye esa evidencia operativa.

---

## 3. Detalle de Fases de Codificación

### Fase 1 · Cimientos y entrada pública (`DAT-001` + ADM-001 base + `AUTH-001` + `LND-001` slice + `DSN-001` base)

> **Objetivo:** Persistencia multi-inquilino, autenticación híbrida, catálogo canónico de planes y la porción pública de la landing: header, `#planes`, login y registro con `plan_code`.

#### 1.0 Base de la aplicación administrativa (ADM-001 T-02)
- Crear `apps/admin` y su paquete de monorepo (T-02), sin adelantar el onboarding de Fase 2.

#### 1.1 Persistencia y Esquemas Drizzle (`packages/domain`)
- Aplicar DAT-001 antes de crear los schemas/roles y la fila base canónica `users` de ADM-001 T-03; definir las dos líneas independientes de migración en ADM-001 T-04:
  - `packages/domain/drizzle/` (`drizzle.config.ts`, `--target=control-plane`): Router Global.
  - `packages/domain/drizzle-cell/` (`drizzle.cell.config.ts`, `--target=cell`): Celdas de datos (`pg-cell-XX`).
- Reestructurar `packages/domain/src/db/`:
  - `schemas/admin/`: Router Global (`cells`, `clients`, `client_routing`, `plans`, `client_plans`, `users`, `identities`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `user_consents`, `auth_providers_config`). Los secretos TOTP viven como columnas cifradas AES-256-GCM en `users` (`AUTH-D-04`).
  - `schemas/tenant/`: celda (`admin.users` y `admin.identities` con PK compuesta `(client_id, id)` + `FORCE ROW LEVEL SECURITY`, y en fases siguientes `tenant_users`, `products`, `product_embeddings`, `contacts`, `contact_memories`, `orders`). Los preregistros permanecen en staging en el Router sin tocar celdas hasta finalizar el onboarding (con depuración automática a los 60 días si no se materializan).
  - `schemas/public/`: `leads`.
- Modelo canónico de `plans`: `id uuid`, `code` único, `name`/`description`/`marketing_features` JSONB `{es,en}`, `status` (`draft`/`active`/`retired`), `is_public`, `is_popular`, `sort_order`, `trial_days`, `grace_days`, `billing_cycles`, `price_monthly_cents`, `price_annual_cents`, `currency`. FKs `plan_id` uuid.
- Generar y verificar la migración fundacional (`pnpm --filter @mocter/domain db:generate`).

#### 1.2 Autenticación híbrida (`apps/web` & `packages/domain`)
- Registro/login nativo con Argon2id y política de complejidad.
- Cookie `__Host-mocter_sid` (`HttpOnly`, `Secure`, `SameSite=Strict`), hash SHA-256 en BD y middleware en Next.js.
- OAuth parametrizable desde la SaaS (`auth_providers_config`, `AUTH-D-08`), 2FA TOTP opcional y roles/scopes `D-31`.

#### 1.3 Landing y registro (`LND-001` slice + DSN base)
- Header con botón «Iniciar sesión» contiguo a «Solicitar demo».
- Sección `#planes` solo si `plans.status = 'active' AND plans.is_public = true`; usa `plan.code` y `marketing_features[locale]`.
- `/[locale]/login` y `/[locale]/register?plan_code=...`: el registro crea el usuario y conserva `plan_code` para el onboarding; no crea inquilino.
- DSN base: tokens, tipografía y componentes mínimos para las vistas públicas.
- La vista de **upgrade** de LND-001 no entra en esta fase; se implementa en Fase 5 con BILL-001.

> [!IMPORTANT]
> **Compuerta 1:**
> - La fila base `users` y los roles/schema de administración pertenecen a ADM-001; AUTH-001 no duplica su creación.
> - `drizzle-kit check` y migración fundacional pasan.
> - Tests de auth (Argon2id, sesión, tokens, TOTP, OAuth dinámico).
> - `#planes` aparece/desaparece según `status` + `is_public`; el CTA usa `plan_code`.
> - `/login` ↔ `/register` conservan `plan_code`; el registro no crea inquilino.
> - Tokens base pasan AA en claro/oscuro.

---

### Fase 2 · Chatwoot base, núcleo administrativo y notificaciones (`CHW-001` base + `ADM-001` + `DSN-001` + `NTF-001`)

> **Objetivo:** Integrar Chatwoot y completar `mocter-admin`: resolución del ancla de identidad, creación de inquilino, onboarding con `plan_code`, roles, producto demo, multimedia y webchat activo.

#### 2.1 Chatwoot base (`CHW-001`)
- Servicio Chatwoot v4.19.1 ya aprovisionado; la fase integra su API y SSO.
- Adaptador de API: creación de cuenta, inbox webchat y token de servicio por inquilino.
- Correlación `client_id` ↔ `chatwoot_account_id` con idempotencia y reintentos.
- El iframe same-site y el SSO se completan en Fase 3; el webchat puede operar sin la bandeja embebida.

#### 2.2 Sistema de diseño y shell (`DSN-001`)
- Tokens HUD, componentes base accesibles, tablas con paginación/filtros/orden, tema sistema con fallback oscuro.
- Catálogo interno `/design-system`.

#### 2.3 Consola administrativa y onboarding (`ADM-001`)
- Layout, navegación y RBAC `D-31`.
- Completar ADM-001 T-05/T-06 después de AUTH: el login resuelve el ancla; al crear `clients`, se agrega la FK de `users.active_client_id`.
- `mocter-core` vive como módulo de dominio dentro de `mocter-admin`; no agrega un servicio ni una base independientes.
- Onboarding: recibe `plan_code`, resuelve `plans.code` → `plans.id`, crea `client`, `tenant_owner`, asigna plan y enruta a celda.
- Producto demo, catálogo multimedia usando SeaweedFS v4.51 + imgproxy v4.0.20 ya aprovisionados, deduplicación, cuota y entrega con URLs firmadas.
- Pre-activación del webchat; `lifecycle_status` del inquilino.
- Si el usuario abandona, conserva avance y `plan_code` para retomar sin inquilino vacío.
- Bandeja `/admin/leads` para `platform_sales` con la tabla `leads` y gestión de estados/notas/asignación (ADM-001 RF-16).

#### 2.4 Notificaciones y plantillas (`NTF-001`)
- Remitentes múltiples y proveedor SMTP; plantillas TipTap versionadas por evento/locale.
- Catálogo de eventos: bienvenida, comunidad, auth (migrado desde AUTH), y base para BILL/REF.
- **Outbox transaccional + RabbitMQ + worker independiente**: `enqueueEmail` no espera la cola ni el SMTP; si RabbitMQ/proveedor falla, el negocio continúa y el outbox se publica al recuperarse.
- Reintentos con DLQ, log de entregas y administración en `/admin/settings/notifications`.

> [!IMPORTANT]
> **Compuerta 2:**
> - Onboarding funcional de punta a punta: usuario → inquilino → plan UUID → webchat activo.
> - Cuenta e inbox de Chatwoot creados y correlacionados; reintento idempotente.
> - Producto demo, multimedia deduplicada y RBAC/auditoría.
> - imgproxy sirve imágenes solo con URL firmada y bucket `media`; el gateway S3 responde 403 sin credenciales y no se expone a Internet.
> - Correo de bienvenida enviado una sola vez; plantillas/remitentes administrables y entrega registrada.
> - **RabbitMQ caído no bloquea el onboarding**: el alta termina, el outbox queda pendiente y se publica al recuperarse.
> - Objetivo de 5 minutos medido y reportado; **no es un SLA duro** (ADM-001 RF-14.8).

---

### Fase 3 · Chatwoot avanzado y CRM (`CHW-001` avanzado + `CRM-001`)

> **Objetivo:** Completar la bandeja embebida y el maestro de prospectos con Habeas Data.

#### 3.1 Chatwoot avanzado (`CHW-001`)
- Iframe same-site en `mocter-admin` (`ADM-001` D-32).
- SSO embebido (`/auth/chatwoot/embed`), cookies same-site y validación de framing.
- Webhooks de mensajes/contactos con idempotencia.

#### 3.2 CRM (`CRM-001`)
- `prospects` y `prospect_consents`; dos propósitos (`data_treatment`, `commercial_comms`).
- Aviso de privacidad versionado y editable; captura por botones interactivos + enlace.
- Derecho al olvido/anonimización y proyección a Chatwoot.

> [!IMPORTANT]
> **Compuerta 3:**
> - Iframe/SSO validados en laboratorio contra la versión canónica de Chatwoot.
> - Webhooks idempotentes; consentimiento y anonimización probados.

---

### Fase 4 · IA y pedidos (`BOT-001` + `BOT-002` + `ORD-001` + `AI-001`)

> **Objetivo:** Activar el bot, el motor de prompts, la captura de pedidos y la asistencia AI.

#### 4.1 Contrato primero (`BOT-002` ↔ `ORD-001`)
- Definir `registrar_pedido`: payload, idempotencia por conversación, estados y errores.
- ORD y BOT-002 se implementan como una unidad; no se avanza uno sin el contrato.

#### 4.2 Bot y prompts (`BOT-001` + `BOT-002`)
- BYOK, catálogo de proveedores/modelos, prompts en runtime, timeout 10 s y fallback a humano.
- Billetera/spread como fundaciones activables por fases.

#### 4.3 Pedidos (`ORD-001`)
- `orders`, `order_items`, `order_events`, estados, idempotencia, fulfillment manual y devoluciones.

#### 4.4 Asistente AI (`AI-001`)
- `AiEnhanceTextarea`, modelo propio configurable y consumo en la billetera compartida.

> [!IMPORTANT]
> **Compuerta 4:**
> - Contrato `registrar_pedido` probado con reintentos y sin duplicados.
> - Timeout/fallback del bot y flujo de pedidos completo.
> - Asistente AI en los textareas priorizados.

---

### Fase 5 · Monetización, analítica y resiliencia (`BILL-001` + `REP-001` + `REF-001` + `OPS-001` + `LND-001` upgrade)

> **Objetivo:** Cerrar el ciclo comercial y operativo.

#### 5.1 Facturación (`BILL-001`)
- Wompi + Stripe, suscripciones, facturas, pagos, comprobantes y dunning.
- Créditos de referidos: `credit_cents`, aplicación a la próxima factura y CA-BILL-06.
- Prorrateo de cambios de plan y métodos de pago tokenizados.
- Emite `billing.payment_succeeded`, `billing.payment_failed` y `billing.renewal` a NTF-001.

#### 5.2 Informes (`REP-001`)
- Cálculo en caliente, 7 períodos, exportación Excel/PDF y roles D-31; consume BILL/ORD.

#### 5.3 Referidos (`REF-001`)
- Modelo A unilateral, recompensa fija/porcentual configurable, crédito único, 365 días, tope opcional y toggle.
- Emite `referral.registered` a NTF-001.

#### 5.4 Operación (`OPS-001`)
- Backups R2 (full semanal + diff diario), SeaweedFS, adjuntos de Chatwoot (volumen local o bucket), logs 14 días, sin WORM, operador único.

#### 5.5 Upgrade de landing (`LND-001`)
- Vista de suscripción/upgrade en `mocter-admin` enlazada a BILL-001.

> [!IMPORTANT]
> **Compuerta 5:**
> - Webhooks Wompi/Stripe, comprobante y crédito aplicado.
> - REP P95 ≤ 800 ms y exportaciones válidas.
> - REF: crédito único, vencimiento y toggle.
> - OPS: restore de PostgreSQL, SeaweedFS y adjuntos de Chatwoot probado.

---

## 4. Estado de Preparación

El plan ya no declara un “100% blindado”. Estado real:

- **Decisiones:** 29/29 cerradas (REF, BOT, OPS, CRM, DSN, AI).
- **Modelo de planes:** canónico aprobado (UUID + `code`, JSONB i18n, `status`, precios mensual/anual, `marketing_features` separado).
- **Fases:** revisadas para corregir LND→ADM/BILL/DSN, ADM→CHW, ORD→REP, BILL↔REP y BOT-002↔ORD.
- **Handoff:** `/register?plan_code` → onboarding ADM con resolución a `plans.id` (UUID).
- **Bloqueantes resueltos:** modelo de `plans`, orden de fases, `payment_methods`/prorrateo, `tenant_admin`, Chatwoot 4.19.1, topología dev/Traefik y BOT-002/ORD-001.
- **Nuevo alcance:** NTF-001 (remitentes, plantillas, eventos y entregas) y bandeja de leads de la landing en ADM-001.
- **Pendiente:** evidencia de Redis en staging/producción y respaldo/restore del Router para AUTH-001; cerrar las brechas RNF/BDD/i18n de cada spec antes del gate de su fase.
- **Implementación de código:** autorizada; el inicio de Fase 1 queda condicionado al criterio de salida de Gate 0.

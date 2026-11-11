# CHW-002 · Requisitos · Estabilización de la Interoperabilidad Chatwoot–Mocter

| Atributo | Valor |
|---|---|
| ID | CHW-002 |
| Versión | 1.0 |
| Estado | Aprobada (Fase de Planeamiento `/grill-me`) |
| Fecha | 2026-11-10 |
| Documentos | `requirements.md` (este) · [`design.md`](design.md) · [`tasks.md`](tasks.md) |
| Depende de | [CHW-001](../chw-001-inventario-chatwoot/requirements.md) · [ADM-001](../adm-001-mocter-admin/requirements.md) · [TNT-001](../tnt-001-entorno-operativo-inquilino/requirements.md) · [AUTH-001](../auth-001-autenticacion-hibrida/requirements.md) · [DAT-001](../dat-001-arquitectura-datos-multiinquilino/requirements.md) |
| Directivas | `.agents/AGENTS.md` · `.agents/rules/rules-for-environment-and-traefik-compatibility.md` · `.agents/rules/rules-for-custom-confirmation-modals-no-native-dialogs.md` · `.agents/rules/rules-for-logging-core-and-server.md` |

---

## 1. Propósito y Motivación

La especificación [CHW-001](../chw-001-inventario-chatwoot/requirements.md) definió el inventario técnico de Chatwoot Community `v4.19.1` como referencia de lectura, mientras que [ADM-001](../adm-001-mocter-admin/requirements.md) y [TNT-001](../tnt-001-entorno-operativo-inquilino/requirements.md) plantearon el aprovisionamiento de cuentas y el acceso embebido en iframe same-site.

No obstante, durante la auditoría de laboratorio y pruebas en caliente sobre el Backoffice SaaS (`apps/admin`) y los contenedores de soporte, se identificaron **cinco brechas estructurales** que bloquean la comunicación efectiva con Chatwoot y provocan que los nuevos inquilinos no se materialicen en dicha plataforma:

1. **Condición fantasma en el disparador (`plan.chatwootEnabled` inexistente):**
   El servicio de dominio `provisionTenantChatwootAccount` evalúa `if (!plan.chatwootEnabled) return ok({ skipped: true });`. Sin embargo, la tabla `admin.plans` no contiene la columna `chatwoot_enabled` (la habilitación se calcula dinámicamente según límites de agentes o capacidades activas). Como consecuencia, la condición siempre evalúa a `true` (skip) y ningún inquilino es enviado a aprovisionamiento en Chatwoot.
2. **Topología de red Docker desacoplada y colisión de loopback:**
   El contenedor `admin-portal` se ejecuta en la red `mocter-core_default` con `CHATWOOT_BASE_URL=http://localhost:3000`. Dentro del contenedor de Next.js, `localhost:3000` apunta al propio contenedor (donde nada escucha en el puerto 3000, pues corre en el 3003) en lugar de alcanzar el servicio `chatwoot-rails`. En producción, el tráfico externo se gestiona por Traefik v2.11 (`chat.mocter.co`), por lo que no existe un contrato de red unificado entre llamadas servidor-a-servidor y la renderización en navegador.
3. **Credenciales maestras de plataforma no propagadas (`CHATWOOT_PLATFORM_TOKEN`):**
   `ChatwootHttpPlatformGateway` exige un token maestro de Platform App para crear cuentas y usuarios (`/platform/api/v1/*`). Dicha variable no se encuentra inyectada en el bloque `environment` de `admin-portal` en `docker-compose.yml`, ni documentada con valor operativo en los entornos locales.
4. **Disparador ausente en el Alta Autónoma (`/onboarding`):**
   El asistente unificado de onboarding de TNT-001 crea el inquilino en el Paso 1 (`lifecycle_status = 'alta'`) y activa su entorno en el Paso 3 (`lifecycle_status = 'activo'`), pero en ningún momento invoca el aprovisionamiento de Chatwoot, limitando el intento de creación exclusivamente al alta manual en `/admin/tenants`.
5. **Ruta de Embed y SSO inexistente en `apps/admin` (404 en `/workspace/conversations`):**
   La vista operativa del inquilino carga un iframe hacia `/api/auth/chatwoot/embed`. Dicha ruta solo existe en `apps/web` (puerto 3001) y no en `apps/admin` (puerto 3003). Por su parte, la vista del Platform Owner (`/admin/conversations`) incrusta la URL directa de Chatwoot sin sesión autenticada, provocando pantallas de login o bloqueos por cookies de terceros en navegadores modernos.

Esta especificación **CHW-002** formaliza la estabilización integral de la interoperabilidad entre Chatwoot y Mocter, cerrando estas brechas tanto en el **Backoffice Administrativo SaaS** (`/admin/*`) como en el **Backoffice Operativo del Inquilino** (`/workspace/*`).

---

## 2. Alcance

### Incluye

- **Aprovisionamiento automatizado resiliente (Fail-soft):** Disparo de aprovisionamiento en Alta Manual (`createAdminTenant`) y en Alta Autónoma (Paso 1 de `/onboarding`). Persistencia de estado (`pending`, `provisioning`, `active`, `failed`) y último error en `admin.chatwoot_accounts`.
- **Paquete operativo completo en Chatwoot:** Creación de cuenta, usuario técnico de servicio con token cifrado (AES-256-GCM), bandeja Webchat inicial, siembra de las 4 etiquetas reservadas en Chatwoot y registro automático del webhook multicanal hacia `/api/webhooks/chatwoot`.
- **Contrato de red dual tipado en `env.ts`:** `CHATWOOT_INTERNAL_URL` para comunicaciones backend servidor-a-servidor y `NEXT_PUBLIC_CHATWOOT_URL` para navegación cliente/iframe vía Traefik/DNS público, eliminando puertos fijos y garantizando compatibilidad con navegadores modernos (same-site cookies, partitioning CHIPS, CSP `frame-ancestors`).
- **SSO nativo transparente para el inquilino (`/workspace/conversations`):** Implementación de la ruta server-side `/api/auth/chatwoot/embed` en `apps/admin` utilizando el endpoint canónico de Chatwoot Platform API (`GET /platform/api/v1/users/:id/login`), emitiendo URLs de un solo uso (5 minutos) vinculadas a la cuenta del inquilino sin exposición cross-tenant.
- **Acceso del Platform Owner a la consola global (`/admin/conversations`):** Aprovisionamiento y SSO transparente como Super Admin hacia `/super_admin` o la cuenta maestra, y acción manual de inspección/auditoría por inquilino en `/admin/tenants/[id]`.
- **Acción manual de aprovisionamiento en UI:** Botón contextual en `/admin/tenants/[id]` para aprovisionar o reintentar la sincronización de inquilinos existentes (como `Synergia Market`) o con estado `failed`.
- **Transferencia autoritativa de capacidades del plan:** Mocter como fuente de verdad de límites y las 42 capacidades comerciales, reflejadas atómicamente en los flags de la cuenta de Chatwoot para ocultar menús no contratados.

### Excluye

- Modificar el código fuente de Chatwoot Community, su esquema interno o sus migraciones Rails (`AGENTS.md` R-02, CHW-001).
- Utilizar librerías o dependencias de Chatwoot Enterprise (`AGENTS.md` R-02, CHW-001 RF-06).
- Alterar las reglas de balanceo o nombres de servicios de producción en Traefik (`AGENTS.md` R-03).
- Ejecutar migraciones destructivas o modificar tablas fuera del esquema `admin` de Mocter.

---

## 3. Actores y Roles

| Actor | Rol en Mocter | Permisos e Interacción con Chatwoot |
|---|---|---|
| **Platform Owner / Admin SaaS** | `platform_owner`, `platform_admin` | Accede a `/admin/conversations` con sesión Super Admin global de Chatwoot; gestiona cuentas e inspecciona bandejas de inquilinos en `/admin/tenants/[id]`. |
| **Tenant Owner** | `tenant_owner` | Accede a `/workspace/conversations` embebido vía SSO como administrador exclusivo de su cuenta de Chatwoot; opera canales y agentes contratados. |
| **Tenant Agent** | `tenant_agent` | Accede a `/workspace/conversations` embebido vía SSO con rol `agent` en la cuenta de su inquilino, restringido a bandejas autorizadas. |
| **Servicio de Dominio Mocter** | `system` (Backend) | Utiliza `CHATWOOT_PLATFORM_TOKEN` sobre `CHATWOOT_INTERNAL_URL` para aprovisionar cuentas, usuarios, webhooks y sincronizar capacidades del plan. |

---

## 4. Requisitos Funcionales

### CHW-RF-01 · Aprovisionamiento Automatizado y Resiliencia en Altas (Fail-Soft)

| ID | Requisito |
|---|---|
| **CHW-RF-01.1** | El cálculo de habilitación de atención (`chatwootEnabled`) debe basarse en el estado efectivo del plan: si posee cuota para la dimensión `chatwoot_agents` (`mode = 'UNLIMITED'` o `value > 0`) o si incluye capacidades activas del catálogo de atención. Queda prohibido depender de una columna inexistente en `admin.plans`. |
| **CHW-RF-01.2** | En **Alta Manual (`/admin/tenants`)**, `createAdminTenant` ejecuta síncronamente el aprovisionamiento de Chatwoot cuando el plan seleccionado lo tiene habilitado. |
| **CHW-RF-01.3** | En **Alta Autónoma (`/onboarding`)**, la confirmación del Paso 1 (que persiste `admin.clients` y `admin.client_plans`) ejecuta síncronamente el aprovisionamiento de Chatwoot cuando el plan lo tiene habilitado. |
| **CHW-RF-01.4** | **Filosofía Fail-Soft:** Si la instancia de Chatwoot no responde, arroja error de red o timeout, el alta del inquilino en Mocter **no se revierte ni bloquea el proceso**. La fila en `admin.chatwoot_accounts` se persiste en estado `state = 'failed'` con el detalle descriptivo del error en `last_error`. |
| **CHW-RF-01.5** | En la vista de detalle del inquilino en el Backoffice SaaS (`/admin/tenants/[id]`), se debe presentar el estado de la integración de Chatwoot (`Pendiente`, `Aprovisionando`, `Activo`, `Fallido`) y un botón de acción para **«Aprovisionar en Chatwoot»** o **«Reintentar Aprovisionamiento»**. |

---

### CHW-RF-02 · Paquete Operativo Completo en Chatwoot

| ID | Requisito |
|---|---|
| **CHW-RF-02.1** | **Creación de Cuenta:** Se envía `POST /platform/api/v1/accounts` con `name`, `locale` (`es` o `en`), y los mapas de `features` y `limits` autorizados por el plan. |
| **CHW-RF-02.2** | **Usuario Técnico de Servicio:** Se crea un usuario `service-{clientId}@mocter.internal` vía `POST /platform/api/v1/users`, se vincula a la cuenta con rol `administrator` en `POST /platform/api/v1/accounts/:id/account_users` y se genera su token personal en `POST /platform/api/v1/users/:id/token`. |
| **CHW-RF-02.3** | **Cifrado de Credenciales:** El token de acceso del usuario técnico se cifra en reposo con algoritmo **AES-256-GCM** autenticado con AAD (`client_id`) antes de persistirse en `admin.chatwoot_accounts.service_token_ciphertext`. |
| **CHW-RF-02.4** | **Bandeja Webchat Inicial:** Utilizando el token de servicio, se crea la bandeja de atención web por defecto mediante `POST /api/v1/accounts/:id/inboxes` (`channel.type = 'web_widget'`), guardando el `inbox_id` y `website_token` resultantes. |
| **CHW-RF-02.5** | **Siembra de Etiquetas Comerciales:** Se crean en Chatwoot (`POST /api/v1/accounts/:id/labels`) las 4 etiquetas predeterminadas de Mocter: `lead-frio`, `lead-tibio`, `lead-caliente` y `compra-realizada`, reflejándolas en `admin.tenant_labels`. |
| **CHW-RF-02.6** | **Registro Automático de Webhook:** Se registra en Chatwoot (`POST /api/v1/accounts/:id/webhooks`) la URL de notificación hacia `mocter-admin` (`/api/webhooks/chatwoot`) suscrita a eventos de mensajes y contactos, permitiendo la ingesta en el CRM celular. |

---

### CHW-RF-03 · Contrato de Red Dual y Topología de Entorno

| ID | Requisito |
|---|---|
| **CHW-RF-03.1** | El archivo centralizado de entorno (`env.ts`) debe tipar y validar mediante Zod dos variables diferenciadas: `CHATWOOT_INTERNAL_URL` (servidor-a-servidor) y `NEXT_PUBLIC_CHATWOOT_URL` (cliente/iframe). |
| **CHW-RF-03.2** | En desarrollo local (`docker-compose.yml`), los contenedores de `mocter-core` y `mocter-chatwoot` deben compartir una red Docker común o conectarse mediante DNS resoluble (`http://mocter-chatwoot-rails-1:3000` o `http://host.docker.internal:3000`), mientras que el navegador utiliza `http://localhost:3000`. |
| **CHW-RF-03.3** | En producción (`docker-compose.prod.yml`), `CHATWOOT_INTERNAL_URL` se resuelve a través de la red interna privada de Docker entre contenedores, y `NEXT_PUBLIC_CHATWOOT_URL` apunta al dominio público gobernado por Traefik v2.11 con TLS (`https://chat.mocter.co`). |
| **CHW-RF-03.4** | **Blindaje de Navegadores Modernos:** Chatwoot y Mocter deben compartir el dominio de nivel superior (`mocter.co`), publicándose Chatwoot en `chat.mocter.co` y el portal administrativo en `admin.mocter.co`, garantizando que la cookie de sesión sea Same-Site y no sea bloqueada por particionado CHIPS o políticas de cookies de terceros. |
| **CHW-RF-03.5** | La instancia de Chatwoot debe emitir cabeceras `Content-Security-Policy: frame-ancestors 'self' https://admin.mocter.co http://localhost:3003;` eliminando `X-Frame-Options: DENY` para permitir el embebido legítimo. |

---

### CHW-RF-04 · Acceso Transparente y SSO en el Backoffice del Inquilino (`/workspace/conversations`)

| ID | Requisito |
|---|---|
| **CHW-RF-04.1** | `apps/admin` debe implementar el Route Handler server-side `/api/auth/chatwoot/embed` para servir el túnel seguro de conexión dentro del iframe. |
| **CHW-RF-04.2** | La ruta `/api/auth/chatwoot/embed` valida la sesión activa (`mocter_sid`), comprueba la membresía del usuario en el inquilino activo y verifica que el plan incluya la capacidad `chatwoot_inboxes`. Si la capacidad no está contratada, responde con mensaje amigable invitando a mejorar el plan (S10). |
| **CHW-RF-04.3** | Para autenticar al usuario, `apps/admin` consulta a la Platform API de Chatwoot (`GET /platform/api/v1/users/:user_id/login`) utilizando `CHATWOOT_INTERNAL_URL` y `CHATWOOT_PLATFORM_TOKEN`, obteniendo una URL efímera de un solo uso con `sso_auth_token` (vigencia de 5 minutos). |
| **CHW-RF-04.4** | La URL SSO obtenida se adapta al dominio público del navegador (`NEXT_PUBLIC_CHATWOOT_URL`) y se redirige con código HTTP 307 (o auto-submit limpio) hacia el panel de Chatwoot, iniciando la sesión del usuario de forma inmediata y confinada a su cuenta. |
| **CHW-RF-04.5** | **Gating de UI en Chatwoot:** Al ingresar, Chatwoot presenta únicamente los menús y capacidades autorizadas por el plan del inquilino, habiendo sido sincronizados previamente por Mocter como fuente de verdad. |

---

### CHW-RF-05 · Acceso Administrativo Global y Soporte del Platform Owner (`/admin/*`)

| ID | Requisito |
|---|---|
| **CHW-RF-05.1** | La vista `/admin/conversations` en el Backoffice SaaS debe contar con un usuario maestro con privilegios de `super_admin` en Chatwoot aprovisionado para el Platform Owner. |
| **CHW-RF-05.2** | Al cargar `/admin/conversations`, el Platform Owner se autentica automáticamente vía SSO nativo, presentando pestañas de navegación contextual: *Consola Super Admin Global* (`/super_admin`), *Ajustes de Plataforma* (`/app/accounts/1/settings`) y *Bandeja Maestra* (`/app/accounts/1/inbox`). |
| **CHW-RF-05.3** | En la vista de detalle de cada comercio (`/admin/tenants/[id]`), el Platform Owner dispone de la acción **«Inspeccionar Bandeja de Chatwoot»**, la cual emite un enlace SSO temporal como administrador de la cuenta de ese inquilino específico para labores de soporte técnico y auditoría. |
| **CHW-RF-05.4** | Los inquilinos existentes que no posean cuenta en Chatwoot (como `Synergia Market`) pueden ser aprovisionados por el administrador mediante la acción explícita **«Aprovisionar en Chatwoot»** desde `/admin/tenants/[id]`. |

---

### CHW-RF-06 · Sincronización Dinámica de Planes y Capacidades

| ID | Requisito |
|---|---|
| **CHW-RF-06.1** | Mocter es la única **fuente de verdad** de las condiciones comerciales, cuotas numéricas y capacidades activas. |
| **CHW-RF-06.2** | Cuando un administrador edita un plan en `/admin/plans` o modifica un override de inquilino, el sistema ejecuta `syncAllAccountsForPlan`, mapeando los límites compatibles (`limits.agents`, `limits.inboxes`) y las 42 capacidades comerciales a la Platform API de Chatwoot (`PATCH /platform/api/v1/accounts/:id`). |
| **CHW-RF-06.3** | La reducción de cuotas o desactivación de capacidades en Chatwoot no elimina conversaciones ni datos históricos del inquilino en Chatwoot. |

---

## 5. Requisitos No Funcionales

| ID | Requisito |
|---|---|
| **CHW-RNF-01** | **Seguridad Criptográfica:** Todos los tokens de servicio se cifran con AES-256-GCM y clave derivada de 32 bytes (`CELL_SECRETS_KEY` o `ENCRYPTION_KEY`). Ningún token o secreto de Chatwoot se expone en respuestas HTTP de cara al cliente ni en logs estructurados. |
| **CHW-RNF-02** | **Rendimiento de Handoff:** La generación del enlace SSO y la redirección inicial del iframe en `/api/auth/chatwoot/embed` no debe superar los 500 ms en percentil 95 (P95). |
| **CHW-RNF-03** | **Trazabilidad y Observabilidad Estricta:** Todo evento de aprovisionamiento, sincronización y handoff SSO se emite como evento JSON tipado mediante `appLogger` (`LogEvent`), correlacionado con `requestId` (`x-request-id`) y sin llamadas a `console.*` (`AGENTS.md` §4.13). |
| **CHW-RNF-04** | **Cero Diálogos Nativos:** Toda confirmación destructiva o de reintento en UI utiliza modales accesibles del sistema de diseño Mocter con tokens `--dsn-*` y botones en Title Case (`AGENTS.md` §4.17). |

---

## 6. Criterios de Aceptación

- [ ] **CA-01 (Aprovisionamiento en Alta Manual):** Al crear un inquilino desde `/admin/tenants` con un plan que incluya atención, se registra la cuenta en Chatwoot y la tabla `admin.chatwoot_accounts` queda en estado `active` con `chatwoot_account_id` numérico y `webchat_inbox_id` asignados.
- [ ] **CA-02 (Aprovisionamiento en Alta Autónoma):** Al completar el Paso 1 de `/onboarding` en un registro autónomo con un plan que incluya atención, se dispara y completa el aprovisionamiento en Chatwoot, quedando la cuenta disponible antes de llegar al Paso 3.
- [ ] **CA-03 (Resiliencia Fail-Soft):** Si el servicio de Chatwoot está detenido durante el alta de un inquilino, el comercio se crea exitosamente en Mocter, `admin.chatwoot_accounts.state` queda en `failed` con su `last_error`, y la interfaz muestra el banner con el botón «Reintentar Aprovisionamiento».
- [ ] **CA-04 (Handoff SSO Inquilino en Workspace):** Al navegar a `/workspace/conversations`, el iframe carga exitosamente sin solicitar usuario ni contraseña, autenticado en la cuenta correspondiente del inquilino y ocultando los módulos no autorizados por el plan.
- [ ] **CA-05 (Acceso Platform Owner en Admin):** Al navegar a `/admin/conversations`, el Platform Owner visualiza la consola de Chatwoot con sesión Super Admin activa y puede cambiar entre la vista Super Admin y los ajustes de la cuenta maestra.
- [ ] **CA-06 (Aprovisionamiento Manual de Existentes):** En `/admin/tenants/[id]`, para un inquilino sin cuenta (ej. `Synergia Market`), el botón «Aprovisionar en Chatwoot» ejecuta la creación completa del paquete operativo y actualiza la vista a estado activo.
- [ ] **CA-07 (Contrato de Red Dual):** El servicio `admin-portal` se comunica exitosamente con Chatwoot a través de `CHATWOOT_INTERNAL_URL` en red Docker interna, mientras el navegador carga el iframe en `NEXT_PUBLIC_CHATWOOT_URL` sin errores de resolución ni bloqueos de red.
- [ ] **CA-08 (Siembra de Webhook y Etiquetas):** La cuenta creada en Chatwoot contiene la bandeja Webchat, las 4 etiquetas comerciales (`lead-frio`, `lead-tibio`, `lead-caliente`, `compra-realizada`) y el webhook activo apuntando al endpoint `/api/webhooks/chatwoot`.

---

## 7. Decisiones Aprobadas en Planeamiento (`/grill-me`)

| ID | Decisión | Justificación Arquitectónica |
|---|---|---|
| **D-01** | **Identificador CHW-002:** Se crea una especificación dedicada a la interoperabilidad en lugar de reabrir CHW-001 (que es solo inventario técnico) o acoplarlo como ADM-002. | Respeta la separación SDD: CHW-001 es la referencia inmutable de Chatwoot; CHW-002 es la arquitectura de integración activa. |
| **D-02** | **Aprovisionamiento Fail-Soft Síncrono:** Se intenta en el alta (Manual y Onboarding Paso 1); si falla, no se hace rollback del inquilino y se ofrece botón de reintento en UI. | Protege la venta y el alta del comercio frente a caídas temporales de Chatwoot, manteniendo consistencia eventual con control del operador. |
| **D-03** | **Contrato de Red Dual (`env.ts`):** `CHATWOOT_INTERNAL_URL` para llamadas backend y `NEXT_PUBLIC_CHATWOOT_URL` para iframe en navegador. | Evita puertos fijos, elimina colisiones de loopback en contenedores Docker y blinda el iframe contra bloqueos de cookies de terceros bajo el mismo dominio de Traefik (`chat.mocter.co`). |
| **D-04** | **SSO Nativo Platform API (`users/:id/login`):** La autenticación del iframe utiliza el mecanismo canónico de enlace efímero (5 min) emitido por la Platform API de Chatwoot. | 100% compatible con Chatwoot Community `v4.19.1` sin requerir extensiones o endpoints no estándar de OmniAuth. |
| **D-05** | **Super Admin para Platform Owner:** El Platform Owner cuenta con un usuario Super Admin en Chatwoot para acceso transparente a la consola global y soporte técnico de inquilinos. | Proporciona gobernanza total de la infraestructura multicanal y capacidad de soporte directo a clientes desde el Backoffice SaaS. |
| **D-06** | **Paquete Operativo Completo en Alta:** La creación de cuenta incluye usuario técnico, bandeja Webchat, 4 etiquetas y registro de webhook. | Cumple el principio de Time-to-Value (§4.9): el inquilino queda listo para operar mensajería desde su primera sesión sin configuraciones manuales. |
| **D-07** | **Inquilinos Existentes vía Acción Manual:** No se ejecuta reconciliación masiva automática en arranque; los inquilinos existentes se aprovisionan mediante acción explícita en `/admin/tenants/[id]`. | Otorga control absoluto al administrador SaaS para verificar y sincronizar comercios preexistentes a demanda. |


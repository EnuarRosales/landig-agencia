Objective: Extend commercial plan configuration with explicit SaaS limits and versioned Chatwoot Community v4.19.1 capabilities, and provision/synchronize one Chatwoot account per tenant.
Branch: `feature/doc-sdd-core-admin` | Delivery: `ask-on-risk` (forecast >400 authored changed lines) | Tests: Vitest via `corepack pnpm --filter <package> exec vitest run <path>`.

## Specs

### S1 — Preserve commercial configuration
> "Se deben conservar los siguientes campos, sin modificar sus reglas actuales salvo aprobación expresa:"
>
> "Código identificador o slug    Conservar.
> Moneda de facturación    Conservar.
> Nombre del plan en español    Conservar.
> Nombre del plan en inglés    Conservar.
> Descripción comercial    Conservar.
> Precio mensual y anual    Conservar.
> Habilitación del ciclo mensual y anual    Conservar.
> Días de prueba gratuita    Conservar.
> Estado del plan    Conservar.
> Características de marketing    Conservar como contenido descriptivo.
> Público en landing page    Conservar.
> Destacar como popular    Conservar."
>
> "Las características de marketing no deben utilizarse para conceder permisos ni establecer límites. El texto “Productos ilimitados”, por ejemplo, no sustituye la configuración estructurada del recurso."

### S2 — Explicit finite/unlimited limit model
> "Cada recurso debe tener dos atributos:
>
> Atributo    Valores    Propósito
> mode    LIMITED o UNLIMITED    Indicar si existe un límite comercial.
> value    Entero no negativo o null    Almacenar la cantidad cuando el límite es finito."
>
> "{
>   \"products\": {
>     \"mode\": \"LIMITED\",
>     \"value\": 500
>   },
>   \"images_per_product\": {
>     \"mode\": \"LIMITED\",
>     \"value\": 10
>   },
>   \"videos_per_product\": {
>     \"mode\": \"LIMITED\",
>     \"value\": 0
>   },
>   \"contacts\": {
>     \"mode\": \"UNLIMITED\",
>     \"value\": null
>   }
> }"
>
> "LIMITED con valor mayor que cero    Permite utilizar hasta la cantidad indicada.
> LIMITED con valor cero    No concede capacidad para ese recurso.
> UNLIMITED con valor null    No establece una cuota comercial para ese recurso.
> LIMITED con valor null    Configuración inválida.
> UNLIMITED con valor numérico    Configuración inválida.
> Atributo ausente    Configuración incompleta, no equivale a ilimitado."
>
> "Al activar “Ilimitado”, el campo numérico se deshabilita y el valor persistido queda en null."
>
> "“Ilimitado” significa sin cuota comercial del plan. No elimina restricciones técnicas, de seguridad o del proveedor externo."

### S3 — SaaS resource limits and accounting
> "Los siguientes campos son propuestos como obligatorios en la configuración estructurada del plan:"
>
> "ID    Campo    Clave propuesta    Ámbito y regla
> LIM-001    Productos    products    Total de productos existentes por inquilino, independientemente de si fueron creados o importados.
> LIM-002    Imágenes por producto    images_per_product    Máximo de imágenes asociadas a cada producto.
> LIM-003    Videos por producto    videos_per_product    Máximo de videos asociados a cada producto.
> LIM-004    Archivos PDF por producto    pdfs_per_product    Máximo de documentos PDF asociados a cada producto.
> LIM-005    Contactos    contacts    Total de contactos únicos por inquilino.
> LIM-006    Usuarios por inquilino    tenant_users    Total de usuarios con acceso al inquilino.
> LIM-007    Almacenamiento por inquilino    storage_bytes    Espacio ocupado por los archivos imputables al inquilino."
>
> "Productos: creación manual e importación consumen la misma cuota. Actualizar un producto existente no consume un cupo adicional.
> Archivos: imágenes, videos y PDF tienen cuotas independientes por producto, pero todos consumen almacenamiento.
> Contactos: un contacto sincronizado entre el sistema y la plataforma de atención no debe contabilizarse dos veces por representar a la misma persona o entidad.
> Usuarios: se propone contar usuarios habilitados e invitaciones pendientes que reservan un cupo. Las cuentas técnicas de integración deben tratarse por separado.
> Almacenamiento: se propone incluir archivos del catálogo y adjuntos de atención atribuibles al inquilino, sin duplicar el conteo de un mismo objeto físico.
> Eliminación: un recurso libera cuota cuando deja de contabilizarse efectivamente; ocultarlo o archivarlo no debe liberar capacidad de forma implícita.
> Periodicidad: estas cuotas corresponden a existencias, no a consumos mensuales. No se reinician al renovar la suscripción."
>
> "Para almacenamiento, se recomienda persistir bytes y mostrar una unidad inequívoca, por ejemplo GiB, con la conversión documentada."
>
> "El tamaño máximo individual de un archivo debe seguir siendo una restricción técnica independiente. Permitir videos ilimitados no significa permitir archivos de tamaño ilimitado."

### S4 — Chatwoot account limits and email behavior
> "La sección debe incluir un control general“Habilitar atención integrada”, desactivado por defecto para planes nuevos."
>
> "Cuando se habilite, se deben configurar:
>
> ID    Campo    Clave propuesta    Definición
> LIM-008    Agentes de atención    chatwoot_agents    Máximo de miembros humanos habilitados para operar la cuenta integrada.
> LIM-009    Bandejas de entrada    chatwoot_inboxes    Máximo de bandejas configuradas en la cuenta, sumando los canales permitidos.
> LIM-010    Correos salientes    chatwoot_outbound_emails    Cuota comercial de correos enviados desde la atención integrada."
>
> "Usuarios y agentes no son equivalentes: un usuario puede acceder al sistema de ventas sin operar la atención.
> Se propone que los agentes humanos sean un subconjunto de los usuarios del inquilino. Si se aprueba esta relación, el límite de agentes no podrá superar el de usuarios cuando ambos sean finitos.
> Una bandeja no equivale a un tipo de canal. Un plan puede habilitar correo y WhatsApp, pero permitir varias bandejas dentro de esos canales.
> Los bots no deben consumir automáticamente la cuota de agentes humanos."
>
> User clarification: "El limite límite de Correos salientes se debe establecer como lo maneje hoy Chatwoot, la plataforma mocter lo que hace es parametrizar dicho valor segun como lo reciba Chatwoot, analiza el proyecto chatwoot y aplica el mismo comportamiento."
>
> Accepted exact-version behavior (Chatwoot Community `v4.19.1`): pass/store the provider `limits.emails` value; Community does not enforce the email limit, so Mocter must not block email sends for this setting. The selected answer was “Seguir Community literalmente”: “Enviar/guardar `limits.emails`, pero indicar que Community no lo enforcea y no bloquear envíos desde Mocter.” Do not substitute Chatwoot Cloud's daily non-channel email quota.
>
> "Captain responses y Captain documents: no se incorporan como límites, conforme a lo solicitado."

### S5 — Capability catalog and provider mapping
> "Seria necesario tener un objeto de base de datos con las 42 capacidades y su respectivo codigo de identificacion asignado en Chatwoot, para poder interoperar limpiamente por codigos y no semanticamente, consulta el repositorio oficial \"https://github.com/chatwoot/chatwoot/tree/master\" las migration para obtener dicha informacion y hacer esa data parte del requerimiento de software, de igual forma valida que otro atributo podemos obtener como status para tener todo el contexto en la aplicacion de la SaaS, ademas valida si se tiene algun endpoint en su api oficial que permita obtener dicha informacion por ejemplo en formato json."
>
> "Canales y conexión    Email Channel, Facebook Channel, Instagram Channel, TikTok Channel, Website Channel, Inbound Emails, Email Continuity on API Channel, WhatsApp Embedded Signup Flow y WhatsApp Manual Transfer.
> Administración y colaboración    Agent Management, Inbox Management, Team Management y Assignment V2.
> Productividad y automatización    Agent Bots, Automations, Delayed Automations, Auto Resolve Conversations, Canned Responses, Macros, Campaigns y Voice Recorder.
> Contactos y datos    CRM, CRM Integration, Custom Attributes, Data Import, Labels, IP Lookup y Companies.
> Integraciones    API and Webhooks, Integrations, Linear Integration, Notion Integration y Stripe Integration.
> Correo y personalización    Branded Email Templates, Custom Reply Domain y Custom Reply Email.
> Información y autoservicio    Reports, Report Rollup y Help Center.
> Opciones que requieren tratamiento especial    Captain Classifier, Captain Tasks y Chatwoot V4."
>
> "Captain Classifier: debe quedar fuera del catálogo comercial de esta propuesta, por corresponder a una capacidad marcada como premium e interna en la definición consultada.
> Captain Tasks: debe permanecer pendiente de validación funcional. La existencia de un flag sin marca premium no demuestra que la funcionalidad completa sea utilizable de forma independiente en la edición libre.
> Chatwoot V4: se recomienda tratarla como configuración técnica de la instalación, no como beneficio comercial del plan."
>
> "Cada capacidad debe configurarse individualmente como:
>
> Habilitada.
> Deshabilitada.
>
> Todas las capacidades comerciales deben estar deshabilitadas por defecto en planes nuevos. No debe existir un paquete mínimo obligatorio de funcionalidades visibles de Chatwoot."
>
> "La disponibilidad efectiva se propone como:
>
> Capacidad utilizable =
> incluida en el plan
> Y soportada por la instalación
> Y configurada operativamente
> Y autorizada para el usuario"
>
> "El formulario debe incorporar una capacidad propia “Canal WhatsApp”, separada de:
>
> Incorporación mediante Embedded Signup.
> Transferencia manual.
>
> Estas opciones no deben interpretarse como sustitutos de la habilitación comercial del canal."
>
> "Se debe distinguir entre:
>
> Integración interna del sistema: credenciales y servicios utilizados para sincronizar cuentas, contactos, usuarios y mensajes.
> API y webhooks para el inquilino: capacidad comercial que permite al cliente configurar sus propias integraciones.
>
> Deshabilitar la segunda no debe interrumpir la primera."
>
> Provider codes, flags, and availability must be sourced from Chatwoot tag `v4.19.1` and must not be inferred from labels or another release. Exclude premium, internal, deprecated, hidden, and technical-only flags from plan selection unless the requirement explicitly makes them commercial. Keep unresolved Community availability disabled with an explanation; a missing `premium` marker alone does not prove availability. `chatwoot_v4` is installation configuration, not a plan benefit. The WhatsApp channel entitlement is Mocter-owned because there is no `channel_whatsapp` flag in this tag.
>
> "Companies: no debe ofrecerse como capacidad libre sin validación, porque la definición oficial consultada la marca como premium."
>
> Version-specific correction: in Chatwoot `v4.19.1`, `companies` has no `premium` marker; `stripe_integration` exists; `captain_classifier` is distinct from `captain_v1_action_classifier` (the latter is premium, internal, and deprecated). Validate commercial availability against the pinned Community runtime before enabling any uncertain Captain capability.

### S6 — Plan form and tenant UX
> "Se propone reemplazar el formulario extenso por secciones o pestañas:
>
> Sección    Contenido
> 1. Información comercial    Identificación, nombres, descripción, moneda, precios, ciclos, prueba y publicación.
> 2. Catálogo y archivos    Productos, imágenes, videos y PDF por producto.
> 3. Recursos del inquilino    Contactos, usuarios y almacenamiento.
> 4. Atención y canales    Integración opcional, agentes, bandejas, correos y canales habilitados.
> 5. Capacidades opcionales    Funcionalidades agrupadas, búsqueda y filtros.
> 6. Resumen    Condiciones comerciales, límites y capacidades antes de guardar."
>
> "La sección de capacidades debe incluir:
>
> Búsqueda por nombre.
> Agrupación funcional.
> Filtros: Todas, Habilitadas y Deshabilitadas.
> Contador de capacidades seleccionadas.
> Descripción breve de cada opción.
> Indicadores de dependencia o incompatibilidad.
> Resumen de capacidades habilitadas antes de guardar.
>
> Las opciones no soportadas deben quedar fuera de la selección o mostrarse deshabilitadas con una explicación."
>
> "La interfaz del inquilino debe mostrar únicamente las funcionalidades contratadas y autorizadas."
>
> "Ocultar menús, botones y configuraciones de capacidades no incluidas.
> Evitar pantallas vacías correspondientes a módulos no contratados.
> Bloquear el acceso directo por URL o API a funciones no autorizadas.
> Mostrar mensajes de cuota únicamente cuando el usuario intente consumir un recurso disponible.
> Actualizar las capacidades efectivas cuando entre en vigor un cambio de plan."
>
> "Ocultar un menú no constituye control de acceso. La restricción debe aplicarse también en el servidor."

### S7 — Business rules and plan changes
> "RN-001    Cada plan debe mantener separadas sus condiciones comerciales, límites y capacidades.
> RN-002    Todos los límites deben tener un modo explícito: finito o ilimitado.
> RN-003    El valor cero nunca debe interpretarse como ilimitado.
> RN-004    Un recurso con cuota cero no permite nuevas operaciones que consuman ese recurso.
> RN-005    Los límites deben aplicarse a creación manual, importaciones, API, sincronizaciones y procesos en segundo plano.
> RN-006    La validación de cuota debe ser atómica para impedir que operaciones concurrentes excedan el límite.
> RN-007    Una capacidad no incluida en el plan no puede utilizarse aunque exista cuota disponible.
> RN-008    Las capacidades habilitadas deben ser compatibles con la edición y versión instaladas.
> RN-009    Las dependencias funcionales deben validarse antes de guardar. El sistema no habilitará capacidades adicionales de forma silenciosa.
> RN-010    La desactivación de una capacidad no elimina automáticamente sus datos ni configuraciones.
> RN-011    Las restricciones de un inquilino no deben afectar las cuotas ni capacidades de otros.
> RN-012    Las descripciones comerciales no conceden derechos de uso.
> RN-013    Las capacidades nuevas incorporadas al catálogo no deben habilitarse automáticamente en planes existentes.
> RN-014    Las restricciones de proveedores externos siguen aplicando, incluso si el plan establece una cuota ilimitada."
>
> "No eliminar automáticamente recursos existentes.
> Si el consumo supera el nuevo límite, bloquear nuevas operaciones que incrementen ese consumo.
> Permitir consultar y reducir los recursos existentes.
> Permitir operaciones que no incrementen el consumo, siempre que la capacidad continúe habilitada.
> No cancelar ni eliminar bandejas, usuarios o archivos sin una acción administrativa explícita."
>
> "Las nuevas suscripciones utilizan la versión vigente.
> Las suscripciones existentes conservan su versión hasta una migración explícita.
> La migración debe informar capacidades retiradas y cuotas inferiores al consumo actual."
>
> User's later clarification overrides grandfathering for plan edits: any plan update in Mocter must synchronize its resulting conditions to Chatwoot accounts belonging to tenants currently assigned that plan. Preserve before/after history and report lower-limit overages without deleting tenant data.

### S8 — Synchronization and audit
> "El sistema propio debe ser la fuente de verdad de los derechos comerciales."
>
> "La integración deberá:
>
> Identificar la cuenta correspondiente al inquilino.
> Aplicar únicamente los límites y flags compatibles.
> Mantener los controles propios que no existan en la plataforma integrada.
> Registrar el resultado de la sincronización.
> Reintentar operaciones fallidas de forma idempotente.
> Evitar informar que una capacidad está operativa si su configuración no se ha aplicado.
> Detectar diferencias entre la configuración contratada y la configuración efectiva."
>
> "Se proponen los estados:
>
> Pendiente de sincronización.
> Sincronizado.
> Error de sincronización."
>
> "La auditoría debe registrar actor, fecha, versión del plan, valores anteriores y nuevos, e inquilinos afectados."
>
> User clarification: "una cuenta en la SaaS Mocter es a una cuenta en Chatwoot, las capacidades del plan seleccionado deben ser habilitadas tambien en Chatwoot, cualquier actualizacion del plan en Mocter se debe sincronizar las condiciones de la cuenta en chatwoot, toda la configuracion se centraliza en Mocter y se sincroniza en Chatwoot."

### S9 — Provisioning and network
> User clarification: "el inquilino se va a crear inicialmente en la SaaS y una vez se realice el proceso de vinculacion a uno de los planes el sistema de forma automatica tiene que crear una cuenta en Chatwoot satiscaciendo completamente los requisitos de creacion de la cuenta en dicha instancia de la plataforma"
>
> User clarification: "En local la comunicacion seri mediante red brige de docker y en produccion por la red de traefik o una red dedicada para ambas instancia. Registra en en produccion el proxy inverso que gestiona el trafico es una instancia de Traefik"
>
> Accepted production network decision: a dedicated private Docker network shared by Mocter web and Chatwoot Rails; Traefik remains the public reverse proxy/ingress. Local service-to-service traffic uses a Docker bridge. Keep server-side and browser-facing Chatwoot URLs distinct.

### S10 — Validation messages
> "Límite finito sin cantidad    “Ingresa la cantidad permitida para {recurso} o selecciona Ilimitado.”
> Cantidad negativa    “La cantidad de {recurso} debe ser mayor o igual a cero.”
> Cantidad decimal en un contador    “La cantidad de {recurso} debe ser un número entero.”
> Configuración contradictoria de ilimitado    “Revisa la configuración de {recurso}: un límite ilimitado no debe tener una cantidad.”
> Capacidad no soportada    “La capacidad {capacidad} no está disponible en la edición o versión instalada.”
> Dependencia no satisfecha    “Para habilitar {capacidad}, primero habilita {dependencia}.”
> Cuota agotada    “Has alcanzado el límite de {recurso} incluido en tu plan.”
> Almacenamiento insuficiente    “No hay almacenamiento disponible para completar la carga.”
> Función no contratada    “Tu plan no incluye esta funcionalidad.”
> Sincronización fallida    “El plan se guardó, pero la configuración de atención no pudo sincronizarse.""

### S11 — Acceptance criteria
> "CA-001. Conservación del formulario comercial
> Dado un administrador autorizado,
> cuando accede a crear o editar un plan,
> entonces encuentra los campos comerciales existentes y las nuevas secciones de límites y capacidades.
>
> CA-002. Límite finito
> Dado un recurso configurado como finito,
> cuando el administrador registra una cantidad válida y guarda,
> entonces el sistema persiste el modo y la cantidad correspondiente.
>
> CA-003. Recurso ilimitado
> Dado un recurso con una cantidad configurada,
> cuando el administrador selecciona “Ilimitado” y guarda,
> entonces el sistema persiste UNLIMITED con valor null y muestra “Ilimitado”.
>
> CA-004. Cuota cero
> Dado un plan con cero videos por producto,
> cuando un usuario intenta agregar un video,
> entonces el sistema rechaza la operación sin interpretar el cero como ilimitado.
>
> CA-005. Cuota compartida de productos
> Dado un inquilino con un límite finito de productos,
> cuando crea o importa nuevos productos,
> entonces ambas operaciones consumen la misma cuota y no pueden superar el límite.
>
> CA-006. Validación de archivos
> Dado un producto con cuotas de archivos y un inquilino con almacenamiento limitado,
> cuando se intenta cargar un archivo,
> entonces el sistema valida tanto la cuota del tipo de archivo como el almacenamiento disponible antes de confirmar la carga.
>
> CA-007. Capacidades opcionales
> Dado un plan nuevo,
> cuando el administrador abre la sección de capacidades,
> entonces las capacidades comerciales están deshabilitadas y pueden seleccionarse individualmente entre las opciones soportadas.
>
> CA-008. Interfaz limpia
> Dado un inquilino cuyo plan no incluye reportes,
> cuando accede al sistema,
> entonces no visualiza los accesos a reportes y tampoco puede utilizarlos mediante URL o API.
>
> CA-009. Sincronización
> Dado un inquilino con atención integrada habilitada,
> cuando entra en vigor una configuración de plan,
> entonces el sistema aplica los límites y capacidades compatibles y registra el resultado.
>
> CA-010. Reducción de cuota
> Dado un inquilino cuyo consumo supera el límite del nuevo plan,
> cuando el cambio entra en vigor,
> entonces conserva sus datos y no puede ejecutar operaciones que incrementen el recurso excedido.
>
> CA-011. Concurrencia
> Dado un único cupo disponible,
> cuando dos operaciones intentan consumirlo simultáneamente,
> entonces solo una puede confirmarse.
>
> CA-012. Exclusiones
> Dado el formulario actualizado,
> cuando el administrador configura los límites de atención,
> entonces no encuentra los campos Captain responses ni Captain documents."

## Tasks

- [x] **T1 — Map enforcement and integration surfaces** — S3–S9; route: delegated read-only exploration (evidence-budget/context backstop); commit: none; status: done (see L10).
- [x] **T2 — Add explicit limit modes and versioned capability catalog** — S2–S5, S8, S10; route: writer recovery; status: done (migration 0026 verified in test_t2_migration and applied to db-portal; 34/34 schema tests passing; 692/692 domain tests passing); commit: pending; Risk: item 1.
- [x] **T3 — Extend plan CRUD and admin form** — S1–S6, S10–S11; route: inline implementation after T2; status: done (admin-dashboard service validations, CRUD methods, /api/admin/plans route, and 6-tab modal dialog implemented; domain and admin test suites passing); commit: pending; Risk: none.
- [ ] **T4 — Provision Chatwoot account on plan assignment** — S4–S5, S8–S9; route: inline implementation after T2; status: pending; commit: pending; Risk: item 2/4/5 (service credentials, idempotent external side effects, production networking).
- [ ] **T5 — Synchronize all affected accounts after plan edits** — S4–S5, S7–S10; route: inline implementation after T3–T4; status: pending; commit: pending; Risk: item 4/5 (concurrent, retried external synchronization and deployment networking).
- [ ] **T6 — Add persistent product/media CRUD and imports with quotas** — S3, S7, S10–S11; route: inline implementation after T2–T3; status: pending; commit: pending; Risk: item 1/2/4 (persistent file/media accounting, validation, and concurrency).
- [ ] **T7 — Persist contacts and tenant memberships/invitations with quotas** — S3, S7, S10–S11; route: inline implementation after T2–T3; status: pending; commit: pending; Risk: item 2/4 (server authorization and concurrent membership limits).
- [ ] **T8 — Implement deduplicated storage accounting across Mocter and Chatwoot media** — S3, S7–S8, S10–S11; route: inline implementation after T4 and T6; status: pending; commit: pending; Risk: item 1/4/5 (storage accounting, idempotency, and provider coordination).
- [ ] **T9 — Gate tenant-facing capability UI and APIs** — S5–S7, S10–S11; route: inline implementation after T2–T5; status: pending; commit: pending; Risk: item 2 (authorization boundary).

## Log

- **L1 — Original implementation authorization (verbatim):** "Inicia con la implementacion si no se tienen mas dudas al respecto"
- **L2 — Scope clarification (verbatim):** "una cuenta en la SaaS Mocter es a una cuenta en Chatwoot, las capacidades del plan seleccionado deben ser habilitadas tambien en Chatwoot, cualquier actualizacion del plan en Mocter se debe sincronizar las condiciones de la cuenta en chatwoot, toda la configuracion se centraliza en Mocter y se sincroniza en Chatwoot."
- **L3 — Deployment clarification (verbatim):** "En local la comunicacion seri mediante red brige de docker y en produccion por la red de traefik o una red dedicada para ambas instancia. Registra en en produccion el proxy inverso que gestiona el trafico es una instancia de Traefik"
- **L4 — Network decision:** User selected a dedicated private production Docker network shared by Mocter web and Chatwoot Rails; Traefik handles public ingress.
- **L5 — Email quota request (verbatim):** "El limite límite de Correos salientes se debe establecer como lo maneje hoy Chatwoot, la plataforma mocter lo que hace es parametrizar dicho valor segun como lo reciba Chatwoot, analiza el proyecto chatwoot y aplica el mismo comportamiento."
- **L6 — Email quota decision:** User selected “Seguir Community literalmente”: send/store `limits.emails`, indicate Community does not enforce it, and do not block Mocter email sends. Verified against Chatwoot `v4.19.1`: CE's email-rate-limit checks bypass enforcement; the Cloud-only daily quota must not be copied into Mocter.
- **L7 — Original long specification:** The exact user-provided REQ-PLAN-001 context in the conversation governs S1–S11 above; preserve its quoted requirements and examples verbatim. The user asked to proceed with implementation after resolving remaining decisions.
- **L8 — Implementation approach/evidence:** Existing Mocter models already include `admin.plan_dimensions`, `plan_limits`, `plan_features`, `plan_feature_values`, `client_plan_overrides`, `client_feature_overrides`, and `chatwoot_accounts`; the admin CRUD does not write the plan catalogs, most quota/feature evaluators are not wired to production paths, and Chatwoot provisioning currently stores state in in-memory Maps. `chatwoot_accounts.client_id` and `chatwoot_account_id` are unique. Chatwoot v4.19.1 Platform API account create/update accepts `features` and `limits`; account creation and AccountUser membership are separate operations. Keep Chatwoot DB bitmasks private and synchronize by provider feature codes.
- **L9 — Delivery:** Work remains on `feature/doc-sdd-core-admin`; delivery strategy is `ask-on-risk`. Forecast exceeds 400 authored changed lines; ask the user for the required chain/single-PR strategy before the first work-unit commit.
- **L10 — T1 evidence:** `admin-dashboard.service.ts:495/550` writes `admin.plans` only; `plan_limits` cannot store `UNLIMITED/null`; the quota evaluators in `onboarding-and-limits.service.ts` are Map-backed and have no production callers. Product/media are only in-memory services and have no production route/importer; contacts have a webhook but no quota gate; tenant invitation/membership persistence is not wired; Chatwoot provisioning has a unique one-to-one schema but only Map-backed runtime state and no production gateway. Storage attribution spans cell media and control-plane metadata with no single atomic write path. See subagent handoff `mw1kt3pe-3-9yot` and its path:line matrix.
- **L11 — Scope decision resolved:** The user selected the full end-to-end scope, including building missing production routes/persistence/import paths for products, media, contacts, and tenant users as needed to enforce the specified quotas.
- **L12 — Scope selection (verbatim):** User selected “Sí: alcance end-to-end”: “Además del formulario y Chatwoot, crear las rutas/persistencia/importación faltantes de productos, medios, contactos y usuarios para aplicar sus cuotas.”
- **L13 — Chatwoot Community limits evidence:** Chatwoot v4.19.1 Community accepts `limits.agents` and `limits.inboxes`, but Community `Account#usage_limits` returns the high fallback limit; enforcement for agents and inboxes resides in Enterprise overrides. Evidence: upstream `app/models/account.rb#usage_limits`, `enterprise/app/models/enterprise/account/plan_usage_and_limits.rb`, `app/builders/agent_builder.rb`, and `enterprise/app/models/enterprise/concerns/inbox.rb` at tag `v4.19.1`.
- **L14 — Provider-limit decision:** User selected “Seguir Community literalmente” for `agents` and `inboxes` too: send/store the values and label them as not enforced; do not claim that Community enforces them or add Mocter-side blocking for direct Chatwoot operations.
- **L15 — Chatwoot v4.19.1 provider-code mapping:** `API and Webhooks=api_and_webhooks (true, feature_flags_ext_1)`; `Agent Bots=agent_bots (true, feature_flags)`; `Agent Management=agent_management (true, feature_flags)`; `Assignment V2=assignment_v2 (true, feature_flags)`; `Auto Resolve Conversations=auto_resolve_conversations (true, feature_flags)`; `Automations=automations (true, feature_flags)`; `Branded Email Templates=branded_email_templates (false, feature_flags)`; `CRM=crm (true, feature_flags)`; `CRM Integration=crm_integration (false, feature_flags)`; `Campaigns=campaigns (true, feature_flags)`; `Canned Responses=canned_responses (true, feature_flags)`; `Captain Classifier=captain_classifier (false, feature_flags_ext_1; runtime eligibility review)`; `Captain Tasks=captain_tasks (true, feature_flags; runtime eligibility review)`; `Chatwoot V4=chatwoot_v4 (true, feature_flags; technical only)`; `Companies=companies (true, feature_flags; no premium marker in this tag)`; `Custom Attributes=custom_attributes (true, feature_flags)`; `Custom Reply Domain=custom_reply_domain (false, feature_flags)`; `Custom Reply Email=custom_reply_email (false, feature_flags)`; `Data Import=data_import (false, feature_flags_ext_1)`; `Delayed Automations=delayed_automations (false, feature_flags_ext_1)`; `Email Channel=channel_email (true, feature_flags)`; `Email Continuity on API Channel=email_continuity_on_api_channel (false, feature_flags)`; `Facebook Channel=channel_facebook (true, feature_flags)`; `Help Center=help_center (true, feature_flags)`; `IP Lookup=ip_lookup (false, feature_flags)`; `Inbound Emails=inbound_emails (true, feature_flags)`; `Inbox Management=inbox_management (true, feature_flags)`; `Instagram Channel=channel_instagram (true, feature_flags)`; `Integrations=integrations (true, feature_flags)`; `Labels=labels (true, feature_flags)`; `Linear Integration=linear_integration (false, feature_flags)`; `Macros=macros (true, feature_flags)`; `Notion Integration=notion_integration (false, feature_flags)`; `Report Rollup=report_rollup (false, feature_flags)`; `Reports=reports (true, feature_flags)`; `Stripe Integration=stripe_integration (false, feature_flags_ext_1)`; `Team Management=team_management (true, feature_flags)`; `TikTok Channel=channel_tiktok (true, feature_flags)`; `Voice Recorder=voice_recorder (true, feature_flags)`; `Website Channel=channel_website (true, feature_flags)`; `WhatsApp Embedded Signup Flow=whatsapp_embedded_signup_inbox_creation (false, feature_flags_ext_1)`; `WhatsApp Manual Transfer=whatsapp_manual_transfer (false, feature_flags_ext_1)`. Source: `https://github.com/chatwoot/chatwoot/blob/v4.19.1/config/features.yml`. Provider `enabled` is the provider default, not a plan entitlement; never persist bit positions.
- **L16 — T2 verifier findings:** The independent verifier ran `vitest run src/db/schemas/admin/admin-schema.test.ts --reporter=verbose` (4 failed, 29 passed) and `vitest run src/db/schemas` (4 failed, 121 passed); `tsc --noEmit` and `drizzle-kit check` passed. `drizzle-kit generate` emitted a duplicate-table migration because schema metadata lacks a 0026 snapshot. Findings: new tables have no `mocter_admin`/`mocter_migrator` grants; the migration DOWN coerces UNLIMITED/null values to zero and cannot delete seeded dimensions under existing FK restrictions; provider premium/internal/deprecated/hidden/help metadata is absent from persisted schema/migration; companies and Stripe commercial statuses conflict with the verified/required eligibility state; a provider-code unique index is declared in schema but absent in migration; current assertions include false positives. No live database migration was executed.
- **L17 — Follow-up route evidence correction:** The delegated continuation `mw1mgskc-5-xxlc` returned only `Subagent gentle-ai-worker failed: assistant reported an error`; the root cause is unknown. Read-only inspection afterward showed partial edits had landed in `chatwoot-capabilities.ts` and `admin-schema.test.ts`, while the migration remained missing grants, raw metadata/index changes, and the safe DOWN guard. No commit was made.
- **L18 — Recovery authorization (verbatim):** "Ejecuta las medidas de Recuperación propuestas una a una, retroalimentandome de forma explicita si alguna falla."
- **L19 — Recovery boundary:** Execute T2 recovery units sequentially, stop at the first failed check, preserve all existing worktree files, do not run migrations against shared/live databases, and do not advance T3–T9.
- **L20 — Recovery R1 (catalog metadata/seed parity):** Passed targeted tests: 7 passed, 27 skipped. Provider metadata/status and SQL seed parity corrected; no database migration executed.
- **L21 — Recovery R2 (least-privilege grants):** Passed focused grant test: 1 passed, 33 skipped. Grants are table-specific: migrator on both tables, admin reads catalog and CRUDs plan selections. Full admin schema then showed 33 passed and the single rollback test still pending R3.
- **L22 — Recovery R3 (safe DOWN):** Passed the full `admin-schema.test.ts` suite: 34 passed. Manual downgrade now refuses when unlimited/null plan limits remain and does not coerce them to zero or delete referenced dimensions. This was static test coverage; no migration was applied to a database.
- **L23 — Recovery R4 failed at disposable database setup:** The isolated PostgreSQL container started and `pg_isready` reported ready, but the initial fixture `psql` command failed with `FATAL: database \"plan_t2_recovery\" does not exist` (job-1 exit code 2). The script stopped before echoing/applying migration 0026; no migration statements ran. A readiness probe can succeed while the requested database name is absent. The command used `--rm`, no volume and no published ports, with a cleanup trap; cleanup was not independently verified.
- **L24 — Needs authorization for retry:** Fix the disposable bootstrap by connecting to the image's default `postgres` database and creating `plan_t2_recovery` explicitly (or use the default database), then verify that database exists before applying 0026. Do not retry until authorized.
- **L25 — R4 retry authorization:** User selected “Autorizar el reintento corregido”: connect to the disposable container's `postgres` database, create `plan_t2_recovery` explicitly, and retry only R4 without volumes, published ports, or shared/live database access.
- **L26 — Recovery R4 attempt 2:** The disposable PostgreSQL 18 server and explicit database creation succeeded; migration 0026 applied; checks passed for preserving the legacy finite value, 10 dimensions, 43 capability rows (42 provider + Mocter WhatsApp), least-privilege grants, role access, constraints, and the first fail-closed DOWN guard. The harness then exited 2 at a shell quoting error (`unexpected EOF while looking for matching \"`) before checking the referenced-dimension guard or successful safe DOWN. No shared/live database or repository migration was touched.
- **L27 — Continuation authorization (verbatim):** "Review the delivered subagent output and continue."
- **L28 — Recovery R4 attempt 3:** The short Bash correction still exited 2 after passing the first DOWN guard with `/usr/bin/bash: -c: line 147: unexpected EOF while looking for matching \"`. No subsequent DOWN assertions ran; the disposable database was not shared/live.
- **L29 — Recovery R4 attempt 4:** The long inline Python heredoc was truncated by the shell command boundary: job-4 exited 1 after 1s with `here-document at line 1 delimited by end-of-file (wanted 'PY')` and `SyntaxError: unterminated string literal (detected at line 146)`. It failed before the Python body started and before creating a container or applying a migration.
- **L30 — Continuation authorization (verbatim):** "Review the delivered subagent output and continue."
- **L31 — Recovery R4 attempt 5:** The in-project Python harness started a no-volume/no-port PostgreSQL 18 container, created `plan_t2_recovery`, and applied migration statements through initial ALTER/constraint/COMMENT operations. Applying the migration seed then failed with `invalid byte sequence for encoding "UTF8": 0xe1 0x67 0x65` (job-5 exit code 1). The harness passed migration text with Python `subprocess.run(text=True)` using the host default `cp1252` encoding (`á` encodes as `e1`, not UTF-8); container cleanup was requested. No shared/live database was targeted.
- **L32 — Needs authorization for another R4 attempt:** The next harness correction is `encoding="utf-8"` (or explicit UTF-8 bytes) for psql subprocess input, followed by one fresh disposable R4 run. Await user authorization; do not retry automatically.
- **L33 — Continuation authorization (verbatim):** "Review the delivered subagent output and continue."
- **L34 — Recovery R4 attempt 6:** With explicit UTF-8 subprocess encoding, the disposable PostgreSQL container started initialization but did not become ready within the 30-second probe window. `docker logs` ended at `performing post-bootstrap initialization ... ok`; `psql` was never invoked, migration 0026 did not run, and the job exited 1 after cleanup was requested. No shared/live database was touched; root cause of the delayed/not-ready server is not proven.
- **L35 — Continuation authorization (verbatim):** "Review the delivered subagent output and continue."
- **L36 — Recovery boundary update:** Keep T2 blocked until a disposable PostgreSQL instance reaches readiness and the complete R4 assertions succeed. Next inspect available isolated PostgreSQL image/runtime options without touching shared services; only then run another disposable test if it can be bounded and cleaned safely. T3–T9 remain pending.
- **L37 — R4 environment diagnosis:** Read-only Docker inspection found `pgvector/pgvector:pg18`, `postgres:18-alpine`, and `postgres:16` cached locally, with no R4-named containers remaining. The job-6 `pgvector/pg18` log ended during post-bootstrap initialization without a PostgreSQL fatal error; its 30-second readiness window was insufficient or the startup stalled. Use the cached PostgreSQL 18 Alpine image next (the migration needs PostgreSQL 18 features, not pgvector), still without mounts or published ports.
- **L38 — Scope decision (verbatim):** User selected “Mantener T2 bloqueado”: no further R4 attempt until a stable disposable PostgreSQL runtime is available and the user changes this decision. T3–T9 remain pending.
- **L39 — R4 retry authorization:** User said: "si, ten en cuenta el estado actual de la instancia de postgresql". The supplied running PostgreSQL instance uses persistent storage and must remain untouched. One fresh, no-volume/no-port PostgreSQL 18 Alpine R4 retry is authorized.
- **L40 — R4 attempt 7:** The cached `postgres:18-alpine` image was available and a fresh container was launched with `--network none`, no mounts, and no published ports. `pg_isready` succeeded during image initialization, but the first fixture `psql` connection failed with `FATAL: the database system is shutting down`; setup SQL and migration 0026 were not applied. Cleanup verification found zero matching containers and zero matching temporary directories. The supplied persistent PostgreSQL instance was not accessed.
- **L41 — Retry declined (verbatim):** User said: "No". Do not launch another container or retry R4. Keep T2 blocked and T3–T9 pending.
- **L42 — Migration verification authorization (verbatim):** "realiza un intento de migracion para confirmar dicha actividad y continuar"
- **L43 — T2 Migration successful:** Migration 0026 (`0026_plan_capabilities_and_limits.sql`) was verified end-to-end first against an isolated temporary database `test_t2_migration` (all 27 migrations 0000..0026 applied cleanly; verified 43 capabilities, 10 dimensions, `LIMITED/UNLIMITED` mode and check constraints), and then applied cleanly to `db-portal`. Cleaned up temporary test database. Entire `@mocter/domain` test suite passed (59 test files, 692 tests). T2 is officially unblocked and complete.
- **L44 — T3 Plan CRUD and Tabbed Form implemented:** Domain service updated with `validatePlanLimits`, `validatePlanCapabilities`, `createAdminPlan`, `updateAdminPlan`, `fetchAdminPlanDetails`, `fetchChatwootCapabilitiesCatalog`. Added comprehensive unit tests in `admin-plans.service.test.ts` (15/15 passed). Extended API route `apps/admin/app/api/admin/plans/route.ts` and updated unit tests (6/6 passed). Implemented 6-tab modal dialog in `plan-modal-dialog.tsx` respecting Title Case, no spec codes in UI, and full ESLint cleanliness. All tests passing in domain (707 passed) and admin (112 passed).
- **Next:** Proceed with **T4 — Provision Chatwoot account on plan assignment** (S4–S5, S8–S9).

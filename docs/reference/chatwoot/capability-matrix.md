# Matriz de capacidades de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Método | Cruce de `config/routes.rb`, `db/schema.rb`, `app/controllers/` y `enterprise/app/controllers/` |

## 1. Cómo leer esta matriz

Cada fila cita **al menos un controlador verificado por existencia de archivo** y las tablas que respalda la capacidad.

| Valor de "derecho" | Significado |
|---|---|
| **Libre** | El controlador vive en `app/controllers/` |
| **Enterprise** | El controlador vive **solo** en `enterprise/app/controllers/` |
| **Premium declarada** | `features.yml` la marca `enterprise: true` además de lo anterior |
| **No verificado** | No se localizó un controlador con ese nombre |

Cifras de referencia: **180** controladores en `app/controllers/`, **63** en `enterprise/app/controllers/`.

## 2. Tenencia e identidad

| Capacidad | Tablas | Controlador | Ruta | Derecho | `mocter-admin` |
|---|---|---|---|---|---|
| Cuenta (inquilino) | `accounts` | `Platform::Api::V1::AccountsController` | `routes.rb:642` | Libre | Crea y correlaciona |
| Pertenencia y rol | `account_users` | `Platform::Api::V1::Accounts::AccountUsersController` | `routes.rb:650` | Libre | Asigna rol de servicio |
| Usuarios | `users` | `Platform::Api::V1::UsersController` | `routes.rb:657` | Libre | Crea el usuario de servicio |
| Enlace de acceso al panel | `users`, `access_tokens` | `Platform::Api::V1::UsersController#login` | `routes.rb:659` | Libre | SSO de 5 minutos |
| Token de API | `access_tokens` | `Platform::Api::V1::UsersController#token` | `routes.rb:660` | Libre | Credencial de servicio |
| Bots de plataforma | `agent_bots` | `Platform::Api::V1::AgentBotsController` | bloque platform | Libre | No |
| Migración de canal de correo | `channel_email` | `Platform::Api::V1::EmailChannelMigrationsController` | sin Swagger | Libre | Disponible |
| SAML | `account_saml_settings` | `Api::V1::Accounts::SamlSettingsController` | `routes.rb:138` **sin guardia** | Enterprise | No: la identidad es `AUTH-001` |

## 3. Operación de conversaciones

| Capacidad | Tablas | Controlador | Ruta | Derecho | `mocter-admin` |
|---|---|---|---|---|---|
| Bandeja | `inboxes` | `Api::V1::Accounts::InboxesController` | `routes.rb:329` | Libre | Se aprovisiona por plan |
| Canales de mensajería | `channel_whatsapp`, `channel_api`, `channel_email`, `channel_facebook_pages`, `channel_instagram`, `channel_line`, `channel_sms`, `channel_telegram`, `channel_tiktok`, `channel_twilio_sms`, `channel_twitter_profiles`, `channel_web_widgets` | `Api::V1::Accounts::InboxesController` (alta por inbox) | `routes.rb:329-356` | Libre | Se habilita por plan |
| Conversaciones | `conversations`, `conversation_participants` | `Api::V1::Accounts::ConversationsController` | `routes.rb:184` | Libre | Solo lectura de métricas |
| Mensajes | `messages`, `attachments` | `Api::V1::Accounts::Conversations::MessagesController` | `routes.rb:193` | Libre | No |
| Asignaciones | — | `Api::V1::Accounts::Conversations::AssignmentsController` | `routes.rb:201` | Libre | No |
| Etiquetas de conversación | `labels`, `taggings` | `Api::V1::Accounts::Conversations::LabelsController` | `routes.rb:202` | Libre | No |
| Contactos | `contacts` | `Api::V1::Accounts::ContactsController` | `routes.rb:246` | Libre | Proyección desde `mocter-core` |
| Contactos de empresa | `companies` | `Api::V1::Accounts::Companies::ContactsController` | `routes.rb:237` | Libre | No |
| Contact inboxes | `contact_inboxes` | `Api::V1::Accounts::ContactInboxesController` | `routes.rb:275` | Libre | No |
| Notas | `notes` | `Api::V1::Accounts::Contacts::NotesController` | `routes.rb:277` | Libre | No |
| Etiquetas de contacto | `labels`, `taggings` | `Api::V1::Accounts::Contacts::LabelsController` | `routes.rb:276` | Libre | No |
| Adjuntos de contacto | `attachments` | `Api::V1::Accounts::Contacts::AttachmentsController` | `routes.rb:278` | Libre | No |
| Etiquetas de cuenta | `labels` | `Api::V1::Accounts::LabelsController` | `routes.rb:363` | Libre | No |
| Atributos personalizados | `custom_attribute_definitions` | `Api::V1::Accounts::CustomAttributeDefinitionsController` | `routes.rb:326` | Libre | No |
| Respuestas rápidas | `canned_responses` | `Api::V1::Accounts::CannedResponsesController` | `routes.rb:159` | Libre | No |
| Macros | `macros` | `Api::V1::Accounts::MacrosController` | `routes.rb:163` | Libre | No |
| Automatizaciones | `automation_rules`, `automation_rule_pending_executions` | `Api::V1::Accounts::AutomationRulesController` | `routes.rb:160` | Libre | No |
| Campañas | `campaigns`, `campaign_recipients` | `Api::V1::Accounts::CampaignsController` | `routes.rb:174` | Libre (analítica es Enterprise) | No |
| Equipos | `teams`, `team_members` | `Api::V1::Accounts::TeamsController`, `Api::V1::Accounts::TeamMembersController` | `routes.rb:378` | Libre | No |
| Miembros de bandeja | `inbox_members` | `Api::V1::Accounts::InboxMembersController` | `routes.rb:388` | Libre | No |
| Agentes | `users`, `account_users` | `Api::V1::Accounts::AgentsController` | `routes.rb:80` | Libre | No |
| Bots de agente | `agent_bots`, `agent_bot_inboxes` | `Api::V1::Accounts::AgentBotsController` | `routes.rb:139` | Libre | No |
| Webhooks | `webhooks` | `Api::V1::Accounts::WebhooksController` | `routes.rb:429` | Libre | No |
| Integraciones | `integrations_hooks`, `dashboard_apps` | `Api::V1::Accounts::DashboardAppsController`, `Api::V1::Integrations::WebhooksController` | `routes.rb:435-471` | Libre salvo Stripe y Shopify | No |
| Búsqueda | — | `Api::V1::Accounts::SearchController` | `routes.rb:228` | Libre | No |
| Importación | `data_imports`, `data_import_items`, `data_import_errors`, `data_import_mappings` | `Api::V1::Accounts::DataImportsController` | `routes.rb:282` | Libre | No |
| Respuestas CSAT | `csat_survey_responses` | `Api::V1::Accounts::CsatSurveyResponsesController` | `routes.rb:294` | Libre (la actualización es Enterprise) | No |

## 4. Contenido e IA

| Capacidad | Tablas | Controlador | Ruta | Derecho | `mocter-admin` |
|---|---|---|---|---|---|
| Centro de ayuda | `portals`, `portals_members`, `categories`, `related_categories`, `folders`, `articles`, `article_embeddings` | `Api::V1::Accounts::PortalsController`, `CategoriesController`, `ArticlesController` | `routes.rb:477-499` | Libre | No |
| Centro de ayuda público | mismos | `Public::Api::V1::PortalsController`, `Portals::ArticlesController`, `Portals::CategoriesController` | `routes.rb:689-700` | Libre | No |
| Captain (IA) | `captain_assistants`, `captain_assistant_responses`, `captain_custom_tools`, `captain_documents`, `captain_faq_observations`, `captain_faq_suggestions`, `captain_inboxes`, `captain_message_reports`, `captain_scenarios` | `Api::V1::Accounts::Captain::*Controller` | `routes.rb:85-136` (bloque) | Enterprise | No |
| Copilot | `copilot_threads`, `copilot_messages` | `Api::V1::Accounts::Captain::CopilotThreadsController`, `CopilotMessagesController` | `routes.rb:116-118` | Enterprise | No |

## 5. Calidad, análisis y voz

| Capacidad | Tablas | Controlador | Ruta | Derecho | `mocter-admin` |
|---|---|---|---|---|---|
| SLA | `sla_policies`, `sla_events`, `applied_slas` | `Api::V1::Accounts::SlaPoliciesController`, `AppliedSlasController` | `routes.rb:166`, `:303` **sin guardia** | Enterprise | No |
| Capacidad de agentes | `agent_capacity_policies`, `inbox_capacity_limits`, `assignment_policies`, `inbox_assignment_policies` | `Api::V1::Accounts::AgentCapacityPoliciesController` | `routes.rb:168` **sin guardia** | Enterprise + `agent_capacity` | No |
| Roles personalizados | `custom_roles` | `Api::V1::Accounts::CustomRolesController` | `routes.rb:167` **sin guardia** | Enterprise | No |
| Auditoría | `audits` | `Api::V1::Accounts::AuditLogsController` | `routes.rb:150` **sin guardia** | Enterprise + `audit_logs` | No |
| Monitoreo de conversaciones | `conversation_monitors`, `conversation_monitor_*`, `conversation_outcomes` | `Api::V1::Accounts::MonitorsController` | `routes.rb:60` (bloque) | Enterprise | No |
| Llamadas de voz | `calls`, `channel_twilio_sms` | `Api::V1::Accounts::CallsController`, `WhatsappCallsController`, `Contacts::CallsController` | `routes.rb:279`, `:311-325` | Enterprise + `voice_calls` | No |
| Eventos de reporte | `reporting_events`, `reporting_events_rollups` | `Api::V1::Accounts::ReportingEventsController` | `routes.rb:224`, `:309` | Enterprise | No |
| Marca personalizada | Sin tabla propia | Sin controlador dedicado | `routes.rb:328` | Premium declarada (`custom_branding`) | No: el white-label es `ADM-001` RF-15 |
| Quitar marca | Sin tabla propia | Sin controlador dedicado | — | Premium declarada (`disable_branding`) | No |

## 6. API pública

| Capacidad | Controlador | Ruta | Derecho |
|---|---|---|---|
| Inbox público | `Public::Api::V1::InboxesController` | `routes.rb:668` | Libre |
| Contactos públicos | `Public::Api::V1::Inboxes::ContactsController` | `routes.rb:670` | Libre |
| Conversaciones públicas | `Public::Api::V1::Inboxes::ConversationsController` | `routes.rb:671-676` | Libre |
| Mensajes públicos | `Public::Api::V1::Inboxes::MessagesController` | `routes.rb:678` | Libre |

## 7. El hallazgo que ordena todo lo demás

**Seis capacidades tienen ruta montada sin guardia y controlador solo en `enterprise/`.** Son SAML, auditoría, SLA, roles personalizados, capacidad de agentes y SLA aplicados (`routes.rb:138`, `150`, `166`, `167`, `168`, `303`).

Eso significa que con el directorio `enterprise/` presente, esas rutas se resuelven aunque `DISABLE_ENTERPRISE` esté activo. Pero **cinco de las seis devuelven 401/403 limpio**: su guarda consulta una feature que vale `enabled: false` por defecto. La única con falla dura es `agent_capacity_policies`, que no tiene guarda de feature y devuelve 500 por `NoMethodError`.

El análisis por controlador está en [`enterprise-boundary.md`](enterprise-boundary.md) §4.2-4.4.

Para `mocter-admin` la regla es directa: **no construir interfaz que llame a esos seis grupos.** No son capacidades que la app pueda asumir disponibles.

## 8. Lectura de negocio

### 8.1 Lo que `mocter-admin` sí controla

Cinco operaciones, todas por Platform API:

1. Crear la cuenta.
2. Crear el usuario de servicio.
3. Asignarle rol en la cuenta.
4. Emitir su token.
5. Emitir un enlace de acceso al panel.

Todo lo demás —bandejas, canales, conversaciones, contactos operativos— se opera **dentro** de Chatwoot.

### 8.2 Lo que `mocter-admin` no puede hacer

| Necesidad | Por qué no |
|---|---|
| Aplicar límites de plan | Chatwoot no los aplica en self-hosted; `limits` es un `jsonb` que se acepta y no se enforza |
| Leer conversaciones de varias cuentas a la vez | No existe lectura cross-account; cada usuario ve las cuentas donde tiene `AccountUser` |
| Habilitar capacidad premium | El controlador vive en `enterprise/` |
| Reutilizar su 2FA | El padrón de usuarios es distinto (`AUTH-001`) |
| Sembrar un canal | La Platform API no expone creación de inboxes ni de canales |

### 8.3 La frontera real

La Platform API sirve para **crear el contenedor y la credencial**. No sirve para configurar el contenido del contenedor.

Queda un hueco operativo conocido: el alta de un canal (por ejemplo WhatsApp) no se puede hacer por Platform API. Hay que hacerla por `/api/v1/accounts/{id}/inboxes` con el token del usuario de servicio, o por la interfaz.

## 9. Lo que no se verificó

- `working_hours` y `folders` tienen ruta pero no se localizó un controlador con ese nombre. Se marcan como **no verificado** y no se usan en la matriz.
- No se probó ningún endpoint.
- No se verificó cómo resuelve Rails los controladores enterprise que comparten ruta con uno de `app/controllers/` (por ejemplo `Api::V1::Accounts::ConversationsController` existe en ambos árboles). Es una pregunta de arranque, no de rutas, y queda abierta.
- No se verificó si las capacidades premium degradan de forma elegante o rompen la interfaz cuando sus módulos no se inyectan.

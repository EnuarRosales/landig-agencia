# Modelo de datos de Chatwoot

| Atributo | Valor |
|---|---|
| Commit | `042b438fe31d2a2ef00c396379b7064ab6d0034f` |
| Release | `4.19.0` |
| Fuente | `db/schema.rb` (estado consolidado, 1.772 líneas) |
| Método | Parseo estructural. **No** se consultó una base en ejecución. |

## 1. Cifras

| Medida | Valor |
|---|---|
| Tablas | 104 |
| Con `account_id` directo | 76 |
| Sin `account_id` | 28 |
| Claves foráneas declaradas | 17 |
| Migraciones | 199 |

Las migraciones explican la evolución, no el estado. La fuente de verdad es `db/schema.rb`.

## 2. Qué significa "tenencia" aquí

Una tabla es **de inquilino** cuando lleva `account_id` y sus filas pertenecen a una cuenta. Es **global** cuando no lo lleva, y entonces su alcance es la instalación, no el inquilino.

Las 28 tablas sin `account_id` no son un grupo homogéneo. Hay al menos cuatro motivos distintos:

| Motivo | Tablas | Consecuencia |
|---|---|---|
| Es la raíz o el padrón | `accounts`, `users`, `access_tokens`, `user_sessions` | Su alcance supera la cuenta |
| Es de plataforma | `platform_apps`, `platform_app_permissibles`, `platform_banners`, `installation_configs` | Solo la Platform API o el superadmin |
| Es tabla de unión | `contact_inboxes`, `inbox_members`, `team_members`, `taggings`, `portals_members`, `notification_subscriptions`, `related_categories`, `captain_inboxes`, `inbox_assignment_policies`, `inbox_capacity_limits` | La cuenta se resuelve por `join` |
| Es infraestructura | `active_storage_*`, `action_mailbox_inbound_emails`, `audits`, `data_import_errors`, `data_import_items`, `article_embeddings`, `conversation_monitor_scans` | Cuelgan de otra fila, no de la cuenta |

## 3. Clasificación funcional

Dieciséis grupos. La columna "escribe" identifica quién es la autoridad de escritura en el ecosistema del proyecto.

| # | Grupo | Tablas | Con `account_id` | Escribe |
|---|---|---|---|---|
| 1 | Tenencia e identidad | 5 | 2 | Chatwoot; `mocter-admin` correlaciona |
| 2 | Seguridad de cuenta | 2 | 2 | Chatwoot |
| 3 | Plataforma | 4 | 0 | Chatwoot, vía `PlatformApp` |
| 4 | Contactos | 5 | 5 | `mocter-core` como maestro; Chatwoot recibe proyección |
| 5 | Conversaciones y mensajes | 9 | 9 | Chatwoot (dueño del dominio operativo) |
| 6 | Canales | 13 | 13 | Chatwoot, salvo el alta que ordena `mocter-admin` |
| 7 | Bandeja y enrutamiento | 13 | 13 | Chatwoot |
| 8 | Automatización y campañas | 10 | 9 | Chatwoot |
| 9 | SLA | 3 | 3 | Chatwoot |
| 10 | Monitoreo de conversaciones | 7 | 6 | Chatwoot |
| 11 | Reportes y auditoría | 4 | 3 | Chatwoot |
| 12 | Centro de ayuda | 7 | 5 | Chatwoot |
| 13 | IA: Captain y Copilot | 11 | 9 | Chatwoot, sujeto a capacidad |
| 14 | Notificaciones | 3 | 2 | Chatwoot |
| 15 | Importación | 4 | 2 | Chatwoot |
| 16 | Almacenamiento de archivos | 4 | 0 | Chatwoot (ActiveStorage) |

## 4. Inventario completo

`acc` indica si la tabla lleva `account_id` directo. La línea es la de `create_table` en `db/schema.rb`.

| Tabla | acc | Línea | Grupo |
|---|---|---|---|
| `access_tokens` | no | 21 | 1 |
| `account_saml_settings` | sí | 31 | 2 |
| `account_users` | sí | 43 | 1 |
| `accounts` | no | 62 | 1 |
| `action_mailbox_inbound_emails` | no | 80 | 16 |
| `active_storage_attachments` | no | 89 | 16 |
| `active_storage_blobs` | no | 99 | 16 |
| `active_storage_variant_records` | no | 111 | 16 |
| `agent_bot_inboxes` | sí | 117 | 7 |
| `agent_bots` | sí | 126 | 7 |
| `agent_capacity_policies` | sí | 139 | 7 |
| `agent_sessions` | sí | 149 | 7 |
| `applied_slas` | sí | 179 | 9 |
| `article_embeddings` | no | 193 | 12 |
| `articles` | sí | 202 | 12 |
| `assignment_policies` | sí | 232 | 7 |
| `attachments` | sí | 249 | 5 |
| `audits` | no | 265 | 11 |
| `automation_rule_pending_executions` | sí | 291 | 8 |
| `automation_rules` | sí | 310 | 8 |
| `calls` | sí | 327 | 6 |
| `campaign_recipients` | sí | 354 | 8 |
| `campaigns` | sí | 383 | 8 |
| `canned_responses` | sí | 410 | 8 |
| `captain_assistant_responses` | sí | 418 | 13 |
| `captain_assistants` | sí | 437 | 13 |
| `captain_custom_tools` | sí | 449 | 13 |
| `captain_documents` | sí | 472 | 13 |
| `captain_faq_observations` | sí | 493 | 13 |
| `captain_faq_suggestions` | sí | 509 | 13 |
| `captain_inboxes` | no | 526 | 13 |
| `captain_message_reports` | sí | 536 | 13 |
| `captain_scenarios` | sí | 551 | 13 |
| `categories` | sí | 567 | 12 |
| `channel_api` | sí | 588 | 6 |
| `channel_email` | sí | 602 | 6 |
| `channel_facebook_pages` | sí | 632 | 6 |
| `channel_instagram` | sí | 645 | 6 |
| `channel_line` | sí | 656 | 6 |
| `channel_sms` | sí | 666 | 6 |
| `channel_telegram` | sí | 676 | 6 |
| `channel_tiktok` | sí | 685 | 6 |
| `channel_twilio_sms` | sí | 698 | 6 |
| `channel_twitter_profiles` | sí | 719 | 6 |
| `channel_web_widgets` | sí | 730 | 6 |
| `channel_whatsapp` | sí | 751 | 6 |
| `companies` | sí | 768 | 4 |
| `contact_inboxes` | no | 784 | 4 |
| `contacts` | sí | 799 | 4 |
| `conversation_monitor_automation_deliveries` | sí | 831 | 10 |
| `conversation_monitor_daily_usages` | sí | 849 | 10 |
| `conversation_monitor_evaluations` | sí | 860 | 10 |
| `conversation_monitor_scans` | no | 883 | 10 |
| `conversation_monitor_work_items` | sí | 898 | 10 |
| `conversation_monitors` | sí | 921 | 10 |
| `conversation_outcomes` | sí | 943 | 10 |
| `conversation_participants` | sí | 974 | 5 |
| `conversations` | sí | 986 | 5 |
| `copilot_messages` | sí | 1036 | 13 |
| `copilot_threads` | sí | 1047 | 13 |
| `csat_survey_responses` | sí | 1059 | 11 |
| `custom_attribute_definitions` | sí | 1080 | 4 |
| `custom_filters` | sí | 1097 | 4 |
| `custom_roles` | sí | 1109 | 2 |
| `dashboard_apps` | sí | 1119 | 8 |
| `data_import_errors` | no | 1130 | 15 |
| `data_import_items` | no | 1145 | 15 |
| `data_import_mappings` | sí | 1165 | 15 |
| `data_imports` | sí | 1181 | 15 |
| `email_templates` | sí | 1208 | 8 |
| `folders` | sí | 1223 | 12 |
| `inbox_assignment_policies` | no | 1231 | 7 |
| `inbox_capacity_limits` | no | 1240 | 7 |
| `inbox_members` | no | 1251 | 7 |
| `inboxes` | sí | 1260 | 7 |
| `installation_configs` | no | 1288 | 3 |
| `integrations_hooks` | sí | 1298 | 8 |
| `labels` | sí | 1311 | 5 |
| `leaves` | sí | 1323 | 7 |
| `macros` | sí | 1341 | 8 |
| `mentions` | sí | 1353 | 5 |
| `messages` | sí | 1366 | 5 |
| `notes` | sí | 1400 | 5 |
| `notification_settings` | sí | 1412 | 14 |
| `notification_subscriptions` | no | 1422 | 14 |
| `notifications` | sí | 1433 | 14 |
| `platform_app_permissibles` | no | 1455 | 3 |
| `platform_apps` | no | 1466 | 3 |
| `platform_banners` | no | 1472 | 3 |
| `portals` | sí | 1482 | 12 |
| `portals_members` | no | 1502 | 12 |
| `related_categories` | no | 1510 | 12 |
| `reporting_events` | sí | 1519 | 11 |
| `reporting_events_rollups` | sí | 1541 | 11 |
| `sla_events` | sí | 1557 | 9 |
| `sla_policies` | sí | 1574 | 9 |
| `taggings` | no | 1587 | 5 |
| `tags` | no | 1606 | 5 |
| `team_members` | no | 1613 | 7 |
| `teams` | no | 1623 | 7 |
| `user_sessions` | no | 1636 | 1 |
| `users` | no | 1656 | 1 |
| `webhooks` | sí | 1697 | 8 |
| `working_hours` | sí | 1710 | 7 |

## 5. Hallazgos con consecuencia directa

### 5.1 Solo 17 claves foráneas

Para 104 tablas. La integridad es de aplicación. Un borrado en Chatwoot puede dejar filas huérfanas y no hay restricción que lo impida.

Consecuencia: `mocter-admin` **no puede** asumir que un `account_id` citado en su tabla de correlación existe todavía. La reconciliación tiene que ser defensiva.

### 5.2 El correo de usuario no es único en la base

| Hecho | Evidencia |
|---|---|
| `users.email` tiene índice **no único** | `db/schema.rb:1689` |
| La unicidad real está en `(uid, provider)` | `db/schema.rb:1694` |
| `provider` vale `"email"` por defecto | `db/schema.rb:1657` |

La unicidad de correo existe en la capa de modelo de Devise. Si dos altas compiten, la base no las detiene.

### 5.3 `account_users.role` es un entero

`db/schema.rb:46`. No hay catálogo de roles en la comunidad; `custom_roles` (`db/schema.rb:1109`) es una capacidad aparte. El rol base se interpreta en el modelo.

### 5.4 `messages` denormaliza la cuenta y la bandeja

`messages` lleva `account_id`, `inbox_id` y `conversation_id`, los tres no nulos (`db/schema.rb:1368-1370`). No es un error: permite filtrar sin `join`. Es el patrón que la directiva del proyecto pide para consultas frecuentes.

### 5.5 Hay tablas de capacidad premium en el esquema comunitario

`captain_*`, `agent_capacity_policies`, `custom_roles`, `sla_*`, `applied_slas`, `reporting_events`, `audits`. La tabla existe en el esquema aunque la capacidad esté gateada en código. Presencia de tabla no implica derecho de uso.

### 5.6 Los archivos viven en ActiveStorage

`active_storage_blobs`, `active_storage_attachments`, `active_storage_variant_records` son de Rails, no de Chatwoot. No llevan `account_id` y su alcance se resuelve por la fila que los referencia.

Consecuencia para `mocter-admin`: **no hay una tabla de archivos por inquilino que se pueda consultar**. La deduplicación por contenido y el catálogo global que exige `ADM-001` (D-13) son una construcción propia, no una copia.

## 6. Qué replica `mocter-admin` y qué no

| Dato | ¿Se replica? | Motivo |
|---|---|---|
| Cuenta (`accounts`) | Solo el `account_id` y el estado | La autoridad es `client_id` |
| Usuarios y pertenencias | No | El padrón es de `mocter-admin`; Chatwoot tiene el suyo |
| Contactos | Sí, como proyección operativa | El maestro es `mocter-core` |
| Conversaciones y mensajes | No | Chatwoot es dueño del dominio operativo |
| Canales | No | Se aprovisionan, no se replican |
| Archivos | No | Catálogo propio (D-13) |
| Reportes | No en fase 1 | Se consultan por API cuando haga falta |

## 7. Lo que no se verificó

- No se consultó una base en ejecución: los tipos y valores por defecto provienen de `db/schema.rb`.
- No se auditó cada índice de las 104 tablas; se detallaron los de las tablas citadas.
- No se verificó el contenido de las 199 migraciones; solo se contaron.

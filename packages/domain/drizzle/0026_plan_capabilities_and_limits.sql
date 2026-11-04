-- T2: explicit LIMITED/UNLIMITED plan-limit model, canonical dimension seeds,
-- and Chatwoot Community v4.19.1 capability catalog.
--
-- Reversibility: this migration only adds columns/tables and inserts seed data.
-- Existing plan_limit rows are backfilled with mode='LIMITED' and their current
-- finite value preserved. The manual DOWN section at the bottom documents the
-- reverse operations.

-- 1. Extend admin.plan_limits with explicit LIMITED/UNLIMITED mode.
ALTER TABLE "admin"."plan_limits" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'LIMITED' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint

-- Defensive backfill: every existing row keeps its finite value as LIMITED.
UPDATE "admin"."plan_limits" SET "mode" = 'LIMITED' WHERE "mode" IS NULL;--> statement-breakpoint

ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_mode_check";--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_mode_check" CHECK ("mode" IN ('LIMITED', 'UNLIMITED'));--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_mode_value_check";--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_mode_value_check" CHECK (("mode" = 'LIMITED' AND "value" IS NOT NULL) OR ("mode" = 'UNLIMITED' AND "value" IS NULL));--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_value_check";--> statement-breakpoint
ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_value_check" CHECK ("value" IS NULL OR "value" >= 0);--> statement-breakpoint

COMMENT ON COLUMN "admin"."plan_limits"."mode" IS 'LIMITED = cuota finita con value obligatorio; UNLIMITED = sin cuota comercial, value NULL.';--> statement-breakpoint
COMMENT ON COLUMN "admin"."plan_limits"."value" IS 'Cantidad permitida cuando mode=LIMITED; NULL cuando mode=UNLIMITED.';

-- 2. Seed canonical SaaS plan dimensions (S3, S4).
INSERT INTO "admin"."plan_dimensions" (
  "key",
  "label",
  "unit",
  "value_type",
  "min_value",
  "max_value",
  "default_value",
  "legal_floor_value",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
) VALUES
  ('products', '{"es":"Productos","en":"Products"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('images_per_product', '{"es":"Imágenes por producto","en":"Images per product"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('videos_per_product', '{"es":"Videos por producto","en":"Videos per product"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('pdfs_per_product', '{"es":"Archivos PDF por producto","en":"PDFs per product"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('contacts', '{"es":"Contactos","en":"Contacts"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('tenant_users', '{"es":"Usuarios por inquilino","en":"Users per tenant"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('storage_bytes', '{"es":"Almacenamiento por inquilino","en":"Storage per tenant"}'::jsonb, 'bytes', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('chatwoot_agents', '{"es":"Agentes de atención","en":"Support agents"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('chatwoot_inboxes', '{"es":"Bandejas de entrada","en":"Inboxes"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration'),
  ('chatwoot_outbound_emails', '{"es":"Correos salientes","en":"Outbound emails"}'::jsonb, 'count', 'integer', 0, NULL, 0, NULL, now(), now(), 'migration', 'migration')
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint

-- 3. Chatwoot capability catalog (admin.chatwoot_capabilities).
CREATE TABLE IF NOT EXISTS "admin"."chatwoot_capabilities" (
  "code" text PRIMARY KEY NOT NULL,
  "name" jsonb NOT NULL,
  "description" jsonb,
  "provider_code" text,
  "provider_enabled" boolean DEFAULT false NOT NULL,
  "provider_flag_group" text,
  "provider_premium" boolean DEFAULT false NOT NULL,
  "provider_internal" boolean DEFAULT false NOT NULL,
  "provider_deprecated" boolean DEFAULT false NOT NULL,
  "provider_hidden" boolean DEFAULT false NOT NULL,
  "provider_help_url" text,
  "ownership" text DEFAULT 'provider' NOT NULL,
  "commercial_status" text DEFAULT 'commercial' NOT NULL,
  "requires_runtime_review" boolean DEFAULT false NOT NULL,
  "catalog_version" text DEFAULT 'v4.19.1' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  CONSTRAINT "chatwoot_capabilities_code_check" CHECK (code = lower(code)),
  CONSTRAINT "chatwoot_capabilities_ownership_check" CHECK (ownership IN ('provider', 'mocter')),
  CONSTRAINT "chatwoot_capabilities_commercial_status_check" CHECK (commercial_status IN ('commercial', 'technical', 'premium_internal', 'deprecated', 'unknown')),
  CONSTRAINT "chatwoot_capabilities_provider_code_check" CHECK ((ownership = 'mocter' AND provider_code IS NULL) OR ownership = 'provider'),
  CONSTRAINT "chatwoot_capabilities_flag_group_check" CHECK (provider_flag_group IS NULL OR provider_flag_group IN ('feature_flags', 'feature_flags_ext_1'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chatwoot_capabilities_version_provider_code_unique" ON "admin"."chatwoot_capabilities" USING btree ("catalog_version","provider_code") WHERE "provider_code" IS NOT NULL;--> statement-breakpoint

-- 4. Per-plan capability selections (admin.plan_capability_values), disabled by default.
CREATE TABLE IF NOT EXISTS "admin"."plan_capability_values" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "plan_id" uuid NOT NULL,
  "capability_code" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  CONSTRAINT "plan_capability_values_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "admin"."plans"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "plan_capability_values_capability_code_chatwoot_capabilities_code_fk" FOREIGN KEY ("capability_code") REFERENCES "admin"."chatwoot_capabilities"("code") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_capability_values_plan_capability_unique" ON "admin"."plan_capability_values" USING btree ("plan_id","capability_code");--> statement-breakpoint

COMMENT ON TABLE "admin"."chatwoot_capabilities" IS 'Catálogo canónico de capacidades de Chatwoot Community v4.19.1 (T2).';--> statement-breakpoint
COMMENT ON TABLE "admin"."plan_capability_values" IS 'Selección de capacidades de Chatwoot por plan; deshabilitadas por defecto (T2).';--> statement-breakpoint
COMMENT ON COLUMN "admin"."plan_capability_values"."enabled" IS 'Derecho comercial del plan; el valor provider_enabled del catálogo es solo metadato.';

-- 5. Least-privilege grants for the new catalog tables (T2, Recovery Unit 2).
-- mocter_migrator receives DDL/seed rights on both tables.
-- mocter_admin receives read-only access to the immutable capability catalog
-- and full CRUD on per-plan capability selections.
GRANT ALL ON TABLE "admin"."chatwoot_capabilities", "admin"."plan_capability_values" TO mocter_migrator;--> statement-breakpoint
GRANT SELECT ON TABLE "admin"."chatwoot_capabilities" TO mocter_admin;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "admin"."plan_capability_values" TO mocter_admin;--> statement-breakpoint

-- 6. Seed Chatwoot Community v4.19.1 capabilities (S5/L15).
-- Provider enabled values come from config/features.yml at tag v4.19.1 and are
-- metadata, never plan entitlements.
INSERT INTO "admin"."chatwoot_capabilities" (
  "code",
  "name",
  "description",
  "provider_code",
  "provider_enabled",
  "provider_flag_group",
  "ownership",
  "commercial_status",
  "requires_runtime_review",
  "catalog_version",
  "notes",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by"
) VALUES
  -- Canales y conexión
  ('channel_email', '{"es":"Canal de correo electrónico","en":"Email Channel"}'::jsonb, '{"es":"Recibir y enviar correos electrónicos como conversaciones.","en":"Receive and send emails as conversations."}'::jsonb, 'channel_email', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('channel_facebook', '{"es":"Canal de Facebook","en":"Facebook Channel"}'::jsonb, '{"es":"Conectar páginas de Facebook Messenger.","en":"Connect Facebook Messenger pages."}'::jsonb, 'channel_facebook', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('channel_instagram', '{"es":"Canal de Instagram","en":"Instagram Channel"}'::jsonb, '{"es":"Conectar cuentas de Instagram Direct.","en":"Connect Instagram Direct accounts."}'::jsonb, 'channel_instagram', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('channel_tiktok', '{"es":"Canal de TikTok","en":"TikTok Channel"}'::jsonb, '{"es":"Conectar cuentas de TikTok.","en":"Connect TikTok accounts."}'::jsonb, 'channel_tiktok', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('channel_website', '{"es":"Canal del sitio web","en":"Website Channel"}'::jsonb, '{"es":"Widget de chat en vivo para sitios web.","en":"Live chat widget for websites."}'::jsonb, 'channel_website', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('inbound_emails', '{"es":"Correos entrantes","en":"Inbound Emails"}'::jsonb, '{"es":"Crear conversaciones desde correos entrantes.","en":"Create conversations from inbound emails."}'::jsonb, 'inbound_emails', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('email_continuity_on_api_channel', '{"es":"Continuidad de correo en canal API","en":"Email Continuity on API Channel"}'::jsonb, '{"es":"Continuar conversaciones por correo desde canales API.","en":"Continue conversations by email from API channels."}'::jsonb, 'email_continuity_on_api_channel', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('whatsapp_embedded_signup_inbox_creation', '{"es":"Incorporación de WhatsApp mediante Embedded Signup","en":"WhatsApp Embedded Signup Flow"}'::jsonb, '{"es":"Crear bandejas de WhatsApp con el flujo de registro integrado.","en":"Create WhatsApp inboxes using the embedded signup flow."}'::jsonb, 'whatsapp_embedded_signup_inbox_creation', false, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('whatsapp_manual_transfer', '{"es":"Transferencia manual de WhatsApp","en":"WhatsApp Manual Transfer"}'::jsonb, '{"es":"Transferir números de WhatsApp manualmente entre bandejas.","en":"Transfer WhatsApp numbers manually between inboxes."}'::jsonb, 'whatsapp_manual_transfer', false, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('channel_whatsapp', '{"es":"Canal de WhatsApp","en":"WhatsApp Channel"}'::jsonb, '{"es":"Habilitar el canal WhatsApp comercialmente en el plan.","en":"Commercially enable the WhatsApp channel in the plan."}'::jsonb, NULL, false, NULL, 'mocter', 'commercial', false, 'v4.19.1', 'Capacidad propia de Mocter; no existe un flag channel_whatsapp en Chatwoot v4.19.1.', now(), now(), 'migration', 'migration'),
  -- Administración y colaboración
  ('agent_management', '{"es":"Gestión de agentes","en":"Agent Management"}'::jsonb, '{"es":"Administrar miembros del equipo de atención.","en":"Manage support team members."}'::jsonb, 'agent_management', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('inbox_management', '{"es":"Gestión de bandejas","en":"Inbox Management"}'::jsonb, '{"es":"Administrar bandejas de entrada.","en":"Manage inboxes."}'::jsonb, 'inbox_management', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('team_management', '{"es":"Gestión de equipos","en":"Team Management"}'::jsonb, '{"es":"Organizar agentes en equipos.","en":"Organize agents into teams."}'::jsonb, 'team_management', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('assignment_v2', '{"es":"Asignación V2","en":"Assignment V2"}'::jsonb, '{"es":"Lógica mejorada de asignación de conversaciones.","en":"Improved conversation assignment logic."}'::jsonb, 'assignment_v2', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  -- Productividad y automatización
  ('agent_bots', '{"es":"Bots de agente","en":"Agent Bots"}'::jsonb, '{"es":"Bots que responden conversaciones.","en":"Bots that reply to conversations."}'::jsonb, 'agent_bots', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('automations', '{"es":"Automatizaciones","en":"Automations"}'::jsonb, '{"es":"Reglas automáticas sobre eventos.","en":"Automatic rules over events."}'::jsonb, 'automations', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('delayed_automations', '{"es":"Automatizaciones diferidas","en":"Delayed Automations"}'::jsonb, '{"es":"Automatizaciones con retardo temporal.","en":"Automations with a time delay."}'::jsonb, 'delayed_automations', false, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('auto_resolve_conversations', '{"es":"Auto resolver conversaciones","en":"Auto Resolve Conversations"}'::jsonb, '{"es":"Cerrar conversaciones inactivas automáticamente.","en":"Automatically close inactive conversations."}'::jsonb, 'auto_resolve_conversations', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('canned_responses', '{"es":"Respuestas enlatadas","en":"Canned Responses"}'::jsonb, '{"es":"Plantillas de respuesta rápida para agentes.","en":"Quick reply templates for agents."}'::jsonb, 'canned_responses', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('macros', '{"es":"Macros","en":"Macros"}'::jsonb, '{"es":"Acciones compuestas sobre conversaciones.","en":"Compound actions over conversations."}'::jsonb, 'macros', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('campaigns', '{"es":"Campañas","en":"Campaigns"}'::jsonb, '{"es":"Campañas de mensajes salientes.","en":"Outbound messaging campaigns."}'::jsonb, 'campaigns', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('voice_recorder', '{"es":"Grabador de voz","en":"Voice Recorder"}'::jsonb, '{"es":"Grabar notas de voz en conversaciones.","en":"Record voice notes in conversations."}'::jsonb, 'voice_recorder', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  -- Contactos y datos
  ('crm', '{"es":"CRM","en":"CRM"}'::jsonb, '{"es":"Gestión básica de relaciones con contactos.","en":"Basic contact relationship management."}'::jsonb, 'crm', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('crm_integration', '{"es":"Integración con CRM","en":"CRM Integration"}'::jsonb, '{"es":"Sincronización con sistemas CRM externos.","en":"Synchronization with external CRM systems."}'::jsonb, 'crm_integration', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('custom_attributes', '{"es":"Atributos personalizados","en":"Custom Attributes"}'::jsonb, '{"es":"Campos personalizados en contactos y conversaciones.","en":"Custom fields on contacts and conversations."}'::jsonb, 'custom_attributes', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('data_import', '{"es":"Importación de datos","en":"Data Import"}'::jsonb, '{"es":"Importar contactos y conversaciones.","en":"Import contacts and conversations."}'::jsonb, 'data_import', false, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('labels', '{"es":"Etiquetas","en":"Labels"}'::jsonb, '{"es":"Clasificar contactos y conversaciones con etiquetas.","en":"Classify contacts and conversations with labels."}'::jsonb, 'labels', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('ip_lookup', '{"es":"Búsqueda por IP","en":"IP Lookup"}'::jsonb, '{"es":"Obtener ubicación aproximada desde la IP del contacto.","en":"Get approximate location from contact IP."}'::jsonb, 'ip_lookup', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('companies', '{"es":"Empresas","en":"Companies"}'::jsonb, '{"es":"Agrupar contactos en cuentas de empresa.","en":"Group contacts into company accounts."}'::jsonb, 'companies', true, 'feature_flags', 'provider', 'unknown', true, 'v4.19.1', 'En v4.19.1 no tiene marcador premium ni interno; se mantiene fuera del catalogo comercial hasta validación operativa.', now(), now(), 'migration', 'migration'),
  -- Integraciones
  ('api_and_webhooks', '{"es":"API y Webhooks","en":"API and Webhooks"}'::jsonb, '{"es":"Permitir al inquilino configurar sus propias integraciones API y webhooks.","en":"Allow the tenant to configure their own API and webhook integrations."}'::jsonb, 'api_and_webhooks', true, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', 'Capacidad comercial para el inquilino; independiente de la integración interna Mocter-Chatwoot.', now(), now(), 'migration', 'migration'),
  ('integrations', '{"es":"Integraciones","en":"Integrations"}'::jsonb, '{"es":"Catálogo de integraciones nativas.","en":"Catalog of native integrations."}'::jsonb, 'integrations', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('linear_integration', '{"es":"Integración con Linear","en":"Linear Integration"}'::jsonb, '{"es":"Integración nativa con Linear.","en":"Native Linear integration."}'::jsonb, 'linear_integration', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('notion_integration', '{"es":"Integración con Notion","en":"Notion Integration"}'::jsonb, '{"es":"Integración nativa con Notion.","en":"Native Notion integration."}'::jsonb, 'notion_integration', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('stripe_integration', '{"es":"Integración con Stripe","en":"Stripe Integration"}'::jsonb, '{"es":"Integración nativa con Stripe.","en":"Native Stripe integration."}'::jsonb, 'stripe_integration', false, 'feature_flags_ext_1', 'provider', 'commercial', false, 'v4.19.1', 'v4.19.1 no marca esta integración como premium ni interna; provider_enabled=false es solo el valor por defecto del proveedor.', now(), now(), 'migration', 'migration'),
  -- Correo y personalización
  ('branded_email_templates', '{"es":"Plantillas de correo con marca","en":"Branded Email Templates"}'::jsonb, '{"es":"Personalizar plantillas de correo con la marca del inquilino.","en":"Customize email templates with tenant branding."}'::jsonb, 'branded_email_templates', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('custom_reply_domain', '{"es":"Dominio de respuesta personalizado","en":"Custom Reply Domain"}'::jsonb, '{"es":"Usar un dominio remitente propio para respuestas.","en":"Use a custom sender domain for replies."}'::jsonb, 'custom_reply_domain', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('custom_reply_email', '{"es":"Correo de respuesta personalizado","en":"Custom Reply Email"}'::jsonb, '{"es":"Usar una dirección de respuesta personalizada.","en":"Use a custom reply email address."}'::jsonb, 'custom_reply_email', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  -- Información y autoservicio
  ('reports', '{"es":"Reportes","en":"Reports"}'::jsonb, '{"es":"Reportes operativos del equipo de atención.","en":"Support team operational reports."}'::jsonb, 'reports', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('report_rollup', '{"es":"Consolidación de reportes","en":"Report Rollup"}'::jsonb, '{"es":"Agregar reportes de múltiples cuentas.","en":"Aggregate reports across multiple accounts."}'::jsonb, 'report_rollup', false, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  ('help_center', '{"es":"Centro de ayuda","en":"Help Center"}'::jsonb, '{"es":"Base de conocimiento pública para el inquilino.","en":"Public knowledge base for the tenant."}'::jsonb, 'help_center', true, 'feature_flags', 'provider', 'commercial', false, 'v4.19.1', NULL, now(), now(), 'migration', 'migration'),
  -- Opciones que requieren tratamiento especial
  ('captain_classifier', '{"es":"Captain Classifier","en":"Captain Classifier"}'::jsonb, '{"es":"Clasificación automática de conversaciones con Captain.","en":"Automatic conversation classification with Captain."}'::jsonb, 'captain_classifier', false, 'feature_flags_ext_1', 'provider', 'unknown', true, 'v4.19.1', 'En v4.19.1 no tiene marcador premium ni interno; se excluye del catálogo comercial hasta validación funcional en Community.', now(), now(), 'migration', 'migration'),
  ('captain_tasks', '{"es":"Captain Tasks","en":"Captain Tasks"}'::jsonb, '{"es":"Tareas automatizadas de Captain.","en":"Automated Captain tasks."}'::jsonb, 'captain_tasks', true, 'feature_flags', 'provider', 'unknown', true, 'v4.19.1', 'Pendiente de validación funcional; no se ofrece hasta confirmar disponibilidad operativa.', now(), now(), 'migration', 'migration'),
  ('chatwoot_v4', '{"es":"Chatwoot V4","en":"Chatwoot V4"}'::jsonb, '{"es":"Flag técnico de la instalación Chatwoot v4.","en":"Technical flag of the Chatwoot v4 installation."}'::jsonb, 'chatwoot_v4', true, 'feature_flags', 'provider', 'technical', false, 'v4.19.1', 'Configuración técnica de la instalación; no es un beneficio comercial del plan.', now(), now(), 'migration', 'migration')
ON CONFLICT ("code") DO NOTHING;

-- DOWN (aplicar manualmente para revertir):
--
-- Este rollback es "fail-closed": aborta ANTES de cualquier cambio destructivo
-- si existen filas UNLIMITED/NULL en plan_limits o si alguna dimensión sembrada
-- sigue referenciada. No convierte UNLIMITED/null a cero y no elimina dimensiones
-- en uso.
--
-- Ejecutar como un solo bloque PL/pgSQL (quitar los prefijos "-- " o copiar
-- el cuerpo del DO block a una herramienta SQL):
--
-- DO $$
-- BEGIN
--   -- Guarda 1: rechazar downgrade mientras haya plan_limits UNLIMITED o NULL.
--   IF EXISTS (
--     SELECT 1 FROM "admin"."plan_limits" WHERE "mode" = 'UNLIMITED' OR "value" IS NULL LIMIT 1
--   ) THEN
--     RAISE EXCEPTION 'Rollback bloqueado: plan_limits contiene filas UNLIMITED o valores NULL. Resuelvalas antes de revertir.';
--   END IF;
--
--   -- Guarda 2: rechazar eliminar dimensiones sembradas que aun esten referenciadas.
--   IF EXISTS (
--     SELECT 1 FROM "admin"."plan_dimensions" d
--     WHERE d."key" IN (
--       'products','images_per_product','videos_per_product','pdfs_per_product',
--       'contacts','tenant_users','storage_bytes','chatwoot_agents',
--       'chatwoot_inboxes','chatwoot_outbound_emails'
--     )
--     AND (
--       EXISTS (SELECT 1 FROM "admin"."plan_limits" l WHERE l."dimension" = d."key")
--       OR EXISTS (SELECT 1 FROM "admin"."client_plan_overrides" o WHERE o."dimension" = d."key")
--     )
--   ) THEN
--     RAISE EXCEPTION 'Rollback bloqueado: dimensiones sembradas estan referenciadas por plan_limits o client_plan_overrides.';
--   END IF;
--
--   -- 1. Eliminar tablas dependientes del catalogo de capacidades.
--   DROP TABLE IF EXISTS "admin"."plan_capability_values";
--   DROP TABLE IF EXISTS "admin"."chatwoot_capabilities";
--
--   -- 2. Eliminar solo las dimensiones sembradas sin referencias
--   --    (la Guarda 2 ya garantiza que ninguna esta en uso).
--   DELETE FROM "admin"."plan_dimensions"
--   WHERE "key" IN (
--     'products','images_per_product','videos_per_product','pdfs_per_product',
--     'contacts','tenant_users','storage_bytes','chatwoot_agents',
--     'chatwoot_inboxes','chatwoot_outbound_emails'
--   )
--   AND "key" NOT IN (
--     SELECT "dimension" FROM "admin"."plan_limits"
--     UNION
--     SELECT "dimension" FROM "admin"."client_plan_overrides"
--   );
--
--   -- 3. Revertir plan_limits al modelo previo de valor finito no nulo.
--   ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_value_check";
--   ALTER TABLE "admin"."plan_limits" ADD CONSTRAINT "plan_limits_value_check" CHECK ("value" >= 0);
--   ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_mode_value_check";
--   ALTER TABLE "admin"."plan_limits" DROP CONSTRAINT IF EXISTS "plan_limits_mode_check";
--   ALTER TABLE "admin"."plan_limits" ALTER COLUMN "value" SET NOT NULL;
--   ALTER TABLE "admin"."plan_limits" DROP COLUMN IF EXISTS "mode";
-- END $$;

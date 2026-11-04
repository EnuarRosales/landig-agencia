import {
  boolean,
  check,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { plans } from "./plans";
import { auditColumns } from "../shared/audit-columns";

/**
 * Versión canónica del catálogo de capacidades de Chatwoot Community.
 *
 * Los códigos, valores por defecto y grupos de flags se obtienen del tag
 * `v4.19.1` de Chatwoot (`config/features.yml`). El valor `provider_enabled`
 * es metadato del proveedor; **no** es un derecho del plan.
 */
export const CHATWOOT_CAPABILITY_CATALOG_VERSION = "v4.19.1" as const;

/**
 * Estado comercial de una capacidad.
 *
 * - `commercial`: puede ofrecerse en planes.
 * - `technical`: configuración de la instalación, no beneficio comercial.
 * - `premium_internal`: premium o interna; fuera del catálogo comercial.
 * - `deprecated`: obsoleta; no debe ofrecerse.
 * - `unknown`: disponibilidad no validada; mantener deshabilitada.
 */
type CommercialStatus =
  | "commercial"
  | "technical"
  | "premium_internal"
  | "deprecated"
  | "unknown";

type Ownership = "provider" | "mocter";

type ProviderFlagGroup = "feature_flags" | "feature_flags_ext_1";

interface ChatwootCapabilityDefinition {
  code: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  providerCode: string | null;
  providerEnabled: boolean;
  providerFlagGroup: ProviderFlagGroup | null;
  providerPremium: boolean;
  providerInternal: boolean;
  providerDeprecated: boolean;
  providerHidden: boolean;
  providerHelpUrl: string | null;
  ownership: Ownership;
  commercialStatus: CommercialStatus;
  requiresRuntimeReview: boolean;
  notes?: string;
}

interface CapabilityOptions {
  providerCode: string | null;
  providerEnabled: boolean;
  providerFlagGroup: ProviderFlagGroup | null;
  providerPremium?: boolean;
  providerInternal?: boolean;
  providerDeprecated?: boolean;
  providerHidden?: boolean;
  providerHelpUrl?: string | null;
  ownership?: Ownership;
  commercialStatus: CommercialStatus;
  requiresRuntimeReview?: boolean;
  notes?: string;
}

const capability = (
  code: string,
  nameEs: string,
  nameEn: string,
  descriptionEs: string,
  descriptionEn: string,
  options: CapabilityOptions,
): ChatwootCapabilityDefinition => ({
  code,
  name: { es: nameEs, en: nameEn },
  description: { es: descriptionEs, en: descriptionEn },
  providerCode: options.providerCode,
  providerEnabled: options.providerEnabled,
  providerFlagGroup: options.providerFlagGroup,
  providerPremium: options.providerPremium ?? false,
  providerInternal: options.providerInternal ?? false,
  providerDeprecated: options.providerDeprecated ?? false,
  providerHidden: options.providerHidden ?? false,
  providerHelpUrl: options.providerHelpUrl ?? null,
  ownership: options.ownership ?? "provider",
  commercialStatus: options.commercialStatus,
  requiresRuntimeReview: options.requiresRuntimeReview ?? false,
  notes: options.notes,
});

/**
 * Catálogo canónico de capacidades de Chatwoot Community v4.19.1.
 *
 * Origen de códigos: `config/features.yml` del tag `v4.19.1`.
 * El canal WhatsApp es propiedad de Mocter porque Chatwoot no expone un flag
 * `channel_whatsapp` único; se representa mediante los flags de Embedded Signup
 * y Transferencia manual.
 */
export const chatwootCapabilityDefinitions: readonly ChatwootCapabilityDefinition[] =
  [
    // Canales y conexión
    capability(
  "channel_email",
  "Canal de correo electrónico",
  "Email Channel",
  "Recibir y enviar correos electrónicos como conversaciones.",
  "Receive and send emails as conversations.",
  {
    providerCode: "channel_email",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/email",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "channel_facebook",
  "Canal de Facebook",
  "Facebook Channel",
  "Conectar páginas de Facebook Messenger.",
  "Connect Facebook Messenger pages.",
  {
    providerCode: "channel_facebook",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/fb",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "channel_instagram",
  "Canal de Instagram",
  "Instagram Channel",
  "Conectar cuentas de Instagram Direct.",
  "Connect Instagram Direct accounts.",
  {
    providerCode: "channel_instagram",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "channel_tiktok",
  "Canal de TikTok",
  "TikTok Channel",
  "Conectar cuentas de TikTok.",
  "Connect TikTok accounts.",
  {
    providerCode: "channel_tiktok",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "channel_website",
  "Canal del sitio web",
  "Website Channel",
  "Widget de chat en vivo para sitios web.",
  "Live chat widget for websites.",
  {
    providerCode: "channel_website",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "inbound_emails",
  "Correos entrantes",
  "Inbound Emails",
  "Crear conversaciones desde correos entrantes.",
  "Create conversations from inbound emails.",
  {
    providerCode: "inbound_emails",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "email_continuity_on_api_channel",
  "Continuidad de correo en canal API",
  "Email Continuity on API Channel",
  "Continuar conversaciones por correo desde canales API.",
  "Continue conversations by email from API channels.",
  {
    providerCode: "email_continuity_on_api_channel",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "whatsapp_embedded_signup_inbox_creation",
  "Incorporación de WhatsApp mediante Embedded Signup",
  "WhatsApp Embedded Signup Flow",
  "Crear bandejas de WhatsApp con el flujo de registro integrado.",
  "Create WhatsApp inboxes using the embedded signup flow.",
  {
    providerCode: "whatsapp_embedded_signup_inbox_creation",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "whatsapp_manual_transfer",
  "Transferencia manual de WhatsApp",
  "WhatsApp Manual Transfer",
  "Transferir números de WhatsApp manualmente entre bandejas.",
  "Transfer WhatsApp numbers manually between inboxes.",
  {
    providerCode: "whatsapp_manual_transfer",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "channel_whatsapp",
  "Canal de WhatsApp",
  "WhatsApp Channel",
  "Habilitar el canal WhatsApp comercialmente en el plan.",
  "Commercially enable the WhatsApp channel in the plan.",
  {
    providerCode: null,
    providerEnabled: false,
    providerFlagGroup: null,
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
    ownership: "mocter",
    notes: "Capacidad propia de Mocter; no existe un flag channel_whatsapp en Chatwoot v4.19.1.",
  },
),

    // Administración y colaboración
    capability(
  "agent_management",
  "Gestión de agentes",
  "Agent Management",
  "Administrar miembros del equipo de atención.",
  "Manage support team members.",
  {
    providerCode: "agent_management",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "inbox_management",
  "Gestión de bandejas",
  "Inbox Management",
  "Administrar bandejas de entrada.",
  "Manage inboxes.",
  {
    providerCode: "inbox_management",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "team_management",
  "Gestión de equipos",
  "Team Management",
  "Organizar agentes en equipos.",
  "Organize agents into teams.",
  {
    providerCode: "team_management",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/teams",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "assignment_v2",
  "Asignación V2",
  "Assignment V2",
  "Lógica mejorada de asignación de conversaciones.",
  "Improved conversation assignment logic.",
  {
    providerCode: "assignment_v2",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),

    // Productividad y automatización
    capability(
  "agent_bots",
  "Bots de agente",
  "Agent Bots",
  "Bots que responden conversaciones.",
  "Bots that reply to conversations.",
  {
    providerCode: "agent_bots",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/agent-bots",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "automations",
  "Automatizaciones",
  "Automations",
  "Reglas automáticas sobre eventos.",
  "Automatic rules over events.",
  {
    providerCode: "automations",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "delayed_automations",
  "Automatizaciones diferidas",
  "Delayed Automations",
  "Automatizaciones con retardo temporal.",
  "Automations with a time delay.",
  {
    providerCode: "delayed_automations",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "auto_resolve_conversations",
  "Auto resolver conversaciones",
  "Auto Resolve Conversations",
  "Cerrar conversaciones inactivas automáticamente.",
  "Automatically close inactive conversations.",
  {
    providerCode: "auto_resolve_conversations",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "canned_responses",
  "Respuestas enlatadas",
  "Canned Responses",
  "Plantillas de respuesta rápida para agentes.",
  "Quick reply templates for agents.",
  {
    providerCode: "canned_responses",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/canned",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "macros",
  "Macros",
  "Macros",
  "Acciones compuestas sobre conversaciones.",
  "Compound actions over conversations.",
  {
    providerCode: "macros",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "campaigns",
  "Campañas",
  "Campaigns",
  "Campañas de mensajes salientes.",
  "Outbound messaging campaigns.",
  {
    providerCode: "campaigns",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/campaigns",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "voice_recorder",
  "Grabador de voz",
  "Voice Recorder",
  "Grabar notas de voz en conversaciones.",
  "Record voice notes in conversations.",
  {
    providerCode: "voice_recorder",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),

    // Contactos y datos
    capability(
  "crm",
  "CRM",
  "CRM",
  "Gestión básica de relaciones con contactos.",
  "Basic contact relationship management.",
  {
    providerCode: "crm",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "crm_integration",
  "Integración con CRM",
  "CRM Integration",
  "Sincronización con sistemas CRM externos.",
  "Synchronization with external CRM systems.",
  {
    providerCode: "crm_integration",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "custom_attributes",
  "Atributos personalizados",
  "Custom Attributes",
  "Campos personalizados en contactos y conversaciones.",
  "Custom fields on contacts and conversations.",
  {
    providerCode: "custom_attributes",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/custom-attributes",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "data_import",
  "Importación de datos",
  "Data Import",
  "Importar contactos y conversaciones.",
  "Import contacts and conversations.",
  {
    providerCode: "data_import",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "labels",
  "Etiquetas",
  "Labels",
  "Clasificar contactos y conversaciones con etiquetas.",
  "Classify contacts and conversations with labels.",
  {
    providerCode: "labels",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/labels",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "ip_lookup",
  "Búsqueda por IP",
  "IP Lookup",
  "Obtener ubicación aproximada desde la IP del contacto.",
  "Get approximate location from contact IP.",
  {
    providerCode: "ip_lookup",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "companies",
  "Empresas",
  "Companies",
  "Agrupar contactos en cuentas de empresa.",
  "Group contacts into company accounts.",
  {
    providerCode: "companies",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "unknown",
    requiresRuntimeReview: true,
    ownership: "provider",
    notes: "Chatwoot v4.19.1 no marca esta capacidad como premium/interna, pero S5 la excluye del catálogo comercial hasta validar su disponibilidad operativa en Community.",
  },
),

    // Integraciones
    capability(
  "api_and_webhooks",
  "API y Webhooks",
  "API and Webhooks",
  "Permitir al inquilino configurar sus propias integraciones API y webhooks.",
  "Allow the tenant to configure their own API and webhook integrations.",
  {
    providerCode: "api_and_webhooks",
    providerEnabled: true,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
    ownership: "provider",
    notes: "Capacidad comercial para el inquilino; independiente de la integración interna Mocter-Chatwoot.",
  },
),
    capability(
  "integrations",
  "Integraciones",
  "Integrations",
  "Catálogo de integraciones nativas.",
  "Catalog of native integrations.",
  {
    providerCode: "integrations",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/integrations",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "linear_integration",
  "Integración con Linear",
  "Linear Integration",
  "Integración nativa con Linear.",
  "Native Linear integration.",
  {
    providerCode: "linear_integration",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "notion_integration",
  "Integración con Notion",
  "Notion Integration",
  "Integración nativa con Notion.",
  "Native Notion integration.",
  {
    providerCode: "notion_integration",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "stripe_integration",
  "Integración con Stripe",
  "Stripe Integration",
  "Integración nativa con Stripe.",
  "Native Stripe integration.",
  {
    providerCode: "stripe_integration",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
    notes: "v4.19.1 no marca esta integración como premium ni interna; provider_enabled=false es solo el valor por defecto del proveedor.",
  },
),

    // Correo y personalización
    capability(
  "branded_email_templates",
  "Plantillas de correo con marca",
  "Branded Email Templates",
  "Personalizar plantillas de correo con la marca del inquilino.",
  "Customize email templates with tenant branding.",
  {
    providerCode: "branded_email_templates",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "custom_reply_domain",
  "Dominio de respuesta personalizado",
  "Custom Reply Domain",
  "Usar un dominio remitente propio para respuestas.",
  "Use a custom sender domain for replies.",
  {
    providerCode: "custom_reply_domain",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "custom_reply_email",
  "Correo de respuesta personalizado",
  "Custom Reply Email",
  "Usar una dirección de respuesta personalizada.",
  "Use a custom reply email address.",
  {
    providerCode: "custom_reply_email",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),

    // Información y autoservicio
    capability(
  "reports",
  "Reportes",
  "Reports",
  "Reportes operativos del equipo de atención.",
  "Support team operational reports.",
  {
    providerCode: "reports",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/reports",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "report_rollup",
  "Consolidación de reportes",
  "Report Rollup",
  "Agregar reportes de múltiples cuentas.",
  "Aggregate reports across multiple accounts.",
  {
    providerCode: "report_rollup",
    providerEnabled: false,
    providerFlagGroup: "feature_flags",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),
    capability(
  "help_center",
  "Centro de ayuda",
  "Help Center",
  "Base de conocimiento pública para el inquilino.",
  "Public knowledge base for the tenant.",
  {
    providerCode: "help_center",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    providerHelpUrl: "https://chwt.app/hc/help-center",
    commercialStatus: "commercial",
    requiresRuntimeReview: false,
  },
),

    // Opciones que requieren tratamiento especial
    capability(
  "captain_classifier",
  "Captain Classifier",
  "Captain Classifier",
  "Clasificación automática de conversaciones con Captain.",
  "Automatic conversation classification with Captain.",
  {
    providerCode: "captain_classifier",
    providerEnabled: false,
    providerFlagGroup: "feature_flags_ext_1",
    commercialStatus: "unknown",
    requiresRuntimeReview: true,
    ownership: "provider",
    notes: "Chatwoot v4.19.1 no marca captain_classifier como premium/interna (el flag premium/interna/deprecated es captain_v1_action_classifier). Se excluye del catálogo comercial hasta validación funcional en Community.",
  },
),
    capability(
  "captain_tasks",
  "Captain Tasks",
  "Captain Tasks",
  "Tareas automatizadas de Captain.",
  "Automated Captain tasks.",
  {
    providerCode: "captain_tasks",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "unknown",
    requiresRuntimeReview: true,
    ownership: "provider",
    notes: "Pendiente de validación funcional; no se ofrece hasta confirmar disponibilidad operativa.",
  },
),
    capability(
  "chatwoot_v4",
  "Chatwoot V4",
  "Chatwoot V4",
  "Flag técnico de la instalación Chatwoot v4.",
  "Technical flag of the Chatwoot v4 installation.",
  {
    providerCode: "chatwoot_v4",
    providerEnabled: true,
    providerFlagGroup: "feature_flags",
    commercialStatus: "technical",
    requiresRuntimeReview: false,
    ownership: "provider",
    notes: "Configuración técnica de la instalación; no es un beneficio comercial del plan.",
  },
),
  ] as const;

export const CHATWOOT_CAPABILITY_CODES = chatwootCapabilityDefinitions.map(
  (capability) => capability.code,
);

export const PROVIDER_CHATWOOT_CAPABILITY_CODES = chatwootCapabilityDefinitions
  .filter((capability) => capability.ownership === "provider")
  .map((capability) => capability.code);

export const COMMERCIAL_CHATWOOT_CAPABILITY_CODES =
  chatwootCapabilityDefinitions
    .filter((capability) => capability.commercialStatus === "commercial")
    .map((capability) => capability.code);

export const NON_COMMERCIAL_CHATWOOT_CAPABILITY_CODES =
  chatwootCapabilityDefinitions
    .filter((capability) => capability.commercialStatus !== "commercial")
    .map((capability) => capability.code);

export const MOCTER_OWNED_CAPABILITY_CODES = chatwootCapabilityDefinitions
  .filter((capability) => capability.ownership === "mocter")
  .map((capability) => capability.code);

/**
 * Catálogo de capacidades de Chatwoot (`admin.chatwoot_capabilities`, T2).
 *
 * Cada fila es un registro canónico de una capacidad del proveedor o de Mocter.
 * No almacena posiciones de bits.
 */
export const chatwootCapabilities = adminSchema.table(
  "chatwoot_capabilities",
  {
    code: text("code").primaryKey(),
    name: jsonb("name").$type<{ es: string; en: string }>().notNull(),
    description: jsonb("description").$type<{
      es: string;
      en: string;
    }>(),
    providerCode: text("provider_code"),
    providerEnabled: boolean("provider_enabled").notNull().default(false),
    providerFlagGroup: text("provider_flag_group"),
    providerPremium: boolean("provider_premium").notNull().default(false),
    providerInternal: boolean("provider_internal").notNull().default(false),
    providerDeprecated: boolean("provider_deprecated").notNull().default(false),
    providerHidden: boolean("provider_hidden").notNull().default(false),
    providerHelpUrl: text("provider_help_url"),
    ownership: text("ownership").notNull().default("provider"),
    commercialStatus: text("commercial_status").notNull().default("commercial"),
    requiresRuntimeReview: boolean("requires_runtime_review")
      .notNull()
      .default(false),
    catalogVersion: text("catalog_version")
      .notNull()
      .default(CHATWOOT_CAPABILITY_CATALOG_VERSION),
    notes: text("notes"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("chatwoot_capabilities_version_provider_code_unique")
      .on(table.catalogVersion, table.providerCode)
      .where(sql`${table.providerCode} IS NOT NULL`),
    check(
      "chatwoot_capabilities_code_check",
      sql.raw("code = lower(code)"),
    ),
    check(
      "chatwoot_capabilities_ownership_check",
      sql.raw("ownership IN ('provider', 'mocter')"),
    ),
    check(
      "chatwoot_capabilities_commercial_status_check",
      sql.raw(
        "commercial_status IN ('commercial', 'technical', 'premium_internal', 'deprecated', 'unknown')",
      ),
    ),
    check(
      "chatwoot_capabilities_provider_code_check",
      sql.raw(
        "(ownership = 'mocter' AND provider_code IS NULL) OR ownership = 'provider'",
      ),
    ),
    check(
      "chatwoot_capabilities_flag_group_check",
      sql.raw(
        "provider_flag_group IS NULL OR provider_flag_group IN ('feature_flags', 'feature_flags_ext_1')",
      ),
    ),
  ],
);

/**
 * Selección de capacidades por plan (`admin.plan_capability_values`, T2).
 *
 * Cada capacidad está deshabilitada por defecto en planes nuevos.
 */
export const planCapabilityValues = adminSchema.table(
  "plan_capability_values",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    capabilityCode: text("capability_code")
      .notNull()
      .references(() => chatwootCapabilities.code, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("plan_capability_values_plan_capability_unique").on(
      table.planId,
      table.capabilityCode,
    ),
  ],
);

export type ChatwootCapability = typeof chatwootCapabilities.$inferSelect;
export type NewChatwootCapability = typeof chatwootCapabilities.$inferInsert;
export type PlanCapabilityValue = typeof planCapabilityValues.$inferSelect;
export type NewPlanCapabilityValue = typeof planCapabilityValues.$inferInsert;

import {
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { cellAdminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Tipo personalizado PostgreSQL para vectores truncados de baja precisión `halfvec(1536)`.
 * Permite búsquedas semánticas y representaciones vectoriales en perfiles y episodios de contacto
 * reduciendo el consumo de memoria y almacenamiento en pgvector (DAT-001 §6.2, CRM-001 §3.4).
 */
const halfvec1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "halfvec(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .filter((v) => v.length > 0)
      .map(Number);
  },
});

/**
 * Maestro autoritativo de prospectos y contactos multicanal en la celda (`admin.contacts`, CRM-001 §3.1, DAT-001 §6.3).
 *
 * Características arquitectónicas:
 * - Persistencia multi-inquilino en celda de datos (`pg-cell-XX`) con aislamiento forzado RLS por `client_id`.
 * - Llave primaria compuesta `(client_id, id)` preservando el identificador UUIDv7 generado.
 * - Índices parciales únicos por inquilino para correlación con Chatwoot, correo electrónico y documento de identidad.
 * - Manejo de supresión por derecho al olvido (Habeas Data Ley 1581) mediante anonimización irreversible y `deleted_at`.
 */
export const cellContacts = cellAdminSchema.table(
  "contacts",
  {
    /** Identificador UUIDv7 del prospecto o contacto. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino propietario del registro en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Nombre completo o razón social del prospecto (obligatorio). */
    fullName: text("full_name").notNull(),
    /** Tipo de documento de identidad oficial. */
    documentType: text("document_type"),
    /** Número de documento de identidad oficial. */
    documentNumber: text("document_number"),
    /** Correo electrónico normalizado en minúsculas. */
    email: text("email"),
    /** Teléfono móvil principal en formato estándar E.164. */
    phoneMobile: text("phone_mobile"),
    /** Teléfono fijo o alterno heredado. */
    phoneLandline: text("phone_landline"),
    /** Teléfono secundario o alterno comercial (SPEC-09). */
    phoneSecondary: text("phone_secondary"),
    /** Estado de verificación E.164 del teléfono móvil principal (SPEC-20). */
    phoneValidationStatus: text("phone_validation_status").notNull().default("unverified"),
    /** Nombre de empresa o razón social asociada al contacto (SPEC-09). */
    companyName: text("company_name"),
    /** Fecha de nacimiento o cumpleaños del contacto (SPEC-09). */
    birthDate: date("birth_date"),
    /** País de residencia o contacto. */
    country: text("country"),
    /** Departamento, estado o región. */
    state: text("state"),
    /** Ciudad o municipio. */
    city: text("city"),
    /** Dirección física o de correspondencia. */
    addressLine: text("address_line"),
    /** Código postal. */
    postalCode: text("postal_code"),
    /** Origen inicial inmutable de captura del prospecto o contacto (SPEC-09). */
    source: text("source").notNull().default("manual"),
    /** Subcanal o medio específico heredado de captura. */
    channel: text("channel"),
    /** Canal preferido de atención priorizando WhatsApp cuando hay móvil (SPEC-09). */
    preferredChannel: text("preferred_channel"),
    /** Último canal omnicanal desde el que interactuó el contacto (SPEC-09). */
    lastChannel: text("last_channel"),
    /** Identificador de contacto correlacionado en la instancia central de Chatwoot. */
    chatwootContactId: integer("chatwoot_contact_id"),
    /** Usuario agente asignado para la atención del prospecto. */
    assignedUserId: uuid("assigned_user_id"),
    /** Etapa en el embudo comercial y de atención. */
    stage: text("stage").notNull().default("new"),
    /** Etiquetas comerciales y operativas asignadas al contacto. */
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Idioma de preferencia del contacto (por defecto 'es'). */
    language: text("language").notNull().default("es"),
    /** Notas y observaciones internas de gestión comercial. */
    notes: text("notes"),
    /** Calificación vigente del contacto entre 1 y 5 estrellas (cache de cabecera, SPEC-09). */
    currentRatingStars: smallint("current_rating_stars"),
    /** Comentario de la calificación vigente del contacto (SPEC-09). */
    currentRatingComment: text("current_rating_comment"),
    /** Marca de tiempo de la primera interacción o contacto. */
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true }),
    /** Marca de tiempo de la interacción o actividad más reciente. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Marca de tiempo del último mensaje entrante del cliente en cualquier canal omnicanal (SPEC-09). */
    lastInboundMessageAt: timestamp("last_inbound_message_at", { withTimezone: true }),
    /** Marca de tiempo del último mensaje entrante por WhatsApp para ventana 24h Meta (SPEC-09). */
    lastWhatsappInboundAt: timestamp("last_whatsapp_inbound_at", { withTimezone: true }),
    /** Marca de tiempo de conversión formal a etapa de cliente (SPEC-09). */
    convertedToCustomerAt: timestamp("converted_to_customer_at", { withTimezone: true }),
    /** Marca de tiempo de baja lógica y anonimización irreversible. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Identidad del usuario o proceso que ejecutó la supresión. */
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({ name: "cell_contacts_pkey", columns: [table.clientId, table.id] }),
    uniqueIndex("contacts_client_cw_contact_unique")
      .on(table.clientId, table.chatwootContactId)
      .where(sql`chatwoot_contact_id IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex("contacts_client_email_unique")
      .on(table.clientId, sql`lower(email)`)
      .where(sql`email IS NOT NULL AND deleted_at IS NULL`),
    uniqueIndex("contacts_client_document_unique")
      .on(table.clientId, table.documentType, table.documentNumber)
      .where(sql`document_number IS NOT NULL AND deleted_at IS NULL`),
    index("contacts_client_phone_mobile_idx")
      .on(table.clientId, table.phoneMobile)
      .where(sql`phone_mobile IS NOT NULL`),
    index("contacts_client_stage_idx").on(table.clientId, table.stage),
    index("contacts_client_last_wa_inbound_idx").on(
      table.clientId,
      table.lastWhatsappInboundAt,
    ),
    index("contacts_client_last_inbound_idx").on(
      table.clientId,
      table.lastInboundMessageAt,
    ),
    check(
      "contacts_document_type_check",
      sql.raw(
        "document_type IS NULL OR document_type IN ('CC', 'NIT', 'CE', 'PASSPORT', 'other')",
      ),
    ),
    check(
      "contacts_source_check",
      sql.raw(
        "source IN ('whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'email', 'sms', 'manual', 'referral', 'import', 'api', 'other')",
      ),
    ),
    check(
      "contacts_stage_check",
      sql.raw(
        "stage IN ('new', 'in_conversation', 'qualified', 'customer', 'discarded')",
      ),
    ),
    check(
      "contacts_current_rating_stars_check",
      sql.raw(
        "current_rating_stars IS NULL OR (current_rating_stars >= 1 AND current_rating_stars <= 5)",
      ),
    ),
    check(
      "contacts_phone_validation_status_check",
      sql.raw(
        "phone_validation_status IN ('verified_e164', 'legacy_unformatted', 'unverified')",
      ),
    ),
  ],
);

/**
 * Registro inmutable y auditable de consentimientos de tratamiento de datos personales (`admin.prospect_consents`, CRM-001 §3.2).
 *
 * Cumplimiento de la Ley 1581 de 2012 (Habeas Data):
 * - Dos propósitos independientes: `data_treatment` (general y soporte) y `commercial_comms` (mensajes comerciales).
 * - Trazabilidad append-only de otorgamiento y revocación con versión exacta de política (`policy_version`).
 * - Evidencia de canal y referencia (`message_id` en WhatsApp interactivo o formulario).
 */
export const cellProspectConsents = cellAdminSchema.table(
  "prospect_consents",
  {
    /** Identificador UUIDv7 del consentimiento. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del prospecto asociado. */
    prospectId: uuid("prospect_id").notNull(),
    /** Propósito específico del consentimiento otorgado o revocado. */
    purpose: text("purpose").notNull(),
    /** Versión del aviso de privacidad vigente al momento de la captura. */
    policyVersion: text("policy_version").notNull(),
    /** Estado del consentimiento. */
    status: text("status").notNull().default("granted"),
    /** Instante de otorgamiento formal del consentimiento. */
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Instante de revocación; nulo mientras el consentimiento continúe vigente. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Canal a través del cual se recolectó el consentimiento. */
    channel: text("channel").notNull().default("whatsapp_buttons"),
    /** Referencia de evidencia técnica (p. ej. message_id en Chatwoot o submission_id). */
    evidenceRef: text("evidence_ref"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_prospect_consents_pkey",
      columns: [table.clientId, table.id],
    }),
    index("prospect_consents_lookup_idx").on(
      table.clientId,
      table.prospectId,
      table.purpose,
    ),
    index("prospect_consents_status_idx").on(table.clientId, table.status),
    check(
      "prospect_consents_purpose_check",
      sql.raw("purpose IN ('data_treatment', 'commercial_comms')"),
    ),
    check(
      "prospect_consents_status_check",
      sql.raw("status IN ('granted', 'revoked')"),
    ),
    check(
      "prospect_consents_channel_check",
      sql.raw(
        "channel IN ('whatsapp_buttons', 'web_form', 'manual', 'import')",
      ),
    ),
  ],
);

/**
 * Catálogo de versiones y redacciones de avisos de privacidad por inquilino (`admin.privacy_notices`, CRM-001 §3.3).
 *
 * Sembrado al provisionar el inquilino con `client_id` no nulo para preservar el aislamiento RLS estricto en celdas.
 * Soporta ciclo de vida formal `draft` -> `in_review` -> `published` -> `retired`.
 */
export const cellPrivacyNotices = cellAdminSchema.table(
  "privacy_notices",
  {
    /** Identificador UUIDv7 del aviso de privacidad. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda (siempre no nulo para consistencia RLS). */
    clientId: uuid("client_id").notNull(),
    /** Código de versión semántica o correlativa (p. ej. '1.0.0'). */
    version: text("version").notNull(),
    /** Idioma de redacción del aviso ('es' o 'en'). */
    locale: text("locale").notNull().default("es"),
    /** Título formal del aviso de privacidad. */
    title: text("title").notNull(),
    /** Contenido completo en Markdown del aviso legal de tratamiento de datos. */
    bodyMarkdown: text("body_markdown").notNull(),
    /** Estado del ciclo de vida editorial del aviso. */
    status: text("status").notNull().default("draft"),
    /** Identificador del usuario que aprobó la revisión legal antes de su publicación. */
    reviewedBy: uuid("reviewed_by"),
    /** Instante en que se completó la revisión legal. */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Instante en que el aviso fue publicado para captura activa. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_privacy_notices_pkey",
      columns: [table.clientId, table.id],
    }),
    uniqueIndex("privacy_notices_version_unique").on(
      table.clientId,
      table.version,
      table.locale,
    ),
    check(
      "privacy_notices_locale_check",
      sql.raw("locale IN ('es', 'en')"),
    ),
    check(
      "privacy_notices_status_check",
      sql.raw("status IN ('draft', 'in_review', 'published', 'retired')"),
    ),
  ],
);

/**
 * Almacén desacoplado de perfiles evolutivos y memorias episódicas de contactos (`admin.contact_memories`, CRM-001 §3.4, DAT-001 §6.3, §6.6).
 *
 * Evita la contención y degradación de índices vectoriales HNSW en `contacts` mediante:
 * - `profile`: Ficha viva 1:1 por contacto con preferencias, segmentación y embedding de intereses.
 * - `episode`: Resúmenes episódicos 1:N derivados de resoluciones en Chatwoot o pedidos en ORD-001.
 */
export const cellContactMemories = cellAdminSchema.table(
  "contact_memories",
  {
    /** Identificador UUIDv7 del registro de memoria. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del contacto asociado. */
    contactId: uuid("contact_id").notNull(),
    /** Tipo de memoria: 'profile' (perfil vivo 1:1) o 'episode' (historial 1:N). */
    kind: text("kind").notNull(),
    /** Contenido textual sintetizado de la memoria o perfil. */
    content: text("content").notNull(),
    /** Metadatos estructurados adicionales (presupuesto, intereses, objeciones). */
    structuredData: jsonb("structured_data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Vector de incrustación semántica `halfvec(1536)` para búsqueda vectorial eficiente. */
    embedding: halfvec1536("embedding"),
    /** Modelo LLM utilizado para generar la incrustación. */
    modelCode: text("model_code").notNull().default("text-embedding-3-small"),
    /** Identificador del evento o conversación que originó la memoria episódica. */
    sourceEventId: text("source_event_id"),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_contact_memories_pkey",
      columns: [table.clientId, table.id],
    }),
    uniqueIndex("contact_memories_profile_unique")
      .on(table.clientId, table.contactId)
      .where(sql`kind = 'profile'`),
    index("contact_memories_by_contact_idx").on(
      table.clientId,
      table.contactId,
      table.kind,
    ),
    check("contact_memories_kind_check", sql.raw("kind IN ('profile', 'episode')")),
  ],
);

/**
 * Historial inmutable de calificaciones comerciales de contactos (`admin.contact_ratings`, SPEC-09 §7.2).
 *
 * Permite registrar evaluaciones de 1 a 5 estrellas con comentario y trazabilidad del agente evaluador
 * sin sobrescribir calificaciones históricas previas.
 */
export const cellContactRatings = cellAdminSchema.table(
  "contact_ratings",
  {
    /** Identificador UUIDv7 de la calificación. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del contacto evaluado. */
    contactId: uuid("contact_id").notNull(),
    /** Puntuación asignada de 1 a 5 estrellas. */
    stars: smallint("stars").notNull(),
    /** Comentario o justificación opcional de la evaluación. */
    comment: text("comment"),
    /** Identificador UUID del usuario evaluador (nulo si proviene de actor automatizado). */
    ratedByUserId: uuid("rated_by_user_id"),
    /** Nombre legible del actor que registró la calificación. */
    ratedByName: text("rated_by_name").notNull(),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_contact_ratings_pkey",
      columns: [table.clientId, table.id],
    }),
    foreignKey({
      name: "contact_ratings_contact_fk",
      columns: [table.clientId, table.contactId],
      foreignColumns: [cellContacts.clientId, cellContacts.id],
    }).onDelete("cascade"),
    index("contact_ratings_by_contact_idx").on(
      table.clientId,
      table.contactId,
      table.createdAt,
    ),
    check("contact_ratings_stars_check", sql.raw("stars >= 1 AND stars <= 5")),
  ],
);

/**
 * Libreta de múltiples direcciones por contacto (`admin.contact_addresses`, SPEC-09 §7.3).
 *
 * Garantiza como máximo una dirección predeterminada (`is_default = true`) por contacto
 * mediante índice único parcial en `(client_id, contact_id)`.
 */
export const cellContactAddresses = cellAdminSchema.table(
  "contact_addresses",
  {
    /** Identificador UUIDv7 de la dirección. */
    id: uuid("id").notNull().default(sql`uuidv7()`),
    /** Identificador del inquilino en la celda. */
    clientId: uuid("client_id").notNull(),
    /** Identificador del contacto propietario de la dirección. */
    contactId: uuid("contact_id").notNull(),
    /** Etiqueta descriptiva de la dirección (p. ej. Casa, Oficina, Bodega). */
    label: text("label").notNull(),
    /** País legible de la dirección. */
    country: text("country").notNull().default("Colombia"),
    /** Código ISO 3166-1 alpha-2 canónico del país (SPEC-20). */
    countryCode: char("country_code", { length: 2 }).notNull().default("CO"),
    /** Departamento, estado o región legible. */
    state: text("state"),
    /** Código ISO 3166-2 de la subdivisión administrativa (SPEC-20). */
    subdivisionCode: varchar("subdivision_code", { length: 16 }),
    /** Ciudad o municipio. */
    city: text("city").notNull(),
    /** Dirección física completa de entrega o correspondencia. */
    addressLine: text("address_line").notNull(),
    /** Complemento estructural del inmueble (apartamento, torre, bloque, conjunto, SPEC-20). */
    addressComplement: text("address_complement"),
    /** Barrio, colonia, sector o localidad opcional. */
    neighborhood: text("neighborhood"),
    /** Código postal opcional. */
    postalCode: text("postal_code"),
    /** Notas o puntos de referencia para entrega. */
    referenceNotes: text("reference_notes"),
    /** Indica si es la dirección principal predeterminada del contacto. */
    isDefault: boolean("is_default").notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    primaryKey({
      name: "cell_contact_addresses_pkey",
      columns: [table.clientId, table.id],
    }),
    foreignKey({
      name: "contact_addresses_contact_fk",
      columns: [table.clientId, table.contactId],
      foreignColumns: [cellContacts.clientId, cellContacts.id],
    }).onDelete("cascade"),
    index("contact_addresses_by_contact_idx").on(table.clientId, table.contactId),
    uniqueIndex("contact_addresses_one_default_per_contact")
      .on(table.clientId, table.contactId)
      .where(sql`is_default = true`),
  ],
);

export type CellContact = typeof cellContacts.$inferSelect;
export type NewCellContact = typeof cellContacts.$inferInsert;
export type CellContactRating = typeof cellContactRatings.$inferSelect;
export type NewCellContactRating = typeof cellContactRatings.$inferInsert;
export type CellContactAddress = typeof cellContactAddresses.$inferSelect;
export type NewCellContactAddress = typeof cellContactAddresses.$inferInsert;
export type CellProspectConsent = typeof cellProspectConsents.$inferSelect;
export type NewCellProspectConsent = typeof cellProspectConsents.$inferInsert;
export type CellPrivacyNotice = typeof cellPrivacyNotices.$inferSelect;
export type NewCellPrivacyNotice = typeof cellPrivacyNotices.$inferInsert;
export type CellContactMemory = typeof cellContactMemories.$inferSelect;
export type NewCellContactMemory = typeof cellContactMemories.$inferInsert;

import {
  boolean,
  check,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Registro transversal de campos asistidos por Inteligencia Artificial (`admin.ai_assist_fields`, AI-001 §3.1).
 *
 * Todo campo de texto libre (textarea) que el inquilino redacte debe estar registrado
 * como campo asistido con su prompt maestro correspondiente (RF-01.1).
 */
export const aiAssistFields = adminSchema.table(
  "ai_assist_fields",
  {
    /** Clave única y estable del campo asistido (ej. 'bot.objective', 'product.description'). */
    fieldKey: text("field_key").primaryKey(),
    /** Entidad del modelo a la que pertenece el campo (ej. 'tenant_bots', 'products'). */
    entity: text("entity").notNull(),
    /** Nombre de la columna física en la base de datos (ej. 'objective', 'description'). */
    columnName: text("column_name").notNull(),
    /** Etiquetas descriptivas del campo para la consola administrativa en formato bilingüe {es, en}. */
    labels: jsonb("labels")
      .$type<{ es: string; en: string }>()
      .notNull(),
    /** Indica si el campo está activo para ofrecer asistencia visual ('Mejorar con AI') en la UI. */
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    check("ai_assist_fields_key_non_empty", sql.raw("length(trim(field_key)) > 0")),
  ],
);

/**
 * Biblioteca de prompts maestros versionados para asistencia en configuración (`admin.ai_assist_prompts`, AI-001 §3.2).
 *
 * Cada versión de un prompt maestro es inmutable y auditable; existe exactamente una versión 'active' por campo.
 */
export const aiAssistPrompts = adminSchema.table(
  "ai_assist_prompts",
  {
    /** Identificador UUIDv7 único del prompt versionado. */
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** Clave del campo asistido al que sirve este prompt maestro. */
    fieldKey: text("field_key")
      .notNull()
      .references(() => aiAssistFields.fieldKey),
    /** Número secuencial de versión para el campo asistido. */
    version: integer("version").notNull().default(1),
    /** Directiva maestra del sistema diseñada específicamente para perfeccionar el contenido de este campo. */
    masterPrompt: text("master_prompt").notNull(),
    /** Sugerencia o placeholder orientativo que guía al inquilino sobre qué escribir como borrador. */
    inputHint: text("input_hint").notNull(),
    /**
     * Reglas estructuradas de salida para la inferencia:
     * longitud máxima, formato permitido, tono o lineamientos estilísticos requeridos.
     */
    outputRules: jsonb("output_rules")
      .$type<{
        maxLength?: number;
        minLength?: number;
        format?: "plain" | "markdown" | "bullet_list";
        tone?: string;
        disallowedTerms?: string[];
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Batería de ejemplos de evaluación (entrada de borrador → sugerencia esperada de calidad) para regresiones. */
    examples: jsonb("examples")
      .$type<Array<{ input: string; output: string; notes?: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Estado del ciclo de vida del prompt: 'draft', 'active' o 'retired'. */
    status: text("status").notNull().default("draft"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("ai_assist_prompts_field_version_unique").on(
      table.fieldKey,
      table.version,
    ),
    check(
      "ai_assist_prompts_status_check",
      sql.raw("status IN ('draft', 'active', 'retired')"),
    ),
  ],
);

export type AiAssistField = typeof aiAssistFields.$inferSelect;
export type NewAiAssistField = typeof aiAssistFields.$inferInsert;
export type AiAssistPrompt = typeof aiAssistPrompts.$inferSelect;
export type NewAiAssistPrompt = typeof aiAssistPrompts.$inferInsert;


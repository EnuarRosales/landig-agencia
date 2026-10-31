import { check, integer, jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Claves canónicas de los bloques de plataforma que componen el prompt (BOT-002 §3).
 */
export const PROMPT_BLOCK_KEYS = [
  "core.identity",
  "core.personality",
  "core.greeting",
  "core.media",
  "core.splits",
  "core.order_flow",
  "core.closing",
  "core.classifier",
  "core.format",
  "core.contact_memory",
] as const;

export type PromptBlockKey = (typeof PROMPT_BLOCK_KEYS)[number];

/**
 * Bloques de prompt de plataforma versionados (`admin.bot_prompt_blocks`, BOT-002 §3, T-02).
 *
 * Solo una versión `active` por `block_key`; el contenido se guarda en es/en.
 */
export const botPromptBlocks = adminSchema.table(
  "bot_prompt_blocks",
  {
    /** Identificador UUIDv7 del bloque versionado. */
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** Clave canónica del bloque dentro de la receta de composición. */
    blockKey: text("block_key").notNull(),
    /** Versión incremental del bloque. */
    version: integer("version").notNull().default(1),
    /** Texto del bloque en ambos idiomas. */
    content: jsonb("content").$type<{ es: string; en: string }>().notNull(),
    /** Estado del ciclo de vida de la versión. */
    status: text("status").notNull().default("draft"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("bot_prompt_blocks_key_version_unique").on(table.blockKey, table.version),
    uniqueIndex("bot_prompt_blocks_one_active_per_key")
      .on(table.blockKey)
      .where(sql`status = 'active'`),
    check(
      "bot_prompt_blocks_key_check",
      sql.raw(`block_key IN (${PROMPT_BLOCK_KEYS.map((k) => `'${k}'`).join(", ")})`),
    ),
    check(
      "bot_prompt_blocks_status_check",
      sql.raw("status IN ('draft', 'active', 'retired')"),
    ),
    check("bot_prompt_blocks_version_check", sql.raw("version >= 1")),
  ],
);

export type BotPromptBlock = typeof botPromptBlocks.$inferSelect;
export type NewBotPromptBlock = typeof botPromptBlocks.$inferInsert;


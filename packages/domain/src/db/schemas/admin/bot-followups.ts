import {
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { clients } from "./clients";
import { tenantBots } from "./bot-tenancy";

/**
 * Secuencias de recordatorios y seguimientos comerciales personalizables por inquilino (`admin.bot_followups`, BOT-001 §4.4, RF-11).
 */
export const botFollowups = adminSchema.table(
  "bot_followups",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    botId: uuid("bot_id").references(() => tenantBots.id),
    name: text("name").notNull(),
    origin: text("origin").notNull().default("tenant_custom"),
    triggerInactivityMinutes: integer("trigger_inactivity_minutes")
      .notNull()
      .default(60),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "bot_followups_origin_check",
      sql.raw("origin IN ('platform_default', 'tenant_custom')"),
    ),
    check(
      "bot_followups_status_check",
      sql.raw("status IN ('draft', 'active', 'paused')"),
    ),
    check(
      "bot_followups_trigger_inactivity_check",
      sql.raw("trigger_inactivity_minutes > 0"),
    ),
  ],
);

/**
 * Pasos ordenados de una secuencia de seguimiento (`admin.bot_followup_steps`, BOT-001 §4.4, RF-11).
 * Máximo 10 pasos por secuencia con intervalo y texto personalizable asistido por AI.
 */
export const botFollowupSteps = adminSchema.table(
  "bot_followup_steps",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    followupId: uuid("followup_id")
      .notNull()
      .references(() => botFollowups.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    message: text("message").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("bot_followup_steps_followup_position_unique").on(
      table.followupId,
      table.position,
    ),
    check(
      "bot_followup_steps_position_check",
      sql.raw("position >= 1 AND position <= 10"),
    ),
    check("bot_followup_steps_delay_check", sql.raw("delay_minutes >= 0")),
  ],
);

/**
 * Estado y trazabilidad de ejecuciones de secuencias de seguimiento (`admin.bot_followup_runs`, BOT-001 §4.4, RF-11.4).
 */
export const botFollowupRuns = adminSchema.table(
  "bot_followup_runs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    followupId: uuid("followup_id")
      .notNull()
      .references(() => botFollowups.id),
    prospectContactId: uuid("prospect_contact_id").notNull(),
    chatwootConversationId: integer("chatwoot_conversation_id").notNull(),
    currentStep: integer("current_step").notNull().default(1),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    stopReason: text("stop_reason"),
    ...auditColumns(),
  },
  (table) => [
    check(
      "bot_followup_runs_status_check",
      sql.raw("status IN ('running', 'completed', 'stopped')"),
    ),
    index("bot_followup_runs_client_status_idx").on(
      table.clientId,
      table.status,
    ),
    index("bot_followup_runs_prospect_idx").on(
      table.clientId,
      table.prospectContactId,
    ),
  ],
);

export type BotFollowup = typeof botFollowups.$inferSelect;
export type NewBotFollowup = typeof botFollowups.$inferInsert;
export type BotFollowupStep = typeof botFollowupSteps.$inferSelect;
export type NewBotFollowupStep = typeof botFollowupSteps.$inferInsert;
export type BotFollowupRun = typeof botFollowupRuns.$inferSelect;
export type NewBotFollowupRun = typeof botFollowupRuns.$inferInsert;


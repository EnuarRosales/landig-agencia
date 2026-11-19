import {
  bigint,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";
import { clients } from "./clients";
import { invoices } from "./billing";

/**
 * Configuración global del programa de referidos (`admin.referral_programs`, REF-001 §3).
 * Modelo A (crédito) unilateral en v1 con toggle activo/pausado y parámetros comerciales configurables.
 */
export const referralPrograms = adminSchema.table(
  "referral_programs",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    name: text("name").notNull(),
    model: varchar("model", { length: 32 }).notNull().default("credit"), // 'credit' | 'cash_discount'
    rewardType: varchar("reward_type", { length: 16 }).notNull().default("fixed"), // 'fixed' | 'percent'
    rewardValue: bigint("reward_value", { mode: "number" }).notNull(), // Monto en centavos si fixed, o porcentaje (ej. 20 para 20%)
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    trigger: varchar("trigger", { length: 32 }).notNull().default("first_paid_invoice"),
    attributionDays: integer("attribution_days").notNull().default(60),
    capReferralsPerReferrer: integer("cap_referrals_per_referrer"), // null = sin tope
    creditValidityDays: integer("credit_validity_days").notNull().default(365),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("active"), // 'draft' | 'active' | 'paused' | 'ended'
    ...auditColumns(),
  },
  (table) => [
    check("ref_programs_model_check", sql.raw("model IN ('credit', 'cash_discount')")),
    check("ref_programs_reward_type_check", sql.raw("reward_type IN ('fixed', 'percent')")),
    check("ref_programs_status_check", sql.raw("status IN ('draft', 'active', 'paused', 'ended')")),
    check("ref_programs_currency_check", sql.raw("currency IN ('COP', 'USD')")),
  ],
);

/**
 * Códigos únicos y enlaces de invitación asignados a cada inquilino (`admin.referral_codes`, REF-001 §3).
 */
export const referralCodes = adminSchema.table(
  "referral_codes",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    code: varchar("code", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("active"), // 'active' | 'inactive'
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("referral_codes_code_unique").on(table.code),
    uniqueIndex("referral_codes_client_unique").on(table.clientId),
    check("referral_codes_status_check", sql.raw("status IN ('active', 'inactive')")),
  ],
);

/**
 * Relación de atribución entre inquilino referente e inquilino referido (`admin.referrals`, REF-001 §3).
 */
export const referrals = adminSchema.table(
  "referrals",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    programId: uuid("program_id")
      .notNull()
      .references(() => referralPrograms.id),
    referrerClientId: uuid("referrer_client_id")
      .notNull()
      .references(() => clients.id),
    referredClientId: uuid("referred_client_id")
      .notNull()
      .references(() => clients.id),
    code: varchar("code", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // 'pending' | 'qualified' | 'rewarded' | 'rejected'
    attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull().defaultNow(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    /** Hash HMAC-SHA256 de la IP de atribución para control antifraude sin almacenar PII (SPEC-16 D-03). */
    attributedIpHash: varchar("attributed_ip_hash", { length: 128 }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("referrals_referred_client_unique").on(table.referredClientId),
    index("referrals_referrer_ip_hash_idx").on(table.referrerClientId, table.attributedIpHash),
    check("referrals_status_check", sql.raw("status IN ('pending', 'qualified', 'rewarded', 'rejected')")),
  ],
);

/**
 * Recompensas y créditos de referidos acumulados por inquilino (`admin.referral_rewards`, REF-001 §3).
 */
export const referralRewards = adminSchema.table(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    referralId: uuid("referral_id")
      .notNull()
      .references(() => referrals.id),
    referrerClientId: uuid("referrer_client_id")
      .notNull()
      .references(() => clients.id),
    model: varchar("model", { length: 32 }).notNull().default("credit"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    remainingCents: bigint("remaining_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    status: varchar("status", { length: 32 }).notNull().default("available"), // 'pending' | 'available' | 'partially_redeemed' | 'redeemed' | 'expired' | 'void'
    creditedAt: timestamp("credited_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    appliedInvoiceId: uuid("applied_invoice_id").references(() => invoices.id),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("referral_rewards_referral_unique").on(table.referralId),
    check(
      "referral_rewards_status_check",
      sql.raw("status IN ('pending', 'available', 'partially_redeemed', 'redeemed', 'expired', 'void')"),
    ),
    check("referral_rewards_currency_check", sql.raw("currency IN ('COP', 'USD')")),
    check("referral_rewards_remaining_non_negative", sql.raw("remaining_cents >= 0")),
  ],
);

/**
 * Ledger normalizado de redenciones de créditos de referidos aplicadas a facturas (`admin.referral_reward_redemptions`, SPEC-16 D-02).
 *
 * Permite imputación FEFO multi-lote (1 factura ↔ N recompensas y 1 recompensa ↔ N facturas)
 * con idempotencia estricta por `(reward_id, invoice_id)`.
 */
export const referralRewardRedemptions = adminSchema.table(
  "referral_reward_redemptions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => referralRewards.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("COP"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("referral_reward_redemptions_reward_invoice_unique").on(
      table.rewardId,
      table.invoiceId,
    ),
    index("referral_reward_redemptions_client_idx").on(table.clientId, table.redeemedAt),
    index("referral_reward_redemptions_invoice_idx").on(table.invoiceId),
    check("referral_reward_redemptions_amount_positive", sql.raw("amount_cents > 0")),
    check("referral_reward_redemptions_currency_check", sql.raw("currency IN ('COP', 'USD')")),
  ],
);

export type ReferralProgram = typeof referralPrograms.$inferSelect;
export type NewReferralProgram = typeof referralPrograms.$inferInsert;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type ReferralReward = typeof referralRewards.$inferSelect;
export type NewReferralReward = typeof referralRewards.$inferInsert;
export type ReferralRewardRedemption = typeof referralRewardRedemptions.$inferSelect;
export type NewReferralRewardRedemption = typeof referralRewardRedemptions.$inferInsert;


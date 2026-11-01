import {
  boolean,
  jsonb,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { clients } from "./clients";
import { auditColumns } from "../shared/audit-columns";

/**
 * Tokens de paleta visual personalizable (DSN-001 Capa 2, WCAG 2.2 AA).
 */
export interface BrandingPaletteTokens {
  primary: string; // Hex color, ej. #3B82F6
  primaryForeground: string; // Hex color, ej. #FFFFFF
  accent?: string;
  accentForeground?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  mutedForeground?: string;
  card?: string;
  cardForeground?: string;
}

/**
 * Configuración de marca blanca por inquilino (`admin.client_brandings`, ADM-001 T-28, RF-15, DSN-001 §7).
 */
export const clientBrandings = adminSchema.table(
  "client_brandings",
  {
    clientId: uuid("client_id")
      .primaryKey()
      .references(() => clients.id, { onDelete: "cascade" }),
    brandName: varchar("brand_name", { length: 120 }),
    logoUrl: text("logo_url"),
    faviconUrl: text("favicon_url"),
    palette: jsonb("palette").$type<BrandingPaletteTokens>(),
    removeMocterBranding: boolean("remove_mocter_branding").notNull().default(false),
    customDomain: varchar("custom_domain", { length: 255 }),
    customFont: varchar("custom_font", { length: 100 }),
    ...auditColumns(),
  },
);

export type ClientBranding = typeof clientBrandings.$inferSelect;
export type NewClientBranding = typeof clientBrandings.$inferInsert;


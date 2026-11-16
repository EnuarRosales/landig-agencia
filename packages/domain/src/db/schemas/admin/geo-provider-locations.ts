import {
  char,
  check,
  index,
  jsonb,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { adminSchema } from "./namespace";
import { auditColumns } from "../shared/audit-columns";

/**
 * Catálogo ACL global de homologación geográfica para operadores logísticos/ERP (`admin.geo_provider_locations`, SPEC-20 §3.1).
 *
 * Mantiene los IDs externos de proveedores como Dropi, Effi y MercadoLibre desacoplados del CRM,
 * mapeándolos hacia ISO 3166-1 alpha-2 e ISO 3166-2 cuando corresponde.
 */
export const geoProviderLocations = adminSchema.table(
  "geo_provider_locations",
  {
    /** Identificador UUIDv7 de la entrada geográfica homologada. */
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /** Proveedor logístico o ERP externo propietario del catálogo (`dropi`, `effi`, `mercadolibre`). */
    provider: text("provider").notNull(),
    /** Código ISO 3166-1 alpha-2 en mayúsculas (ej. `"CO"`, `"AR"`, `"MX"`). */
    countryCode: char("country_code", { length: 2 }).notNull(),
    /** Nivel territorial del registro (`subdivision` o `city`). */
    level: text("level").notNull(),
    /** Identificador externo autoritativo en el proveedor. */
    externalId: text("external_id").notNull(),
    /** Identificador externo del nodo territorial padre (departamento/estado en el proveedor). */
    externalParentId: text("external_parent_id"),
    /** Código ISO 3166-2 equivalente cuando aplica (ej. `"CO-ANT"`). */
    subdivisionCode: varchar("subdivision_code", { length: 16 }),
    /** Código DANE oficial cuando el país/operador lo provee. */
    daneCode: varchar("dane_code", { length: 16 }),
    /** Código postal asociado si el catálogo del operador lo incluye. */
    postalCode: varchar("postal_code", { length: 20 }),
    /** Nombre legible publicado por el proveedor. */
    name: text("name").notNull(),
    /** Nombre normalizado (minúsculas sin diacríticos) para resolución determinística sub-30 ms. */
    normalizedName: text("normalized_name").notNull(),
    /** Alias alternativos o siglas reconocidas en homologación. */
    aliases: jsonb("aliases")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Payload crudo del proveedor conservado exclusivamente dentro de la capa ACL. */
    rawPayload: jsonb("raw_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("geo_provider_locations_provider_country_ext_unique").on(
      table.provider,
      table.countryCode,
      table.level,
      table.externalId,
    ),
    index("geo_provider_locations_lookup_idx").on(
      table.provider,
      table.countryCode,
      table.level,
      table.normalizedName,
    ),
    index("geo_provider_locations_subdivision_idx").on(
      table.provider,
      table.countryCode,
      table.subdivisionCode,
    ),
    check(
      "geo_provider_locations_provider_check",
      sql.raw("provider IN ('dropi', 'effi', 'mercadolibre')"),
    ),
    check(
      "geo_provider_locations_level_check",
      sql.raw("level IN ('subdivision', 'city')"),
    ),
    check(
      "geo_provider_locations_aliases_array_check",
      sql.raw("jsonb_typeof(aliases) = 'array'"),
    ),
    check(
      "geo_provider_locations_raw_payload_object_check",
      sql.raw("jsonb_typeof(raw_payload) = 'object'"),
    ),
  ],
);

export type GeoProviderLocation = typeof geoProviderLocations.$inferSelect;
export type NewGeoProviderLocation = typeof geoProviderLocations.$inferInsert;

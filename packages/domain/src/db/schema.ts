import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tabla `leads`: Almacena las solicitudes públicas recibidas mediante el formulario de demostración y la API REST.
 *
 * Diseñada para PostgreSQL 18 con pgvector. Los identificadores de columnas en la base de datos
 * utilizan `snake_case`, mientras que las propiedades TypeScript mapeadas utilizan `camelCase`.
 *
 * @remarks Esta tabla es la fuente de persistencia principal para la prospección comercial inicial de Mocter.
 */
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Representa un registro de lead completo tal como se recupera o inserta en la tabla {@link leads}.
 */
export type Lead = typeof leads.$inferSelect;

/**
 * Representa los datos requeridos para realizar una nueva inserción en la tabla {@link leads}.
 */
export type NewLead = typeof leads.$inferInsert;

import { customType } from "drizzle-orm/pg-core";

/**
 * Columna `bytea` para hashes, nonces y secretos cifrados (AUTH-001 design §4.1).
 * Drizzle no expone un tipo nativo para `bytea`, por lo que se declara aquí.
 *
 * El valor de la aplicación es un `Buffer`; el driver `postgres` lo devuelve con el mismo tipo.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

import { z } from "zod";

/**
 * Esquema Zod para la validación y sanitización del formulario de solicitud de demo (leads).
 *
 * Aplica restricciones de negocio sobre los datos de contacto:
 * - `name`: Requerido, entre 1 y 120 caracteres.
 * - `email`: Formato de correo electrónico válido.
 * - `phone`: Entre 7 y 20 caracteres con dígitos y caracteres telefónicos estándar (`+`, `-`, `()`, espacios).
 * - `message`: Texto opcional de hasta 2000 caracteres; transforma valores vacíos o indefinidos a `null`.
 *
 * @remarks Utilizado por {@link LeadService} para validar entradas antes de su persistencia.
 */
export const leadSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  email: z.email("Email no válido"),
  phone: z
    .string()
    .min(7)
    .max(20)
    .regex(/^[+0-9][0-9\s+\-()]*$/, "Teléfono no válido"),
  message: z
    .string()
    .max(2000, "El mensaje no puede exceder 2000 caracteres")
    .nullish()
    .transform((message) => message ?? null),
});

/**
 * Representa la estructura fuertemente tipada y validada de un prospecto (lead) listo para persistir.
 * Inferido automáticamente a partir de {@link leadSchema}.
 */
export type LeadInput = z.infer<typeof leadSchema>;

import { z } from "zod";
import { normalizeAndValidatePhoneE164 } from "./geo/index";

/**
 * Esquema Zod para la validación y sanitización del formulario de solicitud de demo (leads).
 *
 * Aplica restricciones de negocio sobre los datos de contacto (`SPEC-20`):
 * - `name`: Requerido, entre 1 y 120 caracteres.
 * - `email`: Formato de correo electrónico válido.
 * - `phone`: Número telefónico internacional válido en formato E.164 estricto (`+<código><número>`).
 * - `message`: Texto opcional de hasta 2000 caracteres; transforma valores vacíos o indefinidos a `null`.
 *
 * @remarks Utilizado por {@link LeadService} para validar entradas antes de su persistencia.
 */
export const leadSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  email: z.email("Email no válido"),
  phone: z
    .string()
    .trim()
    .min(8, "El teléfono debe incluir el indicativo internacional E.164 (ej. +573001234567)")
    .max(20, "Teléfono no válido")
    .superRefine((val, ctx) => {
      const res = normalizeAndValidatePhoneE164({
        rawPhone: val,
        allowLocalWithDefaultCountry: false,
      });
      if (!res.ok) {
        ctx.addIssue({ code: "custom", message: res.error });
      }
    })
    .transform((val) => {
      const res = normalizeAndValidatePhoneE164({
        rawPhone: val,
        allowLocalWithDefaultCountry: false,
      });
      return res.ok ? res.data.e164 : val.trim();
    }),
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

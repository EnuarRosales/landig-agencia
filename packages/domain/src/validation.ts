import { z } from "zod";

/**
 * Input validation for the "Solicitar demo" form.
 *
 * Callers (Server Actions) validate with this schema before persisting:
 * `insertLead` intentionally performs no validation of its own.
 */
export const leadSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(120),
  email: z.email("Email no válido"),
  phone: z
    .string()
    .min(7)
    .max(20)
    // Loose pattern: digits with optional leading +, spaces, hyphens and parentheses.
    .regex(/^[+0-9][0-9\s+\-()]*$/, "Teléfono no válido"),
  message: z
    .string()
    .max(2000, "El mensaje no puede exceder 2000 caracteres")
    .nullish()
    .transform((message) => message ?? null),
});

/** Validated, persistence-ready shape of a lead submission. */
export type LeadInput = z.infer<typeof leadSchema>;

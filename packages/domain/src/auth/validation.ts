import { z } from "zod";

/**
 * Expresión regular para caracteres especiales ASCII estándar (códigos 33-47, 58-64, 91-96, 123-126).
 */
export const ASCII_SPECIAL_REGEX = /[!-\/:-@\[-`{-~]/;

/**
 * Normaliza una dirección de correo electrónico según los estándares de la plataforma (AUTH-001 T-06).
 *
 * Aplica `trim` y conversión a minúsculas sin eliminar `+` ni puntos en la parte local.
 *
 * @param email - Correo electrónico a normalizar.
 * @returns Correo normalizado en minúsculas.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resultado de la validación estructural de una contraseña.
 */
export interface PasswordValidationResult {
  /** Indica si la contraseña cumple con todas las políticas de seguridad. */
  valid: boolean;
  /** Lista de mensajes explicativos en caso de incumplimiento. */
  errors: string[];
}

/**
 * Valida una contraseña contra las políticas de seguridad de Mocter (AUTH-001 T-06).
 *
 * Requisitos:
 * - Longitud entre 7 y 128 caracteres.
 * - Al menos una letra mayúscula [A-Z].
 * - Al menos un dígito numérico [0-9].
 * - Al menos un carácter especial ASCII.
 * - La contraseña no se recorta (`trim`); los espacios en blanco se respetan tal como los ingresa el usuario.
 *
 * @param password - Contraseña en texto claro a evaluar.
 * @returns Estructura {@link PasswordValidationResult} con el dictamen de validación.
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 7) {
    errors.push("La contraseña debe tener al menos 7 caracteres.");
  }

  if (password.length > 128) {
    errors.push("La contraseña no puede exceder 128 caracteres.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("La contraseña debe incluir al menos una letra mayúscula.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("La contraseña debe incluir al menos un número.");
  }

  if (!ASCII_SPECIAL_REGEX.test(password)) {
    errors.push("La contraseña debe incluir al menos un carácter especial ASCII.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Esquema Zod para validación y normalización de correo electrónico de autenticación.
 */
export const authEmailSchema = z
  .string()
  .trim()
  .max(254, "El correo no puede exceder 254 caracteres")
  .email("Correo electrónico no válido")
  .transform((val) => normalizeEmail(val));

/**
 * Esquema Zod para validación estricta de contraseña en API y formularios.
 */
export const authPasswordSchema = z
  .string()
  .min(7, "La contraseña debe tener al menos 7 caracteres.")
  .max(128, "La contraseña no puede exceder 128 caracteres.")
  .refine((val) => /[A-Z]/.test(val), {
    message: "La contraseña debe incluir al menos una letra mayúscula.",
  })
  .refine((val) => /[0-9]/.test(val), {
    message: "La contraseña debe incluir al menos un número.",
  })
  .refine((val) => ASCII_SPECIAL_REGEX.test(val), {
    message: "La contraseña debe incluir al menos un carácter especial ASCII.",
  });

/**
 * Esquema Zod para solicitud de registro nativo de usuario (AUTH-001 T-06, T-08).
 *
 * Requiere consentimiento expreso de tratamiento de datos personales conforme a la
 * Ley 1581 de 2012 (Colombia). Sin autorización, la solicitud es rechazada en origen.
 */
export const registerUserSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  email: authEmailSchema,
  password: authPasswordSchema,
  planCode: z.string().trim().optional(),
  treatmentConsent: z.preprocess(
    (val) => val === true || val === "true" || val === "on" || val === 1,
    z.boolean().refine((val) => val === true, {
      message: "Debe autorizar el tratamiento de datos personales.",
    }),
  ),
  policyVersion: z.string().trim().min(1).default("v1.0"),
  channel: z.string().trim().min(1).default("register_form"),
});

/**
 * Esquema Zod para solicitud de inicio de sesión nativo por credenciales.
 */
export const loginUserSchema = z.object({
  email: authEmailSchema,
  password: z.string().min(1, "La contraseña es requerida"),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;

/**
 * Esquema Zod para solicitud de recuperación de contraseña (AUTH-001 §5.8).
 */
export const forgotPasswordSchema = z.object({
  email: authEmailSchema,
});

/**
 * Esquema Zod para restablecimiento o establecimiento de contraseña mediante token (AUTH-001 §5.8).
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "El token de restablecimiento es requerido"),
  password: authPasswordSchema,
});

/**
 * Esquema Zod para cambio autenticado de contraseña (AUTH-001 §5.8).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es requerida"),
  newPassword: authPasswordSchema,
  totpCode: z
    .string()
    .trim()
    .length(6, "El código TOTP debe tener 6 dígitos")
    .regex(/^\d+$/, "El código TOTP debe contener solo números")
    .optional(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Esquema Zod para solicitud de enrolamiento 2FA (AUTH-001 §5.5).
 */
export const enroll2faSchema = z.object({
  password: z.string().min(1, "La contraseña es requerida").optional(),
});

/**
 * Esquema Zod para confirmación y activación de 2FA (AUTH-001 §5.5).
 */
export const confirm2faSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "El código de verificación debe tener exactamente 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

/**
 * Esquema Zod para desactivación de 2FA (AUTH-001 §5.5).
 */
export const disable2faSchema = z.object({
  password: z.string().min(1, "La contraseña actual es requerida"),
  code: z
    .string()
    .trim()
    .length(6, "El código de verificación debe tener exactamente 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

/**
 * Esquema Zod para resolución de challenge 2FA en login (AUTH-001 §5.5).
 */
export const verify2faChallengeSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "El código de verificación debe tener exactamente 6 dígitos")
    .regex(/^\d{6}$/, "El código de verificación debe ser numérico"),
});

export type Enroll2faInputSchema = z.infer<typeof enroll2faSchema>;
export type Confirm2faInputSchema = z.infer<typeof confirm2faSchema>;
export type Disable2faInputSchema = z.infer<typeof disable2faSchema>;
export type Verify2faChallengeInputSchema = z.infer<typeof verify2faChallengeSchema>;

/**
 * Esquema Zod para inicialización (bootstrap) del primer platform_owner (AUTH-001 T-27).
 */
export const setupOwnerSchema = z.object({
  token: z.string().min(1, "El token de setup es requerido"),
  email: authEmailSchema,
  password: authPasswordSchema,
  name: z.string().trim().min(1, "El nombre es requerido").max(100),
});

export type SetupOwnerInputSchema = z.infer<typeof setupOwnerSchema>;



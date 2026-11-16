import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  CONSENT_PURPOSES,
  CONTACT_CHANNELS,
  CONTACT_DOCUMENT_TYPES,
  CONTACT_SOURCES,
  CONTACT_STAGES,
  normalizeAndValidatePhoneE164,
} from "@mocter/domain";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

function emptyStringToNull(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
}

const optionalTrimmedText = (max: number) =>
  z.preprocess(emptyStringToNull, z.string().trim().max(max).nullable().optional());

const optionalStrictE164Phone = z.preprocess(
  emptyStringToNull,
  z
    .string()
    .trim()
    .max(32)
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
      return res.ok ? res.data.e164 : val;
    })
    .nullable()
    .optional(),
);

export const listContactsQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  q: z.string().trim().max(200).optional(),
  stage: z.enum([...CONTACT_STAGES, "all"]).optional(),
  source: z.enum([...CONTACT_SOURCES, "all"]).optional(),
  channel: z.string().trim().max(64).optional(),
  whatsappWindow: z.enum(["active", "expired", "none", "all"]).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortBy: z
    .enum(["whatsapp_priority", "last_inbound", "rating", "created_at", "full_name"])
    .default("whatsapp_priority"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const createAddressBodySchema = z.object({
  label: z.string().trim().min(1, "La etiqueta de dirección es obligatoria.").max(60),
  country: z.string().trim().min(2, "El país es obligatorio.").max(60).default("Colombia"),
  countryCode: optionalTrimmedText(8),
  state: optionalTrimmedText(120),
  subdivisionCode: optionalTrimmedText(16),
  city: z.string().trim().min(1, "La ciudad es obligatoria.").max(120),
  addressLine: z.string().trim().min(3, "La dirección física es obligatoria.").max(500),
  addressComplement: optionalTrimmedText(255),
  neighborhood: optionalTrimmedText(120),
  postalCode: optionalTrimmedText(20),
  referenceNotes: optionalTrimmedText(500),
  isDefault: z.boolean().optional(),
});

export const updateAddressBodySchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  country: z.string().trim().min(2).max(60).optional(),
  countryCode: optionalTrimmedText(8),
  state: optionalTrimmedText(120),
  subdivisionCode: optionalTrimmedText(16),
  city: z.string().trim().min(1).max(120).optional(),
  addressLine: z.string().trim().min(3).max(500).optional(),
  addressComplement: optionalTrimmedText(255),
  neighborhood: optionalTrimmedText(120),
  postalCode: optionalTrimmedText(20),
  referenceNotes: optionalTrimmedText(500),
  isDefault: z.boolean().optional(),
});

export const createContactBodySchema = z.object({
  fullName: z.string().trim().min(2, "El nombre completo debe tener al menos 2 caracteres.").max(160),
  companyName: optionalTrimmedText(160),
  email: z.preprocess(
    emptyStringToNull,
    z.string().trim().email("Correo electrónico no válido.").max(255).nullable().optional(),
  ),
  phoneMobile: optionalStrictE164Phone,
  phoneSecondary: optionalStrictE164Phone,
  phoneLandline: optionalTrimmedText(32),
  documentType: z.preprocess(
    emptyStringToNull,
    z.enum(CONTACT_DOCUMENT_TYPES).nullable().optional(),
  ),
  documentNumber: optionalTrimmedText(40),
  birthDate: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de nacimiento debe tener formato YYYY-MM-DD.")
      .nullable()
      .optional(),
  ),
  source: z.enum(CONTACT_SOURCES).default("manual"),
  preferredChannel: z.preprocess(
    emptyStringToNull,
    z.enum(CONTACT_CHANNELS).nullable().optional(),
  ),
  stage: z.enum(CONTACT_STAGES).optional(),
  language: z.enum(["es", "en"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: optionalTrimmedText(2000),
  countryCode: optionalTrimmedText(8),
  country: optionalTrimmedText(60),
  subdivisionCode: optionalTrimmedText(16),
  state: optionalTrimmedText(120),
  city: optionalTrimmedText(120),
  addressLine: optionalTrimmedText(500),
  addressComplement: optionalTrimmedText(255),
  postalCode: optionalTrimmedText(20),
  initialAddress: createAddressBodySchema.nullable().optional(),
});

export const updateContactBodySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "El nombre completo debe tener al menos 2 caracteres.")
    .max(160)
    .optional(),
  companyName: optionalTrimmedText(160),
  email: z.preprocess(
    emptyStringToNull,
    z.string().trim().email("Correo electrónico no válido.").max(255).nullable().optional(),
  ),
  phoneMobile: optionalStrictE164Phone,
  phoneSecondary: optionalStrictE164Phone,
  phoneLandline: optionalTrimmedText(32),
  documentType: z.preprocess(
    emptyStringToNull,
    z.enum(CONTACT_DOCUMENT_TYPES).nullable().optional(),
  ),
  documentNumber: optionalTrimmedText(40),
  birthDate: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha de nacimiento debe tener formato YYYY-MM-DD.")
      .nullable()
      .optional(),
  ),
  preferredChannel: z.preprocess(
    emptyStringToNull,
    z.enum(CONTACT_CHANNELS).nullable().optional(),
  ),
  stage: z.enum(CONTACT_STAGES).optional(),
  language: z.enum(["es", "en"]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: optionalTrimmedText(2000),
  countryCode: optionalTrimmedText(8),
  country: optionalTrimmedText(60),
  subdivisionCode: optionalTrimmedText(16),
  state: optionalTrimmedText(120),
  city: optionalTrimmedText(120),
  addressLine: optionalTrimmedText(500),
  addressComplement: optionalTrimmedText(255),
  postalCode: optionalTrimmedText(20),
});

export const rateContactBodySchema = z.object({
  stars: z
    .number()
    .int("La calificación debe ser un número entero.")
    .min(1, "La calificación debe ser entre 1 y 5 estrellas.")
    .max(5, "La calificación debe ser entre 1 y 5 estrellas."),
  comment: optionalTrimmedText(1000),
});

export const updateStageBodySchema = z.object({
  stage: z.enum(CONTACT_STAGES),
  notes: optionalTrimmedText(2000),
});

export const recordConsentBodySchema = z.object({
  purpose: z.enum(CONSENT_PURPOSES),
  channel: z.enum(CONSENT_CHANNELS).default("manual"),
  evidenceRef: optionalTrimmedText(255),
  policyVersion: z.string().trim().min(1).max(32).optional(),
});

/**
 * Extrae o genera un `requestId` estable para correlación de logs y respuestas RFC 9457.
 */
export function resolveRequestId(req: NextRequest): string {
  return req.headers?.get("x-request-id") ?? crypto.randomUUID();
}

/**
 * Construye una respuesta RFC 9457 (`application/problem+json`) consistente con `AGENTS.md §4.14`.
 */
export function problemResponse(
  req: NextRequest,
  requestId: string,
  params: {
    status: number;
    type: string;
    title: string;
    detail: string;
    code?: string;
    issues?: z.ZodIssue[];
  },
): NextResponse {
  return NextResponse.json(
    {
      type: params.type,
      title: params.title,
      status: params.status,
      detail: params.detail,
      instance: req.nextUrl?.pathname ?? "/api/tenant/contacts",
      reference: requestId,
      ...(params.code ? { code: params.code } : {}),
      ...(params.issues ? { issues: params.issues } : {}),
    },
    {
      status: params.status,
      headers: {
        "Content-Type": PROBLEM_CONTENT_TYPE,
        "x-request-id": requestId,
      },
    },
  );
}

/**
 * Traduce códigos de error del dominio CRM a códigos HTTP y cuerpos RFC 9457.
 */
export function mapDomainErrorToProblem(
  req: NextRequest,
  requestId: string,
  res: { error: string; code?: string },
): NextResponse {
  const code = res.code ?? "VALIDATION";

  if (code === "CONFLICT") {
    return problemResponse(req, requestId, {
      status: 409,
      type: "https://mocter.co/errors/contact-conflict",
      title: "Conflict",
      detail: res.error,
      code,
    });
  }

  if (code === "NOT_FOUND") {
    return problemResponse(req, requestId, {
      status: 404,
      type: "https://mocter.co/errors/not-found",
      title: "Not Found",
      detail: res.error,
      code,
    });
  }

  if (code.startsWith("QUOTA_EXCEEDED")) {
    return problemResponse(req, requestId, {
      status: 422,
      type: "https://mocter.co/errors/quota-exceeded",
      title: "Quota Exceeded",
      detail: res.error,
      code,
    });
  }

  if (code === "FORBIDDEN") {
    return problemResponse(req, requestId, {
      status: 403,
      type: "https://mocter.co/errors/forbidden",
      title: "Forbidden",
      detail: res.error,
      code,
    });
  }

  return problemResponse(req, requestId, {
    status: 400,
    type: "https://mocter.co/errors/validation-error",
    title: "Validation Error",
    detail: res.error,
    code,
  });
}

/**
 * Verifica si la sesión autenticada pertenece al propietario del inquilino (`tenant_owner`) para borrado de contactos.
 */
export function canDeleteContacts(context: {
  role?: string | null;
  effectiveRoles?: string[] | null;
}): boolean {
  if (context.role === "tenant_owner") return true;
  if (Array.isArray(context.effectiveRoles) && context.effectiveRoles.includes("tenant_owner")) {
    return true;
  }
  return false;
}

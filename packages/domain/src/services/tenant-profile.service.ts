import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { withTenantCellTransaction } from "../db/cell-client";
import { clients } from "../db/schemas/admin/clients";
import { clientBrandings } from "../db/schemas/admin/client-brandings";
import { auditLog, mediaCatalog } from "../db/schemas/admin/chatwoot-media-onboarding";
import { cellClientBusinessInfo } from "../db/schemas/tenant/tenancy-catalog";
import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import { validateMediaMagicBytes } from "../utils/media-magic-bytes";
import { S3StorageService } from "./s3-storage.service";
import { buildImgproxyUrl } from "./tenant-workspace.service";
import {
  getLocalizedCountryName,
  normalizeAndValidatePhoneE164,
  resolveCountryAlpha2FromInput,
  resolveIsoSubdivision,
} from "../geo/index";

/** Tamaño máximo permitido para logotipo comercial (5 MiB, SPEC-05 RN-SPEC-05-06). */
export const MAX_TENANT_LOGO_BYTES = 5 * 1024 * 1024;

const ALLOWED_LOGO_MIMES = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

const PROFILE_WRITER_ROLES = new Set([
  "tenant_owner",
  "tenancy_owner",
  "platform_owner",
  "platform_admin",
]);

/**
 * Determina si un rol posee privilegios de escritura sobre el perfil del comercio y sus canales de pago.
 */
export function isTenantProfileWriterRole(
  role: string,
  effectiveRoles: string[] = [],
): boolean {
  if (PROFILE_WRITER_ROLES.has(role)) return true;
  return effectiveRoles.some((r) => PROFILE_WRITER_ROLES.has(r));
}

export interface TenantSocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
  youtube?: string;
}

export interface TenantProfileDto {
  id: string;
  slug: string;
  displayName: string;
  commercialEmail: string | null;
  contactEmail: string;
  phone: string | null;
  websiteUrl: string | null;
  locale: "es" | "en";
  currency: string;
  timezone: string;
  countryCode: string | null;
  country: string | null;
  subdivisionCode: string | null;
  state: string | null;
  city: string | null;
  addressLine: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  industry: string | null;
  taxId: string | null;
  logoMediaId: string | null;
  logoResolvedUrl: string | null;
  socialLinks: TenantSocialLinks;
  businessPaymentSummary: string[];
}

export interface ProfileActorContext {
  userId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}

const optionalNullableString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

const optionalWebsiteUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .max(500)
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          return parsed.protocol === "https:" || parsed.protocol === "http:";
        } catch {
          return false;
        }
      },
      { message: "El sitio web debe iniciar con https:// o http:// y tener formato URL válido." },
    )
    .nullable()
    .optional(),
);

const optionalPhoneSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .min(8, "El teléfono debe incluir el indicativo internacional E.164 (ej. +573001234567).")
    .max(20, "El teléfono no puede superar 20 caracteres.")
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
    })
    .nullable()
    .optional(),
);

const optionalSocialEntry = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

/** Esquema Zod autoritativo para actualización de perfil comercial (`SPEC-05 §9.1`). */
export const updateTenantProfileSchema = z.object({
  slug: z.string().trim().optional(),
  displayName: z
    .string()
    .trim()
    .min(2, "El nombre comercial debe tener al menos 2 caracteres.")
    .max(160, "El nombre comercial no puede superar 160 caracteres.")
    .optional(),
  commercialEmail: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .email("El correo comercial no tiene un formato válido.")
      .max(255)
      .nullable()
      .optional(),
  ),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("El correo de contacto/facturación no tiene un formato válido.")
    .max(255)
    .optional(),
  phone: optionalPhoneSchema,
  websiteUrl: optionalWebsiteUrl,
  locale: z.enum(["es", "en"]).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "La moneda debe ser un código ISO de 3 letras (ej. COP, USD).")
    .optional(),
  timezone: z.string().trim().min(2).max(64).optional(),
  countryCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "El código de país debe cumplir el formato ISO alpha-2 (ej. CO, MX, ES).")
      .nullable()
      .optional(),
  ),
  country: optionalNullableString(120),
  subdivisionCode: optionalNullableString(16),
  state: optionalNullableString(120),
  city: optionalNullableString(120),
  addressLine: optionalNullableString(255),
  addressComplement: optionalNullableString(255),
  postalCode: optionalNullableString(32),
  industry: optionalNullableString(120),
  taxId: optionalNullableString(64),
  logoMediaId: z.string().uuid("El identificador de logotipo debe ser UUID válido.").nullable().optional(),
  socialLinks: z
    .object({
      instagram: optionalSocialEntry(255),
      facebook: optionalSocialEntry(255),
      tiktok: optionalSocialEntry(255),
      whatsapp: optionalSocialEntry(64),
      youtube: optionalSocialEntry(255),
    })
    .optional(),
});

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;

export interface StoredClientProfileRow {
  id: string;
  slug: string;
  displayName: string;
  commercialEmail: string | null;
  contactEmail: string;
  phone: string | null;
  websiteUrl: string | null;
  locale: string;
  currency: string;
  timezone: string;
  countryCode: string | null;
  country: string | null;
  subdivisionCode: string | null;
  state: string | null;
  city: string | null;
  addressLine: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  industry: string | null;
  taxId: string | null;
  logoMediaId: string | null;
  socialLinks: Record<string, string>;
}

export interface ITenantProfileRepository {
  getClientById(clientId: string): Promise<StoredClientProfileRow | null>;
  getBrandingLogoUrl(clientId: string): Promise<string | null>;
  getMediaStorageKey(mediaId: string): Promise<string | null>;
  getCellPaymentSummary(clientId: string): Promise<string[]>;
  updateClient(
    clientId: string,
    patch: Partial<{
      displayName: string;
      commercialEmail: string | null;
      contactEmail: string;
      phone: string | null;
      websiteUrl: string | null;
      locale: string;
      currency: string;
      timezone: string;
      countryCode: string | null;
      country: string | null;
      subdivisionCode: string | null;
      state: string | null;
      city: string | null;
      addressLine: string | null;
      addressComplement: string | null;
      postalCode: string | null;
      industry: string | null;
      taxId: string | null;
      logoMediaId: string | null;
      socialLinks: Record<string, string>;
      updatedBy: string;
    }>,
  ): Promise<StoredClientProfileRow | null>;
  upsertLogoMediaCatalog(params: {
    contentHash: string;
    storagePoolId: string;
    storageKey: string;
    sizeBytes: number;
    mimeType: string;
    sourceFormat: string;
    originalFilename: string;
    actor: string;
  }): Promise<{ id: string }>;
  recordAudit(entry: {
    actorUserId: string | null;
    actorRole: string | null;
    action: string;
    entityId: string;
    clientId: string;
    justification: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface ITenantLogoStorage {
  putObject(key: string, body: Buffer, mimeType: string): Promise<Result<{ key: string }>>;
  signLogoUrl(storageKey: string): string;
}

/**
 * Repositorio Drizzle sobre Router Global (`admin.clients`, `admin.media_catalog`, `admin.audit_log`)
 * con lectura resumida opcional en la celda del inquilino.
 */
export class DrizzleTenantProfileRepository implements ITenantProfileRepository {
  async getClientById(clientId: string): Promise<StoredClientProfileRow | null> {
    const db = getDb();
    const [row] = await db
      .select({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        commercialEmail: clients.commercialEmail,
        contactEmail: clients.contactEmail,
        phone: clients.phone,
        websiteUrl: clients.websiteUrl,
        locale: clients.locale,
        currency: clients.currency,
        timezone: clients.timezone,
        countryCode: clients.countryCode,
        country: clients.country,
        subdivisionCode: clients.subdivisionCode,
        state: clients.state,
        city: clients.city,
        addressLine: clients.addressLine,
        addressComplement: clients.addressComplement,
        postalCode: clients.postalCode,
        industry: clients.industry,
        taxId: clients.taxId,
        logoMediaId: clients.logoMediaId,
        socialLinks: clients.socialLinks,
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    return row ?? null;
  }

  async getBrandingLogoUrl(clientId: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db
      .select({ logoUrl: clientBrandings.logoUrl })
      .from(clientBrandings)
      .where(eq(clientBrandings.clientId, clientId))
      .limit(1);
    return row?.logoUrl ?? null;
  }

  async getMediaStorageKey(mediaId: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db
      .select({ storageKey: mediaCatalog.storageKey })
      .from(mediaCatalog)
      .where(eq(mediaCatalog.id, mediaId))
      .limit(1);
    return row?.storageKey ?? null;
  }

  async getCellPaymentSummary(clientId: string): Promise<string[]> {
    try {
      return await withTenantCellTransaction(clientId, async (tx) => {
        const [info] = await tx
          .select({ paymentMethods: cellClientBusinessInfo.paymentMethods })
          .from(cellClientBusinessInfo)
          .where(eq(cellClientBusinessInfo.clientId, clientId))
          .limit(1);
        return (info?.paymentMethods as string[]) ?? [];
      });
    } catch {
      return [];
    }
  }

  async updateClient(
    clientId: string,
    patch: Partial<{
      displayName: string;
      commercialEmail: string | null;
      contactEmail: string;
      phone: string | null;
      websiteUrl: string | null;
      locale: string;
      currency: string;
      timezone: string;
      countryCode: string | null;
      country: string | null;
      subdivisionCode: string | null;
      state: string | null;
      city: string | null;
      addressLine: string | null;
      addressComplement: string | null;
      postalCode: string | null;
      industry: string | null;
      taxId: string | null;
      logoMediaId: string | null;
      socialLinks: Record<string, string>;
      updatedBy: string;
    }>,
  ): Promise<StoredClientProfileRow | null> {
    const db = getDb();
    const [updated] = await db
      .update(clients)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId))
      .returning({
        id: clients.id,
        slug: clients.slug,
        displayName: clients.displayName,
        commercialEmail: clients.commercialEmail,
        contactEmail: clients.contactEmail,
        phone: clients.phone,
        websiteUrl: clients.websiteUrl,
        locale: clients.locale,
        currency: clients.currency,
        timezone: clients.timezone,
        countryCode: clients.countryCode,
        country: clients.country,
        subdivisionCode: clients.subdivisionCode,
        state: clients.state,
        city: clients.city,
        addressLine: clients.addressLine,
        addressComplement: clients.addressComplement,
        postalCode: clients.postalCode,
        industry: clients.industry,
        taxId: clients.taxId,
        logoMediaId: clients.logoMediaId,
        socialLinks: clients.socialLinks,
      });

    return updated ?? null;
  }

  async upsertLogoMediaCatalog(params: {
    contentHash: string;
    storagePoolId: string;
    storageKey: string;
    sizeBytes: number;
    mimeType: string;
    sourceFormat: string;
    originalFilename: string;
    actor: string;
  }): Promise<{ id: string }> {
    const db = getDb();
    const [catItem] = await db
      .insert(mediaCatalog)
      .values({
        contentHash: params.contentHash,
        storagePoolId: params.storagePoolId,
        storageKey: params.storageKey,
        sizeBytes: params.sizeBytes,
        mediaKind: "image",
        mimeType: params.mimeType,
        sourceFormat: params.sourceFormat,
        originalFilename: params.originalFilename,
        processingStatus: "ready",
        storageType: "internal",
        createdBy: params.actor,
        updatedBy: params.actor,
      })
      .onConflictDoUpdate({
        target: [mediaCatalog.contentHash, mediaCatalog.storagePoolId],
        set: {
          updatedAt: new Date(),
          updatedBy: params.actor,
        },
      })
      .returning({ id: mediaCatalog.id });

    if (catItem?.id) {
      return { id: catItem.id };
    }

    const [existing] = await db
      .select({ id: mediaCatalog.id })
      .from(mediaCatalog)
      .where(
        and(
          eq(mediaCatalog.contentHash, params.contentHash),
          eq(mediaCatalog.storagePoolId, params.storagePoolId),
        ),
      )
      .limit(1);

    return { id: existing!.id };
  }

  async recordAudit(entry: {
    actorUserId: string | null;
    actorRole: string | null;
    action: string;
    entityId: string;
    clientId: string;
    justification: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    try {
      const db = getDb();
      await db.insert(auditLog).values({
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: "client",
        entityId: entry.entityId,
        clientId: entry.clientId,
        justification: entry.justification,
        metadata: entry.metadata,
      });
    } catch (auditErr) {
      appLogger.warn("[TenantProfileService] No se pudo persistir auditoría en admin.audit_log", {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }
}

class DefaultTenantLogoStorage implements ITenantLogoStorage {
  private readonly s3 = new S3StorageService();

  async putObject(key: string, body: Buffer, mimeType: string): Promise<Result<{ key: string }>> {
    const res = await this.s3.putObject(key, body, mimeType);
    if (!res.ok) {
      return err(res.error || "Error desconocido en SeaweedFS.", "STORAGE_UNAVAILABLE");
    }
    return ok({ key });
  }

  signLogoUrl(storageKey: string): string {
    return buildImgproxyUrl(storageKey, { width: 256, height: 256, resizingType: "fit" });
  }
}

/**
 * Servicio autoritativo del Perfil Comercial, Identidad Visual básica e Idioma del Comercio (`SPEC-05`).
 *
 * Reglas:
 * - El logotipo comercial está habilitado para TODOS los planes y exento de cuota `storage_bytes`.
 * - Únicamente se permiten imágenes raster (`PNG`, `JPG`, `WEBP`) <= 5 MiB validadas por magic bytes.
 * - `slug` es de solo lectura tras el onboarding para proteger enlaces y QR públicos compartidos.
 */
export class TenantProfileService {
  constructor(
    private readonly repo: ITenantProfileRepository = new DrizzleTenantProfileRepository(),
    private readonly storage: ITenantLogoStorage = new DefaultTenantLogoStorage(),
  ) {}

  private async resolveLogoUrl(row: StoredClientProfileRow): Promise<string | null> {
    const brandingLogo = await this.repo.getBrandingLogoUrl(row.id);
    if (brandingLogo) {
      return brandingLogo;
    }
    if (!row.logoMediaId) {
      return null;
    }
    const storageKey = await this.repo.getMediaStorageKey(row.logoMediaId);
    if (!storageKey) {
      return null;
    }
    try {
      return this.storage.signLogoUrl(storageKey);
    } catch {
      return null;
    }
  }

  private toDto(
    row: StoredClientProfileRow,
    logoResolvedUrl: string | null,
    businessPaymentSummary: string[],
  ): TenantProfileDto {
    const socialLinks: TenantSocialLinks = {};
    if (row.socialLinks && typeof row.socialLinks === "object") {
      if (row.socialLinks.instagram) socialLinks.instagram = row.socialLinks.instagram;
      if (row.socialLinks.facebook) socialLinks.facebook = row.socialLinks.facebook;
      if (row.socialLinks.tiktok) socialLinks.tiktok = row.socialLinks.tiktok;
      if (row.socialLinks.whatsapp) socialLinks.whatsapp = row.socialLinks.whatsapp;
      if (row.socialLinks.youtube) socialLinks.youtube = row.socialLinks.youtube;
    }

    return {
      id: row.id,
      slug: row.slug,
      displayName: row.displayName,
      commercialEmail: row.commercialEmail ?? null,
      contactEmail: row.contactEmail,
      phone: row.phone ?? null,
      websiteUrl: row.websiteUrl ?? null,
      locale: row.locale === "en" ? "en" : "es",
      currency: row.currency,
      timezone: row.timezone,
      countryCode: row.countryCode ?? null,
      country: row.country ?? null,
      subdivisionCode: row.subdivisionCode ?? null,
      state: row.state ?? null,
      city: row.city ?? null,
      addressLine: row.addressLine ?? null,
      addressComplement: row.addressComplement ?? null,
      postalCode: row.postalCode ?? null,
      industry: row.industry ?? null,
      taxId: row.taxId ?? null,
      logoMediaId: row.logoMediaId ?? null,
      logoResolvedUrl,
      socialLinks,
      businessPaymentSummary,
    };
  }

  /**
   * Consulta el perfil comercial consolidado del inquilino (`SPEC-05 §9.1`).
   */
  async getTenantProfile(clientId: string): Promise<Result<TenantProfileDto>> {
    const row = await this.repo.getClientById(clientId);
    if (!row) {
      return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
    }

    const [logoResolvedUrl, businessPaymentSummary] = await Promise.all([
      this.resolveLogoUrl(row),
      this.repo.getCellPaymentSummary(clientId),
    ]);

    return ok(this.toDto(row, logoResolvedUrl, businessPaymentSummary));
  }

  /**
   * Actualiza los atributos comerciales, localización e idioma del comercio (`SPEC-05 §9.1`).
   */
  async updateTenantProfile(
    clientId: string,
    actorRole: string,
    rawInput: unknown,
    actorContext: ProfileActorContext = {},
    effectiveRoles: string[] = [],
  ): Promise<Result<TenantProfileDto>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede modificar el perfil del negocio.",
        "FORBIDDEN",
      );
    }

    const parsed = updateTenantProfileSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return err(firstIssue?.message || "Datos de perfil comercial inválidos.", "VALIDATION_ERROR");
    }

    const current = await this.repo.getClientById(clientId);
    if (!current) {
      return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
    }

    const data = parsed.data;
    if (data.slug !== undefined && data.slug !== current.slug) {
      return err(
        "El identificador público (slug) es de solo lectura después del alta del comercio.",
        "SLUG_READ_ONLY",
      );
    }

    const cleanSocialLinks: Record<string, string> | undefined = data.socialLinks
      ? Object.entries(data.socialLinks).reduce<Record<string, string>>((acc, [key, val]) => {
          if (typeof val === "string" && val.trim().length > 0) {
            acc[key] = val.trim();
          }
          return acc;
        }, {})
      : undefined;

    const patch: Parameters<ITenantProfileRepository["updateClient"]>[1] = {
      updatedBy: actorContext.actorEmail || actorContext.userId || clientId,
    };

    if (data.displayName !== undefined) patch.displayName = data.displayName;
    if (data.commercialEmail !== undefined) patch.commercialEmail = data.commercialEmail;
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.websiteUrl !== undefined) patch.websiteUrl = data.websiteUrl;
    if (data.locale !== undefined) patch.locale = data.locale;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.timezone !== undefined) patch.timezone = data.timezone;

    const effectiveCountryCode =
      data.countryCode !== undefined
        ? data.countryCode
        : data.country !== undefined
          ? resolveCountryAlpha2FromInput(data.country)
          : resolveCountryAlpha2FromInput(current.countryCode ?? current.country);

    if (data.countryCode !== undefined) {
      patch.countryCode = data.countryCode;
      if (data.country === undefined && data.countryCode) {
        const localeForCountry = data.locale ?? (current.locale === "en" ? "en" : "es");
        patch.country = getLocalizedCountryName(data.countryCode, localeForCountry);
      }
    } else if (data.country !== undefined) {
      patch.countryCode = resolveCountryAlpha2FromInput(data.country);
    }
    if (data.country !== undefined) patch.country = data.country;

    if (data.subdivisionCode !== undefined) {
      patch.subdivisionCode = data.subdivisionCode;
      if (data.state === undefined && data.subdivisionCode && effectiveCountryCode) {
        const sub = resolveIsoSubdivision({
          countryCode: effectiveCountryCode,
          input: data.subdivisionCode,
        });
        if (sub.status === "resolved") {
          patch.state = sub.matches[0]?.name ?? data.state ?? null;
        }
      }
    } else if (data.state !== undefined && data.state && effectiveCountryCode) {
      const sub = resolveIsoSubdivision({ countryCode: effectiveCountryCode, input: data.state });
      if (sub.status === "resolved") {
        patch.subdivisionCode = sub.matches[0]?.code ?? null;
      }
    }
    if (data.state !== undefined) patch.state = data.state;
    if (data.city !== undefined) patch.city = data.city;
    if (data.addressLine !== undefined) patch.addressLine = data.addressLine;
    if (data.addressComplement !== undefined) patch.addressComplement = data.addressComplement;
    if (data.postalCode !== undefined) patch.postalCode = data.postalCode;
    if (data.industry !== undefined) patch.industry = data.industry;
    if (data.taxId !== undefined) patch.taxId = data.taxId;
    if (data.logoMediaId !== undefined) patch.logoMediaId = data.logoMediaId;
    if (cleanSocialLinks !== undefined) patch.socialLinks = cleanSocialLinks;

    const updated = await this.repo.updateClient(clientId, patch);
    if (!updated) {
      return err("No fue posible actualizar el comercio.", "CLIENT_NOT_FOUND");
    }

    await this.repo.recordAudit({
      actorUserId: actorContext.userId ?? null,
      actorRole: actorContext.actorRole ?? actorRole,
      action: "tenant.profile.updated",
      entityId: clientId,
      clientId,
      justification: "Actualización de configuración general e identidad del comercio",
      metadata: {
        updatedFields: Object.keys(patch).filter((k) => k !== "updatedBy"),
        localeChanged: data.locale !== undefined && data.locale !== current.locale,
      },
    });

    const [logoResolvedUrl, businessPaymentSummary] = await Promise.all([
      this.resolveLogoUrl(updated),
      this.repo.getCellPaymentSummary(clientId),
    ]);

    return ok(this.toDto(updated, logoResolvedUrl, businessPaymentSummary));
  }

  /**
   * Carga o reemplaza el logotipo comercial en SeaweedFS + imgproxy sin consumir cuota `storage_bytes` (`SPEC-05 RN-SPEC-05-01, RN-SPEC-05-06`).
   */
  async uploadTenantLogo(
    clientId: string,
    actorRole: string,
    file: { buffer: Buffer; mimeType?: string; originalFilename: string },
    actorContext: ProfileActorContext = {},
    effectiveRoles: string[] = [],
  ): Promise<Result<{ logoMediaId: string; logoResolvedUrl: string }>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede actualizar el logotipo.",
        "FORBIDDEN",
      );
    }

    if (file.buffer.byteLength > MAX_TENANT_LOGO_BYTES) {
      return err(
        "El logotipo supera el tamaño máximo permitido de 5 MB.",
        "VALIDATION_ERROR",
      );
    }

    const magic = validateMediaMagicBytes(file.buffer);
    if (!magic.valid || !magic.detectedMime) {
      return err(
        magic.error || "Formato de archivo inválido para logotipo.",
        "VALIDATION_ERROR",
      );
    }

    const ext = ALLOWED_LOGO_MIMES.get(magic.detectedMime);
    if (!ext) {
      return err(
        "El logotipo debe ser una imagen raster en formato PNG, JPG o WEBP.",
        "VALIDATION_ERROR",
      );
    }

    const current = await this.repo.getClientById(clientId);
    if (!current) {
      return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
    }

    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const storagePoolId = "seaweedfs-main";
    const storageKey = `logos/${clientId}/${contentHash}.${ext}`;

    let signedUrl: string;
    try {
      signedUrl = this.storage.signLogoUrl(storageKey);
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : String(signErr);
      return err(`Servicio de transformación de imágenes no disponible: ${msg}`, "STORAGE_UNAVAILABLE");
    }

    const uploadRes = await this.storage.putObject(storageKey, file.buffer, magic.detectedMime);
    if (!uploadRes.ok) {
      return err(`No pudimos almacenar tu logotipo en SeaweedFS: ${uploadRes.error}`, "STORAGE_UNAVAILABLE");
    }

    const actorLabel = actorContext.actorEmail || actorContext.userId || clientId;
    const cat = await this.repo.upsertLogoMediaCatalog({
      contentHash,
      storagePoolId,
      storageKey,
      sizeBytes: file.buffer.byteLength,
      mimeType: magic.detectedMime,
      sourceFormat: ext,
      originalFilename: file.originalFilename || `logo.${ext}`,
      actor: actorLabel,
    });

    await this.repo.updateClient(clientId, {
      logoMediaId: cat.id,
      updatedBy: actorLabel,
    });

    await this.repo.recordAudit({
      actorUserId: actorContext.userId ?? null,
      actorRole: actorContext.actorRole ?? actorRole,
      action: "tenant.profile.logo_updated",
      entityId: clientId,
      clientId,
      justification: "Actualización de logotipo comercial del inquilino",
      metadata: {
        mediaId: cat.id,
        sizeBytes: file.buffer.byteLength,
        mimeType: magic.detectedMime,
      },
    });

    return ok({
      logoMediaId: cat.id,
      logoResolvedUrl: signedUrl,
    });
  }

  /**
   * Elimina la referencia del logotipo comercial restaurando el ícono predeterminado (`SPEC-05 §11(e)`).
   */
  async removeTenantLogo(
    clientId: string,
    actorRole: string,
    actorContext: ProfileActorContext = {},
    effectiveRoles: string[] = [],
  ): Promise<Result<{ logoMediaId: null; logoResolvedUrl: null }>> {
    if (!isTenantProfileWriterRole(actorRole, effectiveRoles)) {
      return err(
        "Permiso denegado: únicamente el propietario del comercio puede quitar el logotipo.",
        "FORBIDDEN",
      );
    }

    const actorLabel = actorContext.actorEmail || actorContext.userId || clientId;
    const updated = await this.repo.updateClient(clientId, {
      logoMediaId: null,
      updatedBy: actorLabel,
    });

    if (!updated) {
      return err("Comercio no encontrado.", "CLIENT_NOT_FOUND");
    }

    await this.repo.recordAudit({
      actorUserId: actorContext.userId ?? null,
      actorRole: actorContext.actorRole ?? actorRole,
      action: "tenant.profile.logo_removed",
      entityId: clientId,
      clientId,
      justification: "Eliminación de logotipo comercial del inquilino",
      metadata: {},
    });

    return ok({ logoMediaId: null, logoResolvedUrl: null });
  }
}

export const tenantProfileService = new TenantProfileService();

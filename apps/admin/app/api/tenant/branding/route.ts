import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ALLOWED_WHITE_LABEL_FONTS,
  getWhiteLabelService,
  WhiteLabelService,
} from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapWhiteLabelDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";

function isSafeBrandingUrl(value: string | null | undefined): boolean {
  if (!value || value.trim().length === 0) return true;
  const trimmed = value.trim();
  if (trimmed.startsWith("/api/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const SafeBrandingUrlSchema = z
  .string()
  .trim()
  .max(1024)
  .refine((val) => isSafeBrandingUrl(val), {
    message: "La URL del activo debe usar esquema http(s) o una ruta interna segura.",
  })
  .nullable()
  .optional();

const PaletteSchema = z.object({
  primary: z.string().trim().min(1),
  primaryForeground: z.string().trim().min(1),
  accent: z.string().trim().optional(),
  accentForeground: z.string().trim().optional(),
  background: z.string().trim().optional(),
  foreground: z.string().trim().optional(),
  muted: z.string().trim().optional(),
  mutedForeground: z.string().trim().optional(),
  card: z.string().trim().optional(),
  cardForeground: z.string().trim().optional(),
});

const UpdateTenantBrandingSchema = z.object({
  brandName: z.string().trim().max(120).nullable().optional(),
  logoUrl: SafeBrandingUrlSchema,
  faviconUrl: SafeBrandingUrlSchema,
  palette: PaletteSchema.nullable().optional(),
  removeMocterBranding: z.boolean().optional(),
  customDomain: z.string().trim().max(255).nullable().optional(),
  customFont: z.string().trim().max(100).nullable().optional(),
});

/**
 * `GET /api/tenant/branding` · Consulta el nivel de marca blanca habilitado por plan/override,
 * la configuración personalizada del comercio y los tokens CSS seguros del backoffice (`SPEC-07`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req);
  const service = getWhiteLabelService();

  const [mode, brandingRes] = await Promise.all([
    service.getCapabilityMode(access.clientId),
    service.getActiveBranding(access.clientId),
  ]);

  if (!brandingRes.ok) {
    return mapWhiteLabelDomainError(req, requestId, brandingRes.error, brandingRes.code);
  }

  const branding = brandingRes.data;
  const tokens = WhiteLabelService.buildBackofficeCssTokens(branding?.palette ?? null);

  return NextResponse.json(
    {
      ok: true,
      data: {
        mode,
        branding,
        tokens,
        allowedFonts: [...ALLOWED_WHITE_LABEL_FONTS],
      },
    },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `PUT /api/tenant/branding` · Actualiza la identidad visual y marca blanca del comercio
 * validando plan vigente (`none` | `paleta` | `completa`), contraste WCAG 2.2 AA, tipografía y FQDN (`SPEC-07`).
 */
export const PUT = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const rawBody = await req.json().catch(() => null);
  const parsed = UpdateTenantBrandingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Validation Error",
      detail:
        parsed.error.issues[0]?.message ||
        "Los datos de personalización de marca blanca no cumplen el esquema esperado.",
      code: "VALIDATION_ERROR",
      typeSlug: "branding-validation-error",
    });
  }

  const service = getWhiteLabelService();
  const mode = await service.getCapabilityMode(access.clientId);
  const res = await service.updateBranding({
    clientId: access.clientId,
    brandName: parsed.data.brandName ?? null,
    logoUrl: parsed.data.logoUrl ?? null,
    faviconUrl: parsed.data.faviconUrl ?? null,
    palette: parsed.data.palette ?? undefined,
    removeMocterBranding: parsed.data.removeMocterBranding ?? false,
    customDomain: parsed.data.customDomain ?? null,
    customFont: parsed.data.customFont ?? null,
  });

  if (!res.ok) {
    return mapWhiteLabelDomainError(req, requestId, res.error, res.code);
  }

  const tokens = WhiteLabelService.buildBackofficeCssTokens(res.data.palette ?? null);

  emitProfileAfterEvent("tenant.branding.updated", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
    mode,
    hasPalette: Boolean(res.data.palette),
    hasCustomDomain: Boolean(res.data.customDomain),
    removeMocterBranding: res.data.removeMocterBranding,
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        mode,
        branding: res.data,
        tokens,
      },
    },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `DELETE /api/tenant/branding` · Restaura los valores visuales predeterminados del sistema
 * eliminando la personalización de marca blanca del comercio (`SPEC-07`).
 */
export const DELETE = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const service = getWhiteLabelService();
  const res = await service.resetToDefault(access.clientId);

  if (!res.ok) {
    return mapWhiteLabelDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.branding.reset", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

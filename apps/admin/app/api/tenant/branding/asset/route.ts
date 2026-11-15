import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getWhiteLabelService,
  S3StorageService,
  tenantProfileService,
} from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapProfileDomainError,
  mapWhiteLabelDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_FAVICON_BYTES = 1 * 1024 * 1024;
const FAVICON_KEY_REGEX =
  /^branding\/([0-9a-f-]{36})\/favicon-[0-9a-f]{12,64}\.(ico|png|svg)$/i;

const MIME_BY_EXT: Record<string, string> = {
  ico: "image/x-icon",
  png: "image/png",
  svg: "image/svg+xml",
};

function detectFaviconFormat(
  buffer: Buffer,
): { ok: true; ext: "png" | "ico" | "svg"; mime: string } | { ok: false; reason: string } {
  if (buffer.byteLength === 0) {
    return { ok: false, reason: "El archivo de favicon está vacío." };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ok: true, ext: "png", mime: "image/png" };
  }

  // ICO: 00 00 01 00
  if (
    buffer.byteLength >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return { ok: true, ext: "ico", mime: "image/x-icon" };
  }

  // SVG: XML/UTF-8 seguro sin scripts ni manejadores inline
  const text = buffer.toString("utf8").trim();
  const normalizedLower = text.toLowerCase();
  if (
    (normalizedLower.startsWith("<svg") ||
      (normalizedLower.startsWith("<?xml") && normalizedLower.includes("<svg"))) &&
    normalizedLower.includes("</svg>")
  ) {
    const unsafePatterns = [
      /<script\b/i,
      /\bon[a-z]+\s*=/i,
      /javascript:/i,
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i,
      /<foreignobject\b/i,
    ];
    if (unsafePatterns.some((re) => re.test(text))) {
      return {
        ok: false,
        reason: "El archivo SVG contiene elementos activos o atributos no permitidos por seguridad.",
      };
    }
    return { ok: true, ext: "svg", mime: "image/svg+xml" };
  }

  return {
    ok: false,
    reason: "Formato de favicon no admitido. Usa PNG, ICO o SVG válido.",
  };
}

/**
 * `GET /api/tenant/branding/asset?key=...` · Sirve de forma autenticada y aislada por comercio
 * los favicons almacenados en SeaweedFS (`SPEC-07 D-SPEC-07-03`).
 */
export const GET = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req);
  const key = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  const match = FAVICON_KEY_REGEX.exec(key);

  if (!match) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Asset Key",
      detail: "La referencia del activo visual es inválida.",
      code: "INVALID_ASSET_KEY",
      typeSlug: "invalid-asset-key",
    });
  }

  const keyClientId = match[1];
  const ext = match[2].toLowerCase();
  if (keyClientId !== access.clientId) {
    return profileProblemResponse({
      req,
      requestId,
      status: 403,
      title: "Forbidden",
      detail: "No tienes permisos para acceder a activos visuales de otro comercio.",
      code: "FORBIDDEN_ASSET_ACCESS",
      typeSlug: "forbidden-asset-access",
    });
  }

  const s3 = new S3StorageService();
  const objRes = await s3.getObject(key);
  if (!objRes.ok) {
    const status = objRes.status === 404 ? 404 : 502;
    return profileProblemResponse({
      req,
      requestId,
      status,
      title: status === 404 ? "Asset Not Found" : "Storage Unavailable",
      detail: "No fue posible recuperar el activo de marca blanca.",
      code: status === 404 ? "ASSET_NOT_FOUND" : "MEDIA_STORAGE_UNAVAILABLE",
      typeSlug: "branding-asset-error",
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": MIME_BY_EXT[ext] || objRes.contentType || "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "x-request-id": requestId,
  };
  if (ext === "svg") {
    headers["Content-Security-Policy"] =
      "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new NextResponse(new Uint8Array(objRes.buffer), {
    status: 200,
    headers,
  });
});

/**
 * `POST /api/tenant/branding/asset` · Carga directa multipart de logotipo o favicon Enterprise
 * hacia SeaweedFS + imgproxy sincronizando `clients.logo_media_id` y `client_brandings` (`SPEC-07 D-SPEC-07-03`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const service = getWhiteLabelService();
  const mode = await service.getCapabilityMode(access.clientId);
  if (mode === "none") {
    return mapWhiteLabelDomainError(
      req,
      requestId,
      "Tu plan actual no incluye personalización de marca blanca.",
      "FORBIDDEN_WHITE_LABEL_NOT_IN_PLAN",
    );
  }
  if (mode !== "completa") {
    return mapWhiteLabelDomainError(
      req,
      requestId,
      "La carga directa de activos de marca blanca requiere un plan con marca blanca completa.",
      "FORBIDDEN_FULL_WHITE_LABEL_REQUIRED",
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Form Data",
      detail: "La solicitud debe enviarse como multipart/form-data válido.",
      code: "INVALID_FORM_DATA",
      typeSlug: "invalid-form-data",
    });
  }

  const kindRaw = formData.get("kind");
  const kind = typeof kindRaw === "string" ? kindRaw.trim().toLowerCase() : "";
  if (kind !== "logo" && kind !== "favicon") {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Asset Kind",
      detail: "El parámetro 'kind' debe ser 'logo' o 'favicon'.",
      code: "INVALID_ASSET_KIND",
      typeSlug: "invalid-asset-kind",
    });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Missing File",
      detail: "Debes adjuntar el archivo de imagen en el campo 'file'.",
      code: "MISSING_FILE",
      typeSlug: "missing-file",
    });
  }

  const blob = file as Blob;
  const maxBytes = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
  if (blob.size > maxBytes) {
    return profileProblemResponse({
      req,
      requestId,
      status: 422,
      title: "File Too Large",
      detail:
        kind === "logo"
          ? "El logotipo de marca blanca no puede superar 2 MB."
          : "El favicon no puede superar 1 MB.",
      code: "MEDIA_TOO_LARGE",
      typeSlug: "media-too-large",
    });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const originalFilename =
    file instanceof File && file.name ? file.name : `${kind}.png`;

  const currentRes = await service.getActiveBranding(access.clientId);
  const current = currentRes.ok ? currentRes.data : null;

  if (kind === "logo") {
    const uploadRes = await tenantProfileService.uploadTenantLogo(
      access.clientId,
      access.context.role,
      {
        buffer,
        mimeType: blob.type || "image/png",
        originalFilename,
      },
      {
        userId: access.context.user.id,
        actorEmail: access.context.user.email,
        actorRole: access.context.role,
      },
      access.context.effectiveRoles,
    );

    if (!uploadRes.ok) {
      return mapProfileDomainError(req, requestId, uploadRes.error, uploadRes.code);
    }

    const saveRes = await service.updateBranding({
      clientId: access.clientId,
      brandName: current?.brandName ?? null,
      logoUrl: uploadRes.data.logoResolvedUrl,
      faviconUrl: current?.faviconUrl ?? null,
      palette: current?.palette ?? undefined,
      removeMocterBranding: current?.removeMocterBranding ?? false,
      customDomain: current?.customDomain ?? null,
      customFont: current?.customFont ?? null,
    });

    if (!saveRes.ok) {
      return mapWhiteLabelDomainError(req, requestId, saveRes.error, saveRes.code);
    }

    emitProfileAfterEvent("tenant.branding.asset_uploaded", {
      requestId,
      clientId: access.clientId,
      actor: access.actor,
      kind: "logo",
      mediaId: uploadRes.data.logoMediaId,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          kind: "logo",
          url: uploadRes.data.logoResolvedUrl,
          mediaId: uploadRes.data.logoMediaId,
        },
      },
      { status: 200, headers: { "x-request-id": requestId } },
    );
  }

  // kind === "favicon"
  const detected = detectFaviconFormat(buffer);
  if (!detected.ok) {
    return profileProblemResponse({
      req,
      requestId,
      status: 422,
      title: "Unsupported Media Format",
      detail: detected.reason,
      code: "UNSUPPORTED_MEDIA_FORMAT",
      typeSlug: "unsupported-media-format",
    });
  }

  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const storageKey = `branding/${access.clientId}/favicon-${hash}.${detected.ext}`;

  const s3 = new S3StorageService();
  const putRes = await s3.putObject(storageKey, buffer, detected.mime);
  if (!putRes.ok) {
    return profileProblemResponse({
      req,
      requestId,
      status: 503,
      title: "Media Storage Unavailable",
      detail: "No fue posible almacenar el favicon en el repositorio multimedia.",
      code: "MEDIA_STORAGE_UNAVAILABLE",
      typeSlug: "media-storage-unavailable",
    });
  }

  const faviconUrl = `/api/tenant/branding/asset?key=${encodeURIComponent(storageKey)}`;
  const saveRes = await service.updateBranding({
    clientId: access.clientId,
    brandName: current?.brandName ?? null,
    logoUrl: current?.logoUrl ?? null,
    faviconUrl,
    palette: current?.palette ?? undefined,
    removeMocterBranding: current?.removeMocterBranding ?? false,
    customDomain: current?.customDomain ?? null,
    customFont: current?.customFont ?? null,
  });

  if (!saveRes.ok) {
    return mapWhiteLabelDomainError(req, requestId, saveRes.error, saveRes.code);
  }

  emitProfileAfterEvent("tenant.branding.asset_uploaded", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
    kind: "favicon",
    storageKey,
    format: detected.ext,
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        kind: "favicon",
        url: faviconUrl,
        storageKey,
      },
    },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

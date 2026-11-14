import { NextRequest, NextResponse } from "next/server";
import { tenantProfileService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  emitProfileAfterEvent,
  mapProfileDomainError,
  profileProblemResponse,
  requireTenantProfileAccess,
} from "@/lib/tenant-profile-http";

/**
 * `POST /api/tenant/profile/logo` · Sube o reemplaza el logotipo comercial en SeaweedFS + imgproxy
 * disponible para todos los planes y exento de cuota `storage_bytes` (`SPEC-05 §9.1.1`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Invalid Form Data",
      detail: "Se requiere un cuerpo multipart/form-data válido.",
      code: "INVALID_FORM_DATA",
      typeSlug: "invalid-form-data",
    });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return profileProblemResponse({
      req,
      requestId,
      status: 400,
      title: "Missing File",
      detail: "El campo 'file' es obligatorio para cargar el logotipo.",
      code: "MISSING_FILE",
      typeSlug: "missing-file",
    });
  }

  const blob = file as Blob;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const originalFilename = file instanceof File && file.name ? file.name : "logo.png";

  const res = await tenantProfileService.uploadTenantLogo(
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

  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.profile.updated", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
    action: "logo_uploaded",
    logoMediaId: res.data.logoMediaId,
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

/**
 * `DELETE /api/tenant/profile/logo` · Quita el logotipo personalizado restaurando el ícono predeterminado (`SPEC-05 §9.1.1`).
 */
export const DELETE = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const access = await requireTenantProfileAccess(req, { requireOwner: true });

  const res = await tenantProfileService.removeTenantLogo(
    access.clientId,
    access.context.role,
    {
      userId: access.context.user.id,
      actorEmail: access.context.user.email,
      actorRole: access.context.role,
    },
    access.context.effectiveRoles,
  );

  if (!res.ok) {
    return mapProfileDomainError(req, requestId, res.error, res.code);
  }

  emitProfileAfterEvent("tenant.profile.updated", {
    requestId,
    clientId: access.clientId,
    actor: access.actor,
    action: "logo_removed",
  });

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

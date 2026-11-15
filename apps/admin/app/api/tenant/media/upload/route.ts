import { NextRequest, NextResponse } from "next/server";
import { appLogger, getTenantProductsAndMediaService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  mapDomainErrorToProblem,
  problemResponse,
  resolveRequestId,
} from "@/app/api/tenant/products/_shared";

/**
 * `POST /api/tenant/media/upload` — Carga multimodal segura hacia SeaweedFS con cuotas y validación de magic bytes (`SPEC-08 D-04`).
 */
export const POST = handle(async (req: NextRequest) => {
  const startedAt = Date.now();
  const requestId = resolveRequestId(req);

  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/invalid-form-data",
      title: "Invalid Form Data",
      detail: "Se requiere un cuerpo multipart/form-data válido.",
    });
  }

  const file = formData.get("file");
  const productId = formData.get("productId");
  const altTextRaw = formData.get("altText");
  const setAsCoverRaw = formData.get("setAsCover");

  if (!file || typeof file === "string") {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/missing-file",
      title: "Missing File",
      detail: "El campo 'file' es obligatorio y debe ser un archivo binario.",
    });
  }

  if (!productId || typeof productId !== "string" || !productId.trim()) {
    return problemResponse(req, requestId, {
      status: 400,
      type: "https://mocter.co/errors/missing-product-id",
      title: "Missing Product ID",
      detail: "El parámetro 'productId' es obligatorio para vincular el archivo al catálogo.",
    });
  }

  const blob = file as Blob;
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = blob.type || "application/octet-stream";
  const originalFilename = file instanceof File && file.name ? file.name : "archivo.bin";
  const altText =
    typeof altTextRaw === "string" && altTextRaw.trim().length > 0 ? altTextRaw.trim() : undefined;
  const setAsCover =
    typeof setAsCoverRaw === "string" &&
    (setAsCoverRaw.toLowerCase() === "true" || setAsCoverRaw === "1");

  const actor = auth.context.user?.email || auth.clientId;
  const service = getTenantProductsAndMediaService();
  const uploadRes = await service.uploadAndAttachProductMedia(
    auth.clientId,
    productId.trim(),
    {
      buffer,
      mimeType,
      originalFilename,
    },
    actor,
    {
      altText,
      setAsCover,
    },
  );

  if (!uploadRes.ok) {
    appLogger.warn("[POST /api/tenant/media/upload] Carga rechazada", {
      requestId,
      clientId: auth.clientId,
      productId: productId.trim(),
      code: uploadRes.code,
      sizeBytes: buffer.byteLength,
      latencyMs: Date.now() - startedAt,
    });
    return mapDomainErrorToProblem(req, requestId, uploadRes);
  }

  appLogger.info("[POST /api/tenant/media/upload] Multimedia almacenado", {
    requestId,
    clientId: auth.clientId,
    productId: productId.trim(),
    mediaId: uploadRes.data.mediaId,
    mediaKind: uploadRes.data.mediaKind,
    sizeBytes: uploadRes.data.sizeBytes,
    latencyMs: Date.now() - startedAt,
  });

  return NextResponse.json(
    { ok: true, data: uploadRes.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});

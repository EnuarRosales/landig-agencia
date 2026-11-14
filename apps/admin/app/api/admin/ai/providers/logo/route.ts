import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appLogger, uploadAdminAiProviderLogo } from "@mocter/domain";
import { handle } from "@/lib/errors/route";

const PROBLEM_HEADERS = { "Content-Type": "application/problem+json" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function logoProblem(params: {
  status: number;
  type: string;
  title: string;
  detail: string;
  code: string;
  instance: string;
  requestId: string;
}): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      type: params.type,
      title: params.title,
      status: params.status,
      detail: params.detail,
      error: params.detail,
      code: params.code,
      instance: params.instance,
      reference: params.requestId,
    },
    {
      status: params.status,
      headers: {
        ...PROBLEM_HEADERS,
        "x-request-id": params.requestId,
      },
    },
  );
}

/**
 * Sube un logotipo de proveedor LLM (PNG, JPEG, WebP o AVIF, <= 2 MB) a SeaweedFS validando magic bytes (`SPEC-02 Fase 2`).
 */
export const POST = handle(async (req: NextRequest) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return logoProblem({
      status: 400,
      type: "https://mocter.co/errors/invalid-multipart",
      title: "Invalid Multipart Body",
      detail: "La petición debe enviarse en formato multipart/form-data con un campo 'file'.",
      code: "VALIDATION_ERROR",
      instance: req.nextUrl.pathname,
      requestId,
    });
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return logoProblem({
      status: 400,
      type: "https://mocter.co/errors/media-missing",
      title: "Logo File Required",
      detail: "Debes adjuntar un archivo de imagen en el campo 'file'.",
      code: "MEDIA_MISSING",
      instance: req.nextUrl.pathname,
      requestId,
    });
  }

  if (fileEntry.size > MAX_LOGO_BYTES) {
    return logoProblem({
      status: 422,
      type: "https://mocter.co/errors/media-too-large",
      title: "Logo Too Large",
      detail: "El logo del proveedor no puede superar los 2 MB.",
      code: "MEDIA_TOO_LARGE",
      instance: req.nextUrl.pathname,
      requestId,
    });
  }

  const providerCodeRaw = formData.get("providerCode");
  const providerCode =
    typeof providerCodeRaw === "string" ? providerCodeRaw.trim() : undefined;

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const uploadResult = await uploadAdminAiProviderLogo({
    fileBuffer: buffer,
    originalFilename: fileEntry.name || "logo.png",
    providerCode,
  });

  if (!uploadResult.ok) {
    const code = uploadResult.code ?? "MEDIA_VALIDATION_FAILED";
    const status =
      code === "MEDIA_STORAGE_UNAVAILABLE"
        ? 503
        : code === "MEDIA_TOO_LARGE" || code === "UNSUPPORTED_MEDIA_FORMAT"
          ? 422
          : 400;

    return logoProblem({
      status,
      type:
        status === 503
          ? "https://mocter.co/errors/media-storage-unavailable"
          : "https://mocter.co/errors/media-validation-failed",
      title: status === 503 ? "Service Unavailable" : "Media Validation Failed",
      detail: uploadResult.error,
      code,
      instance: req.nextUrl.pathname,
      requestId,
    });
  }

  appLogger.info("admin.ai.provider_logo.uploaded", {
    requestId,
    providerCode: providerCode ?? null,
    storageKey: uploadResult.data.storageKey,
    format: uploadResult.data.format,
    sizeBytes: uploadResult.data.sizeBytes,
  });

  return NextResponse.json(
    { ok: true, data: uploadResult.data },
    { status: 200, headers: { "x-request-id": requestId } },
  );
});

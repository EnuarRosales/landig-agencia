import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { tenantWorkspaceService, appLogger, MediaUploadError } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const PROBLEM_HEADERS = { "Content-Type": "application/problem+json" };

/**
 * Mapea errores de dominio y almacenamiento a respuestas RFC 9457 Problem Details sin exponer secretos internos (`SPEC-00 §9.1, §10`).
 */
function mapUploadError(error: unknown): {
  status: number;
  type: string;
  title: string;
  detail: string;
} {
  if (error instanceof MediaUploadError) {
    if (error.httpStatus === 400) {
      return {
        status: 400,
        type: "https://mocter.co/errors/media-validation-failed",
        title: "Media Validation Failed",
        detail: error.message,
      };
    }
    if (error.httpStatus === 404) {
      return {
        status: 404,
        type: "https://mocter.co/errors/product-not-found",
        title: "Product Not Found",
        detail: error.message,
      };
    }
    if (error.httpStatus === 422) {
      return {
        status: 422,
        type: "https://mocter.co/errors/storage-quota-exceeded",
        title: "Storage Quota Exceeded",
        detail: error.message,
      };
    }
    return {
      status: 503,
      type: "https://mocter.co/errors/media-storage-unavailable",
      title: "Service Unavailable",
      detail: "No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos.",
    };
  }

  const msg = error instanceof Error ? error.message : String(error);

  if (/l[ií]mite/i.test(msg)) {
    return {
      status: 422,
      type: "https://mocter.co/errors/storage-quota-exceeded",
      title: "Storage Quota Exceeded",
      detail: msg,
    };
  }

  if (/formato|ejecutables|elf|peque[ñn]o|vac[ií]o|inv[áa]lido|tama[ñn]o m[áa]ximo/i.test(msg)) {
    return {
      status: 400,
      type: "https://mocter.co/errors/media-validation-failed",
      title: "Media Validation Failed",
      detail: msg,
    };
  }

  if (/pertenece|no existe/i.test(msg)) {
    return {
      status: 404,
      type: "https://mocter.co/errors/product-not-found",
      title: "Product Not Found",
      detail: msg,
    };
  }

  if (/almacenar el archivo multimedia|configuraci[óo]n incompleta de imgproxy|bucket/i.test(msg)) {
    return {
      status: 503,
      type: "https://mocter.co/errors/media-storage-unavailable",
      title: "Service Unavailable",
      detail: "No pudimos almacenar tu archivo en este momento. Intenta nuevamente en unos segundos.",
    };
  }

  return {
    status: 500,
    type: "https://mocter.co/errors/internal-server-error",
    title: "Internal Server Error",
    detail: "Error interno al procesar y almacenar el archivo multimedia.",
  };
}

/**
 * Route Handler para carga de archivos multimedia del inquilino (`SPEC-00 §9.1`).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = req.headers?.get("x-request-id") ?? crypto.randomUUID();
  let clientIdForLog: string | undefined;
  let sizeBytesForLog = 0;

  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }
    clientIdForLog = auth.clientId;

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/invalid-form-data",
          title: "Invalid Form Data",
          status: 400,
          detail: "Se requiere un cuerpo multipart/form-data válido.",
        },
        { status: 400, headers: PROBLEM_HEADERS },
      );
    }

    const file = formData.get("file");
    const productId = formData.get("productId");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/missing-file",
          title: "Missing File",
          status: 400,
          detail: "El campo 'file' es obligatorio y debe ser un archivo binario.",
        },
        { status: 400, headers: PROBLEM_HEADERS },
      );
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/missing-product-id",
          title: "Missing Product ID",
          status: 400,
          detail: "El parámetro 'productId' es obligatorio para vincular la imagen al catálogo.",
        },
        { status: 400, headers: PROBLEM_HEADERS },
      );
    }

    const blob = file as Blob;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    sizeBytesForLog = buffer.byteLength;
    const mimeType = blob.type || "image/jpeg";
    const originalFilename = file instanceof File && file.name ? file.name : "archivo.jpg";

    const actor = auth.context.user?.email || auth.clientId;
    const result = await tenantWorkspaceService.uploadProductMedia(
      auth.clientId,
      productId,
      {
        buffer,
        mimeType,
        originalFilename,
      },
      actor,
    );

    appLogger.info("[POST /api/tenant/media/upload] Multimedia almacenado", {
      requestId,
      clientId: auth.clientId,
      mediaKind: result.mediaKind,
      sizeBytes: result.sizeBytes,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const mapped = mapUploadError(error);

    appLogger.error(`[POST /api/tenant/media/upload Failed] ${msg}`, error, {
      requestId,
      clientId: clientIdForLog,
      sizeBytes: sizeBytesForLog,
      status: mapped.status,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        type: mapped.type,
        title: mapped.title,
        status: mapped.status,
        detail: mapped.detail,
      },
      { status: mapped.status, headers: PROBLEM_HEADERS },
    );
  }
}


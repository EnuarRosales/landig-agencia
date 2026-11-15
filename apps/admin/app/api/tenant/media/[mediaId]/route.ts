import { NextRequest, NextResponse } from "next/server";
import {
  appLogger,
  getTenantProductsAndMediaService,
  S3StorageService,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import { problemResponse, resolveRequestId } from "@/app/api/tenant/products/_shared";

/**
 * Sanitiza nombres de archivo para cabeceras `Content-Disposition` evitando inyección CRLF/comillas.
 */
function sanitizeDispositionFilename(filename: string): string {
  const cleaned = filename.replace(/[\r\n"\\]/g, "_").trim();
  return cleaned || "media";
}

/**
 * `GET /api/tenant/media/[mediaId]` — Proxy autenticado de streaming con soporte HTTP `Range` (`206`) (`SPEC-08 D-04`).
 */
export const GET = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ mediaId: string }> },
  ) => {
    const requestId = resolveRequestId(req);
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { mediaId } = await params;
    const trimmedId = mediaId?.trim();
    if (!trimmedId || /[\/\\?#]/.test(trimmedId)) {
      return problemResponse(req, requestId, {
        status: 400,
        type: "https://mocter.co/errors/validation-error",
        title: "Validation Error",
        detail: "Identificador multimedia inválido.",
      });
    }

    const service = getTenantProductsAndMediaService();
    const sourceRes = await service.resolveTenantMediaStreamSource(auth.clientId, trimmedId);
    if (!sourceRes.ok) {
      return problemResponse(req, requestId, {
        status: 404,
        type: "https://mocter.co/errors/not-found",
        title: "Not Found",
        detail: sourceRes.error,
        code: sourceRes.code,
      });
    }

    const source = sourceRes.data;
    const rangeHeader = req.headers.get("range");
    const s3 = new S3StorageService();
    const streamRes = await s3.getObjectStream(source.storageKey, rangeHeader);

    if (!streamRes.ok) {
      appLogger.error("[GET /api/tenant/media/:mediaId] Error obteniendo stream S3", undefined, {
        requestId,
        clientId: auth.clientId,
        mediaId: trimmedId,
        upstreamStatus: streamRes.status,
        error: streamRes.error,
      });

      if (streamRes.status === 416) {
        return problemResponse(req, requestId, {
          status: 416,
          type: "https://mocter.co/errors/range-not-satisfiable",
          title: "Range Not Satisfiable",
          detail: "El rango de bytes solicitado está fuera de los límites del archivo.",
        });
      }

      if (streamRes.status === 404) {
        return problemResponse(req, requestId, {
          status: 404,
          type: "https://mocter.co/errors/not-found",
          title: "Not Found",
          detail: "El recurso multimedia solicitado no se encuentra disponible en almacenamiento.",
        });
      }

      return problemResponse(req, requestId, {
        status: 503,
        type: "https://mocter.co/errors/media-storage-unavailable",
        title: "Service Unavailable",
        detail: "No pudimos transmitir tu archivo en este momento. Intenta nuevamente en unos segundos.",
      });
    }

    const headers = new Headers();
    headers.set("Content-Type", source.mimeType || streamRes.contentType);
    headers.set(
      "Content-Disposition",
      `inline; filename="${sanitizeDispositionFilename(source.originalFilename)}"`,
    );
    headers.set("Accept-Ranges", streamRes.acceptRanges || "bytes");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("x-request-id", requestId);

    if (streamRes.contentLength) {
      headers.set("Content-Length", streamRes.contentLength);
    }
    if (streamRes.contentRange) {
      headers.set("Content-Range", streamRes.contentRange);
    }

    const bodyPayload: BodyInit | null =
      streamRes.body ??
      (streamRes.bufferFallback ? new Uint8Array(streamRes.bufferFallback) : null);

    return new NextResponse(bodyPayload, {
      status: streamRes.status,
      headers,
    });
  },
);

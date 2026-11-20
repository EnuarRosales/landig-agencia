import { NextRequest, NextResponse } from "next/server";
import { getCommunityFeedService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import {
  communityProblemJson,
  domainFailureToProblem,
  requireCommunitySession,
  resolveCommunityRequestId,
} from "../../_shared";

/**
 * `POST /api/tenant/community/posts/media` — Sube 1 imagen destacada para publicación en el muro
 * validando formato por magic bytes y consumiendo cuota `storage_bytes` del comercio autor (`SPEC-15-D11`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const requestId = resolveCommunityRequestId(req);
  const session = await requireCommunitySession(req, requestId, { requireOwner: true });
  if (!session.ok) return session.response;

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Invalid Form Data",
      "Se requiere un cuerpo multipart/form-data válido.",
      "invalid-form-data",
      "INVALID_FORM_DATA",
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return communityProblemJson(
      req,
      requestId,
      400,
      "Missing File",
      "El campo 'file' es obligatorio y debe ser una imagen.",
      "missing-file",
      "MISSING_FILE",
    );
  }

  const blob = file as Blob;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mimeType = blob.type || "application/octet-stream";
  const originalFilename = file instanceof File && file.name ? file.name : "wall-image.png";

  const res = await getCommunityFeedService().uploadWallImage({
    clientId: session.clientId,
    actorUserId: session.userId,
    buffer,
    mimeType,
    originalFilename,
  });

  if (!res.ok) {
    return domainFailureToProblem(req, requestId, res.code, res.error);
  }

  return NextResponse.json(
    { ok: true, data: res.data },
    { status: 201, headers: { "x-request-id": requestId } },
  );
});

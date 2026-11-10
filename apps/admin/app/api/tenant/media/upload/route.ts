import { NextRequest, NextResponse } from "next/server";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/invalid-form-data",
          title: "Invalid Form Data",
          status: 400,
          detail: "Se requiere un cuerpo multipart/form-data válido.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const file = formData.get("file");
    const productId = formData.get("productId") as string;

    if (!file || typeof file === "string") {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/missing-file",
          title: "Missing File",
          status: 400,
          detail: "El campo 'file' es obligatorio y debe ser un archivo binario.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
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
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const blob = file as Blob;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = blob.type || "image/jpeg";
    const originalFilename = (file as any).name || "archivo.jpg";

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

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[POST /api/tenant/media/upload Failed] ${msg}`, error);

    const isDomainError =
      error instanceof Error &&
      (error.message.includes("límite") ||
        error.message.includes("Formato") ||
        error.message.includes("pertenece") ||
        error.message.includes("inválido"));

    const status = isDomainError ? 400 : 500;
    const detail = isDomainError ? error.message : "Error interno al procesar y almacenar el archivo multimedia.";

    return NextResponse.json(
      {
        type: isDomainError
          ? "https://mocter.co/errors/media-validation-failed"
          : "https://mocter.co/errors/internal-server-error",
        title: isDomainError ? "Media Validation Failed" : "Internal Server Error",
        status,
        detail,
      },
      { status, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}


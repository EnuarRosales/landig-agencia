import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedPortalContext, tenantOnboardingService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { readSessionToken } from "@/lib/billing-route-auth";

/**
 * `POST /api/tenant/onboarding/product-cover` · Sube la imagen de portada opcional del primer
 * producto creado durante el Paso 3 del onboarding (`SPEC-06 ONB-08`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const sid = (await readSessionToken(req))?.trim();
  const authContext = sid ? await resolveAuthenticatedPortalContext(sid) : null;
  if (!authContext?.user) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Sesión no iniciada o expirada.",
        instance: req.nextUrl.pathname,
      },
      { status: 401, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/invalid-form-data",
        title: "Invalid Form Data",
        status: 400,
        detail: "Se requiere un cuerpo multipart/form-data válido.",
        instance: req.nextUrl.pathname,
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/missing-file",
        title: "Missing File",
        status: 400,
        detail: "El campo 'file' es obligatorio.",
        instance: req.nextUrl.pathname,
      },
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const blob = file as Blob;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const originalFilename = file instanceof File && file.name ? file.name : "cover.png";

  const result = await tenantOnboardingService.uploadFirstProductCover(authContext.user.id, {
    buffer,
    mimeType: blob.type || "image/png",
    originalFilename,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/onboarding-product-cover-error",
        title: "Product Cover Upload Error",
        status: result.code === "STORAGE_UNAVAILABLE" ? 503 : 400,
        detail: result.error,
        code: result.code,
        instance: req.nextUrl.pathname,
      },
      {
        status: result.code === "STORAGE_UNAVAILABLE" ? 503 : 400,
        headers: { "Content-Type": "application/problem+json" },
      },
    );
  }

  return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
});

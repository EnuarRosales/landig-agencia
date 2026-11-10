import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantWorkspaceService, appLogger } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";

const updateBotSchema = z.object({
  botPreset: z.string().optional(),
  remindersEnabled: z.boolean().optional(),
  returnsPolicy: z.string().nullable().optional(),
  warrantyPolicy: z.string().nullable().optional(),
  orderMessage: z.string().nullable().optional(),
  faqs: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .optional(),
  paymentMethods: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const config = await tenantWorkspaceService.getBotConfig(auth.clientId);
    return NextResponse.json({ ok: true, data: config }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[GET /api/tenant/bot Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error interno al obtener configuración del bot.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const body = await req.json().catch(() => null);
    const parsed = updateBotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/validation-error",
          title: "Validation Error",
          status: 400,
          detail: parsed.error.issues[0]?.message || "Datos del asistente inválidos.",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const updated = await tenantWorkspaceService.updateBotConfig(
      auth.clientId,
      parsed.data,
      actor,
    );
    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    appLogger.error(`[PUT /api/tenant/bot Failed] ${msg}`, error);
    return NextResponse.json(
      {
        type: "https://mocter.co/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: msg || "Error al actualizar la configuración del bot.",
      },
      { status: 500, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}


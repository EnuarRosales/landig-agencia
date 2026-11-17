import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendTestEmail } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformAdmin } from "@/lib/billing-route-auth";

const testSendSchema = z.object({
  to: z.string().trim().email("El correo destinatario de prueba no es válido."),
});

/**
 * `POST /api/admin/notifications/test-send` — Envía un correo de prueba usando la pasarela SMTP activa (`NTF-001`, `SPEC-14`).
 */
export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  await requirePlatformAdmin(req, "ejecutar pruebas de envío SMTP");
  const rawBody: unknown = await req.json().catch(() => ({}));
  const parsed = testSendSchema.safeParse(rawBody);
  if (!parsed.success) {
    return problemResponse(
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Destinatario inválido.",
      { typeSlug: "validation-error", code: "VALIDATION_ERROR" },
    );
  }

  const result = await sendTestEmail(parsed.data.to);
  return NextResponse.json({ ok: true, messageId: result.messageId });
});

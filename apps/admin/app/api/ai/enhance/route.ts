import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appLogger } from "@mocter/domain";
import type { AiAssistService } from "@mocter/domain";

const enhanceRequestSchema = z.object({
  clientId: z.string().uuid(),
  fieldKey: z.string().min(1),
  draft: z.string().min(1),
  locale: z.enum(["es", "en"]).default("es"),
  hasByokConfigured: z.boolean().default(false),
  walletBalanceCents: z.number().int().default(0),
});

/**
 * Route Handler para «Mejorar con AI» (AI-001 RF-04, T-04).
 *
 * Expone la API REST consumida por los formularios de administración del inquilino:
 * - Valida la carga útil con Zod.
 * - Verifica disponibilidad de inferencia (BYOK o billetera). Sin credenciales responde 409 Conflict.
 * - Conecta con `AiAssistService` para ensamble de prompt maestro e inferencia.
 */
export function createEnhanceRouteHandler(aiAssistService: AiAssistService) {
  return async function POST(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = enhanceRequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/validation-error",
            title: "Validation Error",
            status: 400,
            detail: "La carga útil de la solicitud no cumple con los tipos requeridos.",
            errors: parsed.error.issues,
          },
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }

      const input = parsed.data;

      // Sin credenciales de inferencia (BYOK o Billetera), responder 409 con aviso (RF-04.1)
      if (!input.hasByokConfigured && input.walletBalanceCents <= 0) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/no-inference-credentials",
            title: "Inference Provider Required",
            status: 409,
            detail:
              input.locale === "es"
                ? "Para usar 'Mejorar con AI' debes configurar tu proveedor de inferencia (BYOK) o contar con saldo en tu billetera Mocter."
                : "To use 'Improve with AI' you must configure your inference provider (BYOK) or have funds in your Mocter wallet.",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }

      const result = await aiAssistService.enhanceText({
        clientId: input.clientId,
        fieldKey: input.fieldKey,
        draft: input.draft,
        locale: input.locale,
        hasByokConfigured: input.hasByokConfigured,
        walletBalanceCents: input.walletBalanceCents,
      });

      if (!result.ok) {
        return NextResponse.json(
          {
            type: "https://mocter.co/errors/assist-error",
            title: "AI Assist Failed",
            status: 422,
            detail: result.error,
            code: result.code,
          },
          {
            status: 422,
            headers: { "Content-Type": "application/problem+json" },
          },
        );
      }

      return NextResponse.json({
        ok: true,
        data: result.data,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ApiEnhance] Error inesperado en route handler: ${msg}`, error);
      return NextResponse.json(
        {
          type: "https://mocter.co/errors/internal-server-error",
          title: "Internal Server Error",
          status: 500,
          detail: "Ocurrió un error inesperado al procesar la asistencia por AI.",
        },
        {
          status: 500,
          headers: { "Content-Type": "application/problem+json" },
        },
      );
    }
  };
}


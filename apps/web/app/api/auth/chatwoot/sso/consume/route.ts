import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { authService } from "@mocter/domain";
import { getRequestLogger } from "@/lib/logger";
import { serializeError } from "@/lib/logger/serialize-error";

/**
 * Endpoint para validar y consumir de forma atómica un token JWT de SSO de Chatwoot (AUTH-001 §5.10, T-25).
 *
 * Utilizado por Chatwoot (o pruebas) para validar la autenticidad y garantizar que el token solo pueda ser utilizado una vez.
 *
 * - **Método:** `POST`
 * - **Ruta:** `/api/auth/chatwoot/sso/consume`
 *
 * @param req - Solicitud HTTP {@link NextRequest}.
 * @returns Respuesta con las claims verificadas o error de consumo.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const log = await getRequestLogger();

  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    if (!body.token || typeof body.token !== "string") {
      return NextResponse.json(
        { ok: false, error: "El token es requerido.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const consumeResult = await authService.verifyAndConsumeChatwootSsoToken(body.token);
    if (!consumeResult.ok) {
      log.warn({ event: "auth.chatwoot_sso.consume_rejected", code: consumeResult.code });
      const status = consumeResult.code === "SSO_SECRET_MISSING" ? 503 : 401;
      return NextResponse.json(
        { ok: false, error: consumeResult.error, code: consumeResult.code },
        { status },
      );
    }

    log.info({
      event: "auth.chatwoot_sso.consumed",
      identifier: consumeResult.data.claims.identifier,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          claims: consumeResult.data.claims,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    unstable_rethrow(error);
    log.error({ event: "auth.chatwoot_sso.consume_unhandled_error", error: serializeError(error) });
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

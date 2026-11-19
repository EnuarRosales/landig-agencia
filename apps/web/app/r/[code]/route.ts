import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { getRequestLogger } from "@/lib/logger";

const REFERRAL_CODE_REGEX = /^[A-Za-z0-9_-]{3,32}$/;
const DEFAULT_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 días

type ReferralRouteContext = {
  params: Promise<{ code: string }>;
};

/**
 * Route Handler público de enlaces cortos de referidos (`GET /r/[code]`, `SPEC-16 D-01`).
 *
 * Valida la sintaxis del código, almacena la cookie `HttpOnly` `mocter_ref` para preservar
 * la atribución durante la ventana vigente y redirige `307` hacia la página de registro.
 *
 * @param req - Solicitud HTTP entrante.
 * @param ctx - Parámetros de ruta con el código de referido.
 * @returns Redirección HTTP `307` hacia `/<locale>/register`.
 */
export async function GET(
  req: NextRequest,
  ctx: ReferralRouteContext,
): Promise<NextResponse> {
  const log = await getRequestLogger({ route: "/r/[code]" });
  const { code } = await ctx.params;
  const trimmedCode = (code || "").trim().toUpperCase();

  const localeCookie = req.cookies.get("NEXT_LOCALE")?.value;
  const locale = localeCookie === "en" ? "en" : "es";
  const baseOrigin = req.nextUrl.origin || env.NEXT_PUBLIC_APP_URL;

  if (!REFERRAL_CODE_REGEX.test(trimmedCode)) {
    log.warn({ event: "referrals.short_link_invalid_code" });
    return NextResponse.redirect(new URL(`/${locale}/register`, baseOrigin), 307);
  }

  const targetUrl = new URL(`/${locale}/register`, baseOrigin);
  targetUrl.searchParams.set("r", trimmedCode);

  const response = NextResponse.redirect(targetUrl, 307);
  const isProduction = env.NODE_ENV === "production";

  response.cookies.set({
    name: "mocter_ref",
    value: trimmedCode,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: DEFAULT_ATTRIBUTION_MAX_AGE_SECONDS,
  });

  log.info({
    event: "referrals.short_link_captured",
    code: trimmedCode,
    locale,
  });

  return response;
}

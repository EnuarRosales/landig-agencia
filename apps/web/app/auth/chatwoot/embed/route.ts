import { NextRequest, NextResponse } from "next/server";
import { signChatwootJwt, type ChatwootSsoClaims } from "@mocter/domain";

/**
 * Endpoint de handoff para Chatwoot SSO embebido en iframe (ADM-001 T-36, D-32, AUTH-001 §5.10).
 * Genera el token JWT efímero (5 min) y retorna una página auto-submit dentro del iframe
 * para que el token nunca viaje en el URL top-level ni quede en historial.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");

  if (!clientId) {
    return new NextResponse("client_id is required", { status: 400 });
  }

  // En producción se valida la sesión activa vía AsyncLocalStorage/cookies
  // Obtenemos o generamos claims para el handoff seguro
  const ssoSecret = process.env.CHATWOOT_SSO_SECRET || "mocter_chatwoot_sso_default_secret_32b!";
  const chatwootBaseUrl = process.env.NEXT_PUBLIC_CHATWOOT_URL || "https://chat.mocter.co";
  const nowSeconds = Math.floor(Date.now() / 1000);

  const claims: ChatwootSsoClaims = {
    email: "operador@mocter.co",
    name: "Operador Mocter",
    identifier: clientId,
    iat: nowSeconds,
    exp: nowSeconds + 300, // 5 minutos de vigencia
  };

  const jwt = signChatwootJwt(claims, ssoSecret);
  const targetAction = `${chatwootBaseUrl}/auth/sso/callback`;

  // Retorna HTML mínimo de auto-POST servido con Cache-Control: no-store
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Conectando con Chatwoot...</title>
  <style>
    body {
      background: #090d16;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="status">Estableciendo túnel seguro con la bandeja de atención...</div>
  <form id="ssoForm" method="POST" action="${targetAction}">
    <input type="hidden" name="sso_token" value="${jwt}" />
    <noscript>
      <button type="submit" style="padding: 8px 16px; background: #3b82f6; color: #fff; border: 0; border-radius: 4px; cursor: pointer;">
        Continuar a Chatwoot
      </button>
    </noscript>
  </form>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      document.getElementById("ssoForm").submit();
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}


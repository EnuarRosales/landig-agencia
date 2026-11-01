import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminBrandingSettings,
  saveAdminBrandingSettings,
  resetAdminTenantBranding,
} from "@mocter/domain";

/**
 * Route Handler para consulta y configuración de identidad visual corporativa y marca blanca (ADM-001, DSN-001 §7).
 */
export async function GET(): Promise<NextResponse> {
  const settings = await fetchAdminBrandingSettings();
  return NextResponse.json({ ok: true, data: settings });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.action === "reset") {
      if (!body.clientId) {
        return NextResponse.json(
          { ok: false, error: "Identificador de inquilino (clientId) es obligatorio para restaurar." },
          { status: 400 },
        );
      }
      const resetResult = await resetAdminTenantBranding(body.clientId);
      if (!resetResult.ok) {
        return NextResponse.json(
          { ok: false, error: resetResult.error, code: resetResult.code },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, data: resetResult.data }, { status: 200 });
    }

    const result = await saveAdminBrandingSettings({
      clientId: body.clientId,
      brandName: body.brandName,
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl,
      primaryColor: body.primaryColor,
      primaryForeground: body.primaryForeground,
      accentColor: body.accentColor,
      accentForeground: body.accentForeground,
      customDomain: body.customDomain,
      customFont: body.customFont,
      removeMocterBranding: body.removeMocterBranding,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

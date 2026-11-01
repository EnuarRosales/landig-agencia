import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminTenantsOverview,
  createAdminTenant,
  updateAdminTenantLifecycle,
} from "@mocter/domain";

/**
 * Route Handler para consulta, aprovisionamiento y gestión de ciclo de vida de inquilinos (ADM-001 §6, DAT-001).
 */
export async function GET(): Promise<NextResponse> {
  const overview = await fetchAdminTenantsOverview();
  return NextResponse.json({ ok: true, data: overview });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.action === "update_lifecycle") {
      if (!body.clientId || !body.lifecycleStatus) {
        return NextResponse.json(
          { ok: false, error: "Identificador de inquilino y nuevo estado son obligatorios" },
          { status: 400 },
        );
      }

      const result = await updateAdminTenantLifecycle({
        clientId: body.clientId,
        lifecycleStatus: body.lifecycleStatus,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
    }

    // Alta manual de inquilino
    if (!body.displayName || !body.slug || !body.ownerEmail || !body.planId) {
      return NextResponse.json(
        { ok: false, error: "Nombre comercial, slug, correo del propietario y plan son obligatorios" },
        { status: 400 },
      );
    }

    const result = await createAdminTenant({
      displayName: body.displayName,
      slug: body.slug,
      ownerEmail: body.ownerEmail,
      ownerDisplayName: body.ownerDisplayName,
      planId: body.planId,
      cellId: body.cellId,
      phone: body.phone,
      locale: body.locale,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

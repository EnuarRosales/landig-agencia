import { NextRequest, NextResponse } from "next/server";
import {
  createAdminPlan,
  fetchAdminPlans,
  updateAdminPlan,
  deleteAdminPlan,
  fetchAdminPlanDetails,
  fetchChatwootCapabilitiesCatalog,
} from "@mocter/domain";

/**
 * Route Handler para consulta, creación, edición y retiro/eliminación de planes comerciales y VIP (ADM-001, DAT-001).
 * Soporta parametrización estructurada de límites y catálogo de capacidades Chatwoot Community v4.19.1 (T3).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const detailsResult = await fetchAdminPlanDetails(id);
    if (!detailsResult.ok) {
      return NextResponse.json(
        { ok: false, error: detailsResult.error, code: detailsResult.code },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, data: detailsResult.data });
  }

  if (searchParams.get("capabilities") === "true") {
    const capabilities = await fetchChatwootCapabilitiesCatalog();
    return NextResponse.json({ ok: true, data: capabilities });
  }

  const plansList = await fetchAdminPlans();
  return NextResponse.json({ ok: true, data: plansList });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.code || !body.nameEs || body.priceMonthlyCop === undefined) {
      return NextResponse.json(
        { ok: false, error: "Código, Nombre y Precio Mensual son requeridos" },
        { status: 400 },
      );
    }

    const result = await createAdminPlan({
      code: body.code,
      nameEs: body.nameEs,
      nameEn: body.nameEn,
      descriptionEs: body.descriptionEs,
      priceMonthlyCop: Number(body.priceMonthlyCop),
      priceAnnualCop: body.priceAnnualCop ? Number(body.priceAnnualCop) : undefined,
      currency: body.currency === "USD" ? "USD" : "COP",
      billingCycles: Array.isArray(body.billingCycles) && body.billingCycles.length > 0 ? body.billingCycles : ["monthly", "annual"],
      trialDays: body.trialDays ? Number(body.trialDays) : 14,
      isPublic: Boolean(body.isPublic),
      isPopular: Boolean(body.isPopular),
      status: body.status || "active",
      marketingFeaturesEs: body.marketingFeaturesEs || [],
      limits: body.limits,
      capabilities: body.capabilities,
      chatwootEnabled: body.chatwootEnabled,
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

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.id || !body.nameEs || body.priceMonthlyCop === undefined) {
      return NextResponse.json(
        { ok: false, error: "Identificador (id), Nombre y Precio Mensual son requeridos" },
        { status: 400 },
      );
    }

    const result = await updateAdminPlan({
      id: body.id,
      nameEs: body.nameEs,
      nameEn: body.nameEn,
      descriptionEs: body.descriptionEs,
      priceMonthlyCop: Number(body.priceMonthlyCop),
      priceAnnualCop: body.priceAnnualCop ? Number(body.priceAnnualCop) : undefined,
      currency: body.currency === "USD" ? "USD" : "COP",
      billingCycles: Array.isArray(body.billingCycles) && body.billingCycles.length > 0 ? body.billingCycles : ["monthly", "annual"],
      trialDays: body.trialDays ? Number(body.trialDays) : 14,
      isPublic: Boolean(body.isPublic),
      isPopular: Boolean(body.isPopular),
      status: body.status || "active",
      marketingFeaturesEs: body.marketingFeaturesEs || [],
      limits: body.limits,
      capabilities: body.capabilities,
      chatwootEnabled: body.chatwootEnabled,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");
    let planId = idParam;

    if (!planId) {
      try {
        const body = await req.json();
        planId = body.id;
      } catch {
        // Fallback si no hay body
      }
    }

    if (!planId) {
      return NextResponse.json(
        { ok: false, error: "Identificador (id) de plan requerido para eliminación o retiro" },
        { status: 400 },
      );
    }

    const result = await deleteAdminPlan(planId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}


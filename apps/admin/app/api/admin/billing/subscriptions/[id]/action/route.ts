import { NextRequest, NextResponse } from "next/server";
import { getBillingService } from "@mocter/domain";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Route Handler para ejecutar acciones operativas sobre una suscripción (extender trial, suspender, reactivar).
 */
export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body.action || !["extend_trial", "suspend", "activate"].includes(body.action)) {
      return NextResponse.json(
        { ok: false, error: "Acción requerida ('extend_trial', 'suspend' o 'activate')" },
        { status: 400 },
      );
    }

    const billingService = getBillingService();
    const result = await billingService.manageSubscriptionAction(
      id,
      body.action,
      {
        days: body.days ? Number(body.days) : 14,
        actor: body.actor || "platform_owner",
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getBillingService } from "@mocter/domain";

/**
 * Route Handler para listar y actualizar la configuración dinámica de pasarelas de pago (BILL-001 D-11).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const billingService = getBillingService();
    const result = await billingService.listPaymentGatewaysPublicConfig();

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.id || (body.id !== "wompi" && body.id !== "stripe")) {
      return NextResponse.json(
        { ok: false, error: "Identificador de pasarela inválido (debe ser wompi o stripe)" },
        { status: 400 },
      );
    }

    const billingService = getBillingService();
    const result = await billingService.upsertPaymentGatewayConfig({
      id: body.id,
      displayName: body.displayName,
      isEnabled: Boolean(body.isEnabled),
      environment: body.environment === "production" ? "production" : "sandbox",
      publicKey: body.publicKey,
      secretKey: body.secretKey,
      webhookSecret: body.webhookSecret,
      webhookUrl: body.webhookUrl,
      actor: body.actor || "platform_owner",
    });

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


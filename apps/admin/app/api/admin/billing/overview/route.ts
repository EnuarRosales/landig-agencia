import { NextResponse } from "next/server";
import { getBillingService } from "@mocter/domain";

/**
 * Route Handler para consultar métricas globales, suscripciones e invoices de la SaaS (BILL-001, D-10).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const billingService = getBillingService();
    const result = await billingService.getAdminBillingOverview();

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


import { NextRequest, NextResponse } from "next/server";
import { getBillingRemindersService } from "@mocter/domain";
import { handle } from "@/lib/errors/route";
import { problemResponse, requirePlatformBillingAdmin } from "@/lib/billing-route-auth";

/**
 * POST `/api/admin/billing/reminders/dispatch` · Ejecuta el barrido idempotente de recordatorios `D-5` y `D-0` (`SPEC-04 T-04`).
 */
export const POST = handle(async (req: NextRequest) => {
  await requirePlatformBillingAdmin(req);
  const service = getBillingRemindersService();
  const res = await service.dispatchDueReminders();

  if (!res.ok) {
    return problemResponse(500, "Reminders Dispatch Failed", res.error, {
      code: res.code,
    });
  }

  return NextResponse.json({
    ok: true,
    data: res.data,
  });
});

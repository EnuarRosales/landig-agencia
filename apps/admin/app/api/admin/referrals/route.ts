import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminReferralsOverview,
  updateAdminReferralProgram,
} from "@mocter/domain";

/**
 * Route Handler para gestión y gobernanza del programa de referidos (REF-001).
 */
export async function GET(): Promise<NextResponse> {
  const overview = await fetchAdminReferralsOverview();
  return NextResponse.json({ ok: true, data: overview });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (!body.programId) {
      return NextResponse.json(
        { ok: false, error: "Identificador de programa es obligatorio" },
        { status: 400 },
      );
    }

    const result = await updateAdminReferralProgram({
      programId: body.programId,
      status: body.status,
      rewardType: body.rewardType,
      rewardValue: body.rewardValue !== undefined ? Number(body.rewardValue) : undefined,
      attributionDays: body.attributionDays !== undefined ? Number(body.attributionDays) : undefined,
      creditValidityDays: body.creditValidityDays !== undefined ? Number(body.creditValidityDays) : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

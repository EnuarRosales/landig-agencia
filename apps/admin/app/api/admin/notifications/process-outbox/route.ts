import { NextResponse } from "next/server";
import { processPendingEmailDeliveries } from "@mocter/domain";

export async function POST() {
  try {
    const result = await processPendingEmailDeliveries();
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
export async function GET() {
  return POST();
}

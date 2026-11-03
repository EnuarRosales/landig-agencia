import { NextResponse } from "next/server";
import { sendTestEmail } from "@mocter/domain";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const to = (body.to as string) || "alhemoasde@gmail.com";
    const result = await sendTestEmail(to);
    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
export async function GET() {
  return POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }));
}

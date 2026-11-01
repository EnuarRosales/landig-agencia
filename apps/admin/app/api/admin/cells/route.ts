import { NextRequest, NextResponse } from "next/server";
import { createAdminCell, fetchAdminCells } from "@mocter/domain";

/**
 * Route Handler para consulta y aprovisionamiento de celdas de datos celulares (DAT-001 §3.3).
 */
export async function GET(): Promise<NextResponse> {
  const cellsList = await fetchAdminCells();
  return NextResponse.json({ ok: true, data: cellsList });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.code || !body.pgbouncerHost || !body.databaseName) {
      return NextResponse.json(
        { ok: false, error: "Código, Host y Nombre de Base de Datos son requeridos" },
        { status: 400 },
      );
    }

    const result = await createAdminCell({
      code: body.code,
      tier: body.tier,
      pgbouncerHost: body.pgbouncerHost,
      pgbouncerPort: body.pgbouncerPort ? Number(body.pgbouncerPort) : 5432,
      databaseName: body.databaseName,
      maxClients: body.maxClients ? Number(body.maxClients) : 100,
      region: body.region || "us-east-1",
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


import { NextRequest, NextResponse } from "next/server";
import {
  TenantContactsAndUsersService,
  DrizzleTenantContactsAndUsersRepository,
} from "@mocter/domain";

/**
 * Route Handler para gestión de miembros e invitaciones con cuota comercial 'tenant_users' (T7, S3, S7, S10).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await context.params;

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Identificador de inquilino requerido" }, { status: 400 });
  }

  const repo = new DrizzleTenantContactsAndUsersRepository();
  const service = new TenantContactsAndUsersService(repo);
  const summary = await service.getTenantUsersSummary(clientId);

  return NextResponse.json({ ok: true, data: summary });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await context.params;

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Identificador de inquilino requerido" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const repo = new DrizzleTenantContactsAndUsersRepository();
    const service = new TenantContactsAndUsersService(repo);

    if (!body.email || typeof body.email !== "string") {
      return NextResponse.json(
        { ok: false, error: "El correo electrónico del colaborador es obligatorio" },
        { status: 400 },
      );
    }

    const result = await service.issueInvitation(
      clientId,
      {
        email: body.email,
        role: "tenant_agent",
        invitedByUserId: body.invitedByUserId ?? "admin-user",
        ttlMs: body.ttlMs,
      },
      "admin-api",
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await context.params;
  const { searchParams } = new URL(req.url);
  const invitationId = searchParams.get("invitationId");
  const memberId = searchParams.get("memberId");

  if (!clientId || (!invitationId && !memberId)) {
    return NextResponse.json(
      { ok: false, error: "Identificador de inquilino y (invitationId o memberId) son requeridos" },
      { status: 400 },
    );
  }

  const repo = new DrizzleTenantContactsAndUsersRepository();
  const service = new TenantContactsAndUsersService(repo);

  if (invitationId) {
    const result = await service.revokeInvitation(clientId, invitationId, "admin-api");
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: true });
  }

  if (memberId) {
    const result = await service.removeMember(clientId, memberId, "admin-api");
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
    }
    return NextResponse.json({ ok: true, data: true });
  }

  return NextResponse.json({ ok: false, error: "Operación no soportada" }, { status: 400 });
}

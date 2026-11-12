import { NextRequest, NextResponse } from "next/server";
import {
  fetchRbacOverview,
  saveSystemUser,
  saveSystemRole,
  toggleRolePermission,
  resendUserVerificationEmail,
  sendUserPasswordResetLink,
  toggleUserStatus,
} from "@mocter/domain";

/**
 * Route Handler para la gobernanza de Usuarios, Roles y Matriz de Permisos (RBAC)
 * en el núcleo del Platform Owner (ADM-001 D-31).
 */
export async function GET(): Promise<NextResponse> {
  const data = await fetchRbacOverview();
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "save_user") {
      const result = await saveSystemUser({
        id: body.id,
        email: body.email,
        displayName: body.displayName,
        role: body.role,
        status: body.status || "active",
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "resend_verification") {
      if (!body.userId) {
        return NextResponse.json({ ok: false, error: "Identificador de usuario (userId) es obligatorio" }, { status: 400 });
      }
      const result = await resendUserVerificationEmail({
        userId: body.userId,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "send_password_reset") {
      if (!body.userId) {
        return NextResponse.json({ ok: false, error: "Identificador de usuario (userId) es obligatorio" }, { status: 400 });
      }
      const result = await sendUserPasswordResetLink({
        userId: body.userId,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "toggle_status") {
      if (!body.userId || !body.status) {
        return NextResponse.json({ ok: false, error: "userId y status ('active' | 'disabled') son obligatorios" }, { status: 400 });
      }
      const result = await toggleUserStatus({
        userId: body.userId,
        status: body.status,
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "save_role") {
      const result = await saveSystemRole({
        id: body.id,
        key: body.key,
        name: body.name,
        description: body.description,
        scope: body.scope || "platform",
        status: body.status || "active",
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "toggle_permission") {
      const result = await toggleRolePermission({
        roleKey: body.roleKey,
        permissionKey: body.permissionKey,
        granted: Boolean(body.granted),
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    return NextResponse.json(
      { ok: false, error: `Acción '${action}' no reconocida` },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}


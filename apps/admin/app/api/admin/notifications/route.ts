import { NextRequest, NextResponse } from "next/server";
import {
  fetchAdminEmailSettings,
  saveAdminSmtpProvider,
  saveAdminEmailSender,
  saveAdminEmailTemplate,
} from "@mocter/domain";

/**
 * Route Handler para la gestión administrativa de servidores SMTP, direcciones remitentes
 * y plantillas de correo vinculadas en la consola de la SaaS (ADM-001, NTF-001).
 */
export async function GET(): Promise<NextResponse> {
  const data = await fetchAdminEmailSettings();
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "save_provider") {
      const result = await saveAdminSmtpProvider({
        id: body.id,
        name: body.name,
        host: body.host,
        port: Number(body.port),
        secure: Boolean(body.secure),
        username: body.username,
        password: body.password,
        status: body.status || "active",
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "save_sender") {
      const result = await saveAdminEmailSender({
        id: body.id,
        key: body.key,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        replyTo: body.replyTo,
        providerId: body.providerId,
        isDefault: Boolean(body.isDefault),
        status: body.status || "active",
      });

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "save_template") {
      // Regla estricta: Remitente y Evento son obligatorios
      if (!body.senderId) {
        return NextResponse.json(
          { ok: false, error: "Debe vincular obligatoriamente una Dirección Remitente registrada." },
          { status: 400 }
        );
      }
      if (!body.eventKey) {
        return NextResponse.json(
          { ok: false, error: "Debe vincular obligatoriamente un Evento o Funcionalidad del sistema." },
          { status: 400 }
        );
      }

      const result = await saveAdminEmailTemplate({
        id: body.id,
        eventKey: body.eventKey,
        locale: body.locale || "es",
        senderId: body.senderId,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        status: body.status || "published",
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


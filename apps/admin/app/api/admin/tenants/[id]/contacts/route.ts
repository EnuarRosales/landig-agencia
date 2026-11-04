import { NextRequest, NextResponse } from "next/server";
import {
  TenantContactsAndUsersService,
  DrizzleTenantContactsAndUsersRepository,
  type TenantContactInput,
} from "@mocter/domain";

/**
 * Route Handler para gestión y catálogo de contactos con deduplicación y cuotas comerciales por inquilino (T7, S3, S7, S10).
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
  const contacts = await service.listContacts(clientId);

  return NextResponse.json({ ok: true, data: contacts });
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

    // Importación por lote
    if (Array.isArray(body.contacts)) {
      const items: TenantContactInput[] = body.contacts;
      const result = await service.importContacts(clientId, items, "admin-api");

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 403 },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
    }

    // Creación individual o sincronización deduplicada
    if (!body.fullName || typeof body.fullName !== "string") {
      return NextResponse.json(
        { ok: false, error: "El nombre completo del contacto es obligatorio" },
        { status: 400 },
      );
    }

    const result = await service.createOrSyncContact(
      clientId,
      {
        fullName: body.fullName,
        email: body.email,
        phoneMobile: body.phoneMobile,
        phoneLandline: body.phoneLandline,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        country: body.country,
        state: body.state,
        city: body.city,
        addressLine: body.addressLine,
        postalCode: body.postalCode,
        source: body.source,
        channel: body.channel,
        chatwootContactId: body.chatwootContactId,
        assignedUserId: body.assignedUserId,
        stage: body.stage,
        tags: body.tags,
        notes: body.notes,
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
  const contactId = searchParams.get("contactId");

  if (!clientId || !contactId) {
    return NextResponse.json(
      { ok: false, error: "Identificador de inquilino y de contacto son requeridos" },
      { status: 400 },
    );
  }

  const repo = new DrizzleTenantContactsAndUsersRepository();
  const service = new TenantContactsAndUsersService(repo);
  const result = await service.deleteContact(clientId, contactId, "admin-api");

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: true });
}

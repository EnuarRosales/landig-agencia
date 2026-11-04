import { NextRequest, NextResponse } from "next/server";
import {
  TenantStorageAccountingService,
  DrizzleTenantStorageAccountingRepository,
} from "@mocter/domain";

/**
 * Route Handler para gestión y consulta de almacenamiento deduplicado por inquilino (T8, S3, S7-S8, S10).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await context.params;

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Identificador de inquilino requerido" }, { status: 400 });
  }

  const repo = new DrizzleTenantStorageAccountingRepository();
  const service = new TenantStorageAccountingService(repo);
  const summary = await service.getStorageSummary(clientId);

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

    if (!body.filename || !body.base64Content) {
      return NextResponse.json(
        { ok: false, error: "El nombre de archivo y el contenido base64 son obligatorios" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(body.base64Content, "base64");
    const repo = new DrizzleTenantStorageAccountingRepository();
    const service = new TenantStorageAccountingService(repo);

    const result = await service.ingestMedia(clientId, {
      buffer,
      originalFilename: body.filename,
      mimeType: body.mimeType,
      mediaKind: body.mediaKind,
      origin: body.origin ?? "catalog",
    });

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
  const mediaId = searchParams.get("mediaId");

  if (!clientId || !mediaId) {
    return NextResponse.json(
      { ok: false, error: "Identificador de inquilino y mediaId son requeridos" },
      { status: 400 },
    );
  }

  const repo = new DrizzleTenantStorageAccountingRepository();
  const service = new TenantStorageAccountingService(repo);
  const result = await service.releaseMediaReference(clientId, mediaId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}

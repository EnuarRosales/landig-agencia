import { NextRequest, NextResponse } from "next/server";
import {
  TenantProductsAndMediaService,
  DrizzleTenantProductsRepository,
  type TenantProductInput,
} from "@mocter/domain";

/**
 * Route Handler para gestión y catálogo de productos con cuotas comerciales por inquilino (T6, S3, S7, S10).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: clientId } = await context.params;

  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Identificador de inquilino requerido" }, { status: 400 });
  }

  const repo = new DrizzleTenantProductsRepository();
  const service = new TenantProductsAndMediaService(repo);
  const result = await service.listProducts(clientId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result.data });
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
    const repo = new DrizzleTenantProductsRepository();
    const service = new TenantProductsAndMediaService(repo);

    // Importación por lote
    if (Array.isArray(body.products)) {
      const items: TenantProductInput[] = body.products;
      const result = await service.importProducts(clientId, items);

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: 403 },
        );
      }

      return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
    }

    // Creación individual
    if (!body.name || !body.description || typeof body.priceCents !== "number") {
      return NextResponse.json(
        { ok: false, error: "Nombre, descripción y precio en centavos son obligatorios" },
        { status: 400 },
      );
    }

    const result = await service.createProduct(clientId, {
      name: body.name,
      description: body.description,
      priceCents: body.priceCents,
      currency: body.currency,
      sku: body.sku,
      gtin: body.gtin,
      brand: body.brand,
      category: body.category,
      kind: body.kind,
      condition: body.condition,
      availability: body.availability,
      status: body.status,
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

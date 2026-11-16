import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  tenantWorkspaceService,
  normalizeAndValidatePhoneE164,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";

const createOrderSchema = z.object({
  customerName: z.string().min(2, "El nombre del cliente debe tener al menos 2 caracteres."),
  customerPhone: z
    .string()
    .trim()
    .min(8, "El teléfono del cliente debe incluir el indicativo internacional E.164.")
    .superRefine((val, ctx) => {
      const res = normalizeAndValidatePhoneE164({
        rawPhone: val,
        allowLocalWithDefaultCountry: false,
      });
      if (!res.ok) {
        ctx.addIssue({ code: "custom", message: res.error });
      }
    })
    .transform((val) => {
      const res = normalizeAndValidatePhoneE164({
        rawPhone: val,
        allowLocalWithDefaultCountry: false,
      });
      return res.ok ? res.data.e164 : val.trim();
    }),
  paymentMethod: z.string().default("transferencia"),
  totalCents: z.number().int().positive("El total debe ser mayor a cero."),
  currency: z.string().min(3).max(3).optional(),
  subtotalCents: z.number().int().positive().optional(),
  shippingCents: z.number().int().nonnegative().optional(),
  discountCents: z.number().int().nonnegative().optional(),
  countryCode: z.string().trim().max(8).nullable().optional(),
  subdivisionCode: z.string().trim().max(16).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  addressLine: z.string().trim().max(500).nullable().optional(),
  addressComplement: z.string().trim().max(255).nullable().optional(),
  neighborhood: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  referenceNotes: z.string().trim().max(500).nullable().optional(),
  notes: z.string().nullable().optional(),
});

function problemJson(req: NextRequest, status: number, title: string, detail: string, typeSlug: string): NextResponse {
  return NextResponse.json(
    {
      type: `https://mocter.co/errors/${typeSlug}`,
      title,
      status,
      detail,
      instance: req.nextUrl.pathname,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const orders = await tenantWorkspaceService.getOrders(auth.clientId);
  return NextResponse.json({ ok: true, data: orders }, { status: 200 });
});

export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return problemJson(
      req,
      400,
      "Validation Error",
      parsed.error.issues[0]?.message || "Datos de pedido inválidos.",
      "validation-error",
    );
  }

  const actor = auth.context.user?.email || auth.clientId;
  const created = await tenantWorkspaceService.createOrder(auth.clientId, parsed.data, actor);
  return NextResponse.json({ ok: true, data: created }, { status: 201 });
});


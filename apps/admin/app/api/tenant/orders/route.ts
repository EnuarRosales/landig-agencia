import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parsePaginationQuery,
  tenantOrdersService,
  type OrderListSortBy,
} from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  e164PhoneSchema,
  mapOrderDomainErrorToResponse,
  orderItemInputSchema,
  orderProblemJson,
} from "./_shared";

const structuredCreateOrderSchema = z.object({
  contactId: z.string().uuid().optional(),
  prospectId: z.string().uuid().optional(),
  initialStatus: z.enum(["pending_confirmation", "confirmed"]).optional(),
  paymentMethod: z.string().trim().min(1).optional(),
  paymentChannelId: z.string().uuid().optional(),
  paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
  customer: z.object({
    name: z.string().trim().min(2, "El nombre del cliente debe tener al menos 2 caracteres."),
    phone: e164PhoneSchema,
    document: z.string().trim().max(40).optional(),
  }),
  shipping: z.object({
    method: z.enum(["home", "office"]).default("home"),
    contactAddressId: z.string().uuid().optional(),
    countryCode: z.string().trim().max(8).optional(),
    subdivisionCode: z.string().trim().max(16).optional(),
    state: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    addressLine: z.string().trim().max(500).optional(),
    addressComplement: z.string().trim().max(255).optional(),
    neighborhood: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(20).optional(),
    referenceNotes: z.string().trim().max(500).optional(),
    carrierId: z.string().uuid().optional(),
    carrierName: z.string().trim().max(120).optional(),
    trackingCode: z.string().trim().max(120).optional(),
    shippingCents: z.coerce.number().int().nonnegative().optional(),
  }),
  items: z.array(orderItemInputSchema).min(1, "El pedido debe incluir al menos un producto."),
  discountCents: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  notes: z.string().max(2000).optional(),
  repeatedFromOrderId: z.string().uuid().optional(),
  externalErpSystem: z.string().trim().max(60).optional(),
  externalErpReference: z.string().trim().max(120).optional(),
});

const legacyFlatCreateOrderSchema = z.object({
  customerName: z.string().trim().min(2, "El nombre del cliente debe tener al menos 2 caracteres."),
  customerPhone: e164PhoneSchema,
  customerDocument: z.string().trim().max(40).optional(),
  contactId: z.string().uuid().optional(),
  prospectId: z.string().uuid().optional(),
  contactAddressId: z.string().uuid().optional(),
  initialStatus: z.enum(["pending_confirmation", "confirmed"]).optional(),
  paymentMethod: z.string().default("transferencia"),
  paymentChannelId: z.string().uuid().optional(),
  paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
  shippingMethod: z.enum(["home", "office"]).optional(),
  totalCents: z.coerce.number().int().positive("El total debe ser mayor a cero."),
  currency: z.string().min(3).max(3).optional(),
  subtotalCents: z.coerce.number().int().positive().optional(),
  shippingCents: z.coerce.number().int().nonnegative().optional(),
  discountCents: z.coerce.number().int().nonnegative().optional(),
  countryCode: z.string().trim().max(8).nullable().optional(),
  subdivisionCode: z.string().trim().max(16).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  addressLine: z.string().trim().max(500).nullable().optional(),
  addressComplement: z.string().trim().max(255).nullable().optional(),
  neighborhood: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  referenceNotes: z.string().trim().max(500).nullable().optional(),
  carrierName: z.string().trim().max(120).nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(orderItemInputSchema).optional(),
});

const ALLOWED_SORT_BY: readonly OrderListSortBy[] = [
  "created_at",
  "total_cents",
  "number",
  "status",
  "customer_name",
];

function parseSortParams(searchParams: URLSearchParams): {
  sortBy: OrderListSortBy;
  sortDir: "asc" | "desc";
} {
  const rawSort = searchParams.get("sort")?.trim();
  const rawSortBy = searchParams.get("sortBy")?.trim();
  const rawSortDir = searchParams.get("sortDir")?.trim();

  let candidateCol = rawSortBy ?? "";
  let candidateDir = rawSortDir ?? "";

  if (rawSort && rawSort.includes(":")) {
    const [col, dir] = rawSort.split(":");
    if (!candidateCol) candidateCol = col ?? "";
    if (!candidateDir) candidateDir = dir ?? "";
  }

  const sortBy: OrderListSortBy = ALLOWED_SORT_BY.includes(candidateCol as OrderListSortBy)
    ? (candidateCol as OrderListSortBy)
    : "created_at";
  const sortDir: "asc" | "desc" = candidateDir === "asc" ? "asc" : "desc";
  return { sortBy, sortDir };
}

export const GET = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const sp = req.nextUrl.searchParams;
  const query = sp.get("q")?.trim() || undefined;
  const status = sp.get("status")?.trim() || undefined;
  const paymentStatus = sp.get("paymentStatus")?.trim() || undefined;
  const shippingMethod = sp.get("shippingMethod")?.trim() || undefined;
  const carrier = sp.get("carrier")?.trim() || undefined;
  const dateFromRaw = sp.get("dateFrom")?.trim();
  const dateToRaw = sp.get("dateTo")?.trim();

  let startDate: Date | undefined;
  let endDate: Date | undefined;
  if (dateFromRaw) {
    const d = new Date(dateFromRaw);
    if (Number.isNaN(d.getTime())) {
      return orderProblemJson(req, 400, "Bad Request", "Parámetro dateFrom inválido.", "validation-error");
    }
    startDate = d;
  }
  if (dateToRaw) {
    const d = new Date(dateToRaw);
    if (Number.isNaN(d.getTime())) {
      return orderProblemJson(req, 400, "Bad Request", "Parámetro dateTo inválido.", "validation-error");
    }
    if (dateToRaw.length <= 10) {
      d.setUTCHours(23, 59, 59, 999);
    }
    endDate = d;
  }

  const paginationParsed = parsePaginationQuery(sp);
  if (!paginationParsed.ok) {
    return orderProblemJson(
      req,
      400,
      "Bad Request",
      paginationParsed.error,
      "validation-error",
      "INVALID_PAGINATION",
    );
  }

  const page = paginationParsed.data.page;
  const limit = paginationParsed.data.limit;
  const { sortBy, sortDir } = parseSortParams(sp);

  const res = await tenantOrdersService.listOrders(auth.clientId, {
    query,
    status,
    paymentStatus,
    shippingMethod,
    carrier,
    startDate,
    endDate,
    page,
    limit,
    sortBy,
    sortDir,
  });

  if (!res.ok) {
    return mapOrderDomainErrorToResponse(req, res.code, res.error);
  }

  return NextResponse.json({ ok: true, data: res.data }, { status: 200 });
});

export const POST = handle(async (req: NextRequest): Promise<NextResponse> => {
  const auth = await resolveTenantSession(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return orderProblemJson(req, 400, "Validation Error", "Cuerpo JSON inválido.", "validation-error");
  }

  const actor = auth.context.user?.email || auth.clientId;
  const isStructured = "customer" in body || "shipping" in body;

  if (isStructured) {
    const parsed = structuredCreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Datos de pedido inválidos.",
        "validation-error",
      );
    }

    const d = parsed.data;
    const res = await tenantOrdersService.createOrder(auth.clientId, {
      contactId: d.contactId ?? d.prospectId,
      prospectId: d.prospectId ?? d.contactId,
      source: "manual",
      initialStatus: d.initialStatus ?? "pending_confirmation",
      paymentMethod: d.paymentMethod ?? "",
      paymentChannelId: d.paymentChannelId,
      paymentStatus: d.paymentStatus ?? "pending",
      customer: d.customer,
      shipping: d.shipping,
      items: d.items,
      discountCents: d.discountCents,
      currency: d.currency,
      notes: d.notes,
      repeatedFromOrderId: d.repeatedFromOrderId,
      externalErpSystem: d.externalErpSystem,
      externalErpReference: d.externalErpReference,
      actor,
    });

    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }
    return NextResponse.json({ ok: true, data: res.data }, { status: 201 });
  }

  const parsedLegacy = legacyFlatCreateOrderSchema.safeParse(body);
  if (!parsedLegacy.success) {
    return orderProblemJson(
      req,
      400,
      "Validation Error",
      parsedLegacy.error.issues[0]?.message || "Datos de pedido inválidos.",
      "validation-error",
    );
  }

  const flat = parsedLegacy.data;
  const items =
    flat.items && flat.items.length > 0
      ? flat.items
      : [
          {
            productName: "Pedido Manual",
            quantity: 1,
            unitPriceCents: flat.subtotalCents ?? flat.totalCents,
          },
        ];

  const res = await tenantOrdersService.createOrder(auth.clientId, {
    contactId: flat.contactId ?? flat.prospectId,
    prospectId: flat.prospectId ?? flat.contactId,
    source: "manual",
    initialStatus: flat.initialStatus ?? "pending_confirmation",
    paymentMethod: flat.paymentMethod,
    paymentChannelId: flat.paymentChannelId,
    paymentStatus: flat.paymentStatus ?? "pending",
    customer: {
      name: flat.customerName,
      phone: flat.customerPhone,
      document: flat.customerDocument,
    },
    shipping: {
      method: flat.shippingMethod ?? "home",
      contactAddressId: flat.contactAddressId,
      countryCode: flat.countryCode ?? undefined,
      subdivisionCode: flat.subdivisionCode ?? undefined,
      state: flat.state ?? undefined,
      city: flat.city ?? undefined,
      addressLine: flat.addressLine ?? undefined,
      addressComplement: flat.addressComplement ?? undefined,
      neighborhood: flat.neighborhood ?? undefined,
      postalCode: flat.postalCode ?? undefined,
      referenceNotes: flat.referenceNotes ?? undefined,
      carrierName: flat.carrierName ?? undefined,
      shippingCents: flat.shippingCents ?? 0,
    },
    items,
    discountCents: flat.discountCents ?? 0,
    currency: flat.currency,
    notes: flat.notes ?? undefined,
    actor,
  });

  if (!res.ok) {
    return mapOrderDomainErrorToResponse(req, res.code, res.error);
  }

  return NextResponse.json({ ok: true, data: res.data }, { status: 201 });
});

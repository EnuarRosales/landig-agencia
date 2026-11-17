import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tenantOrdersService } from "@mocter/domain";
import { resolveTenantSession } from "@/lib/tenant-auth";
import { handle } from "@/lib/errors/route";
import {
  e164PhoneSchema,
  mapOrderDomainErrorToResponse,
  orderItemInputSchema,
  orderProblemJson,
  orderStatusZodEnum,
  uuidParamSchema,
} from "../_shared";

const updateOrderDetailsSchema = z.object({
  contactId: z.string().uuid().nullable().optional(),
  prospectId: z.string().uuid().nullable().optional(),
  paymentMethod: z.string().trim().min(1).optional(),
  paymentChannelId: z.string().uuid().nullable().optional(),
  paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
  customer: z
    .object({
      name: z.string().trim().min(2).optional(),
      phone: e164PhoneSchema.optional(),
      document: z.string().trim().max(40).optional(),
    })
    .optional(),
  shipping: z
    .object({
      method: z.enum(["home", "office"]).optional(),
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
    })
    .optional(),
  items: z.array(orderItemInputSchema).min(1).optional(),
  discountCents: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().max(2000).nullable().optional(),
  externalErpSystem: z.string().trim().max(60).nullable().optional(),
  externalErpReference: z.string().trim().max(120).nullable().optional(),
});

const patchOrderSchema = z
  .object({
    status: orderStatusZodEnum.optional(),
    paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
    carrierId: z.string().uuid().optional(),
    carrierName: z.string().trim().max(120).optional(),
    trackingCode: z.string().trim().max(120).optional(),
    reason: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
    issueNotes: z.string().trim().max(1000).optional(),
    confirmRefundIfPaid: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.paymentStatus !== undefined, {
    message: "Debe especificar un estado de pedido o estado de pago para actualizar.",
  });

export const GET = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const validId = uuidParamSchema.safeParse(id);
    if (!validId.success) {
      return orderProblemJson(req, 400, "Validation Error", validId.error.issues[0]?.message || "ID inválido.", "validation-error");
    }

    const res = await tenantOrdersService.getOrderDetail(auth.clientId, validId.data);
    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }

    return NextResponse.json({ ok: true, data: res.data }, { status: 200 });
  },
);

export const PUT = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const validId = uuidParamSchema.safeParse(id);
    if (!validId.success) {
      return orderProblemJson(req, 400, "Validation Error", validId.error.issues[0]?.message || "ID inválido.", "validation-error");
    }

    const body = await req.json().catch(() => null);
    const parsed = updateOrderDetailsSchema.safeParse(body);
    if (!parsed.success) {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Datos de actualización de pedido inválidos.",
        "validation-error",
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const res = await tenantOrdersService.updateOrderDetails(auth.clientId, validId.data, {
      ...parsed.data,
      actor,
    });

    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }

    return NextResponse.json({ ok: true, data: res.data }, { status: 200 });
  },
);

export const PATCH = handle(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const auth = await resolveTenantSession(req);
    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const validId = uuidParamSchema.safeParse(id);
    if (!validId.success) {
      return orderProblemJson(req, 400, "Validation Error", validId.error.issues[0]?.message || "ID inválido.", "validation-error");
    }

    const body = await req.json().catch(() => null);
    const parsed = patchOrderSchema.safeParse(body);
    if (!parsed.success) {
      return orderProblemJson(
        req,
        400,
        "Validation Error",
        parsed.error.issues[0]?.message || "Estado de pedido inválido.",
        "validation-error",
      );
    }

    const actor = auth.context.user?.email || auth.clientId;
    const actorRole = auth.context.role;
    const data = parsed.data;

    if (data.paymentStatus && !data.status) {
      const payRes = await tenantOrdersService.updatePaymentStatus(
        auth.clientId,
        validId.data,
        data.paymentStatus,
      );
      if (!payRes.ok) {
        return mapOrderDomainErrorToResponse(req, payRes.code, payRes.error);
      }
      const detailRes = await tenantOrdersService.getOrderDetail(auth.clientId, validId.data);
      if (!detailRes.ok) {
        return mapOrderDomainErrorToResponse(req, detailRes.code, detailRes.error);
      }
      return NextResponse.json(
        { ok: true, status: detailRes.data.status, paymentStatus: detailRes.data.paymentStatus, data: detailRes.data },
        { status: 200 },
      );
    }

    const res = await tenantOrdersService.transitionOrderStatus(auth.clientId, validId.data, {
      toStatus: data.status!,
      actor,
      actorRole,
      reason: data.reason ?? data.notes,
      issueNotes: data.issueNotes ?? data.reason ?? data.notes,
      carrierId: data.carrierId,
      carrierName: data.carrierName,
      trackingCode: data.trackingCode,
      confirmRefundIfPaid: data.confirmRefundIfPaid,
    });

    if (!res.ok) {
      return mapOrderDomainErrorToResponse(req, res.code, res.error);
    }

    if (data.paymentStatus && data.paymentStatus !== res.data.paymentStatus) {
      await tenantOrdersService.updatePaymentStatus(auth.clientId, validId.data, data.paymentStatus);
    }

    return NextResponse.json(
      { ok: true, status: res.data.status, data: res.data },
      { status: 200 },
    );
  },
);

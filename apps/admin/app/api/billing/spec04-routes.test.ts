import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { err, ok } from "@mocter/domain";
import { POST as activateTrialPOST } from "../tenant/billing/trial/route";
import { POST as submitBreBReportPOST } from "../tenant/billing/bre-b/report/route";
import { GET as listManualReportsGET } from "../admin/billing/manual-reports/route";
import { POST as reviewManualReportPOST } from "../admin/billing/manual-reports/[id]/review/route";
import { GET as downloadVoucherGET } from "../admin/billing/manual-reports/[id]/voucher/route";
import { POST as dispatchRemindersPOST } from "../admin/billing/reminders/dispatch/route";

const mockResolvePortalContext = vi.fn();
const mockActivateTrial = vi.fn();
const mockSubmitBreBReport = vi.fn();
const mockListManualReports = vi.fn();
const mockReviewManualReport = vi.fn();
const mockGetManualReportById = vi.fn();
const mockS3GetObject = vi.fn();
const mockDispatchDueReminders = vi.fn();

vi.mock("@mocter/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mocter/domain")>();
  return {
    ...actual,
    resolveAuthenticatedPortalContext: (...args: unknown[]) =>
      mockResolvePortalContext(...args),
    getBillingService: vi.fn().mockReturnValue({
      activateTrialForTenant: (...args: unknown[]) => mockActivateTrial(...args),
      submitManualBreBReport: (...args: unknown[]) => mockSubmitBreBReport(...args),
      listManualBreBReports: (...args: unknown[]) => mockListManualReports(...args),
      reviewManualBreBReport: (...args: unknown[]) => mockReviewManualReport(...args),
      getManualBreBReportById: (...args: unknown[]) => mockGetManualReportById(...args),
    }),
    getBillingRemindersService: vi.fn().mockReturnValue({
      dispatchDueReminders: (...args: unknown[]) => mockDispatchDueReminders(...args),
    }),
    S3StorageService: vi.fn().mockImplementation(() => ({
      getObject: (...args: unknown[]) => mockS3GetObject(...args),
    })),
  };
});

describe("SPEC-04 T-05 · Endpoints Trial, Bre-B, Revisión Admin y Recordatorios", () => {
  const tenantOwnerSession = {
    user: { id: "11111111-1111-7111-8111-111111111111", email: "owner@tienda.co" },
    session: { id: "sid-owner" },
    scope: "tenant",
    role: "tenant_owner",
    effectiveRoles: ["tenant_owner"],
    activeClientId: "22222222-2222-7222-8222-222222222222",
  };

  const platformAdminSession = {
    user: { id: "99999999-9999-7999-8999-999999999999", email: "admin@mocter.co" },
    session: { id: "sid-admin" },
    scope: "platform",
    role: "platform_owner",
    effectiveRoles: ["platform_owner"],
    activeClientId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/tenant/billing/trial activa trial para tenant_owner y rechaza tenant_agent con 403", async () => {
    mockResolvePortalContext.mockResolvedValueOnce({
      ...tenantOwnerSession,
      role: "tenant_agent",
      effectiveRoles: ["tenant_agent"],
    });

    const forbiddenReq = new NextRequest("http://localhost:3003/api/tenant/billing/trial", {
      method: "POST",
      headers: { cookie: "mocter_sid=sid-agent", "Content-Type": "application/json" },
      body: JSON.stringify({ cycle: "monthly" }),
    });
    const forbiddenRes = await activateTrialPOST(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);

    mockResolvePortalContext.mockResolvedValueOnce(tenantOwnerSession);
    mockActivateTrial.mockResolvedValueOnce(
      ok({ id: "sub-1", status: "trialing", trialEndsAt: new Date("2026-11-28T00:00:00Z") }),
    );
    const okReq = new NextRequest("http://localhost:3003/api/tenant/billing/trial", {
      method: "POST",
      headers: { cookie: "mocter_sid=sid-owner", "Content-Type": "application/json" },
      body: JSON.stringify({ cycle: "monthly" }),
    });
    const okRes = await activateTrialPOST(okReq);
    expect(okRes.status).toBe(200);
    const json = (await okRes.json()) as { ok: boolean; data: { status: string } };
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("trialing");
  });

  it("POST /api/tenant/billing/bre-b/report procesa multipart/form-data y conserva continuidad", async () => {
    mockResolvePortalContext.mockResolvedValueOnce(tenantOwnerSession);
    mockSubmitBreBReport.mockResolvedValueOnce(
      ok({
        report: { id: "33333333-3333-7333-8333-333333333333", status: "pending_review" },
        subscription: {
          status: "trialing",
          planId: "44444444-4444-7444-8444-444444444444",
          pendingUpgradePlanId: null,
        },
      }),
    );

    const formData = new FormData();
    formData.append("invoiceId", "55555555-5555-7555-8555-555555555555");
    formData.append("targetPlanId", "44444444-4444-7444-8444-444444444444");
    formData.append("targetCycle", "monthly");
    formData.append("operationKind", "new_subscription");
    formData.append("reportedAmountCents", "15000000");
    formData.append("paymentReference", "BREB-777");
    formData.append(
      "voucher",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], "comprobante.png", {
        type: "image/png",
      }),
    );

    const req = new NextRequest("http://localhost:3003/api/tenant/billing/bre-b/report", {
      method: "POST",
      headers: { cookie: "mocter_sid=sid-owner" },
      body: formData,
    });
    const res = await submitBreBReportPOST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { subscriptionStatus: string; report: { status: string } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.report.status).toBe("pending_review");
    expect(json.data.subscriptionStatus).toBe("trialing");
  });

  it("GET /api/admin/billing/manual-reports lista reportes para platform_owner y rechaza inquilinos", async () => {
    mockResolvePortalContext.mockResolvedValueOnce(tenantOwnerSession);
    const blocked = await listManualReportsGET(
      new NextRequest("http://localhost:3003/api/admin/billing/manual-reports", {
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
    );
    expect(blocked.status).toBe(403);

    mockResolvePortalContext.mockResolvedValueOnce(platformAdminSession);
    mockListManualReports.mockResolvedValueOnce(
      ok([{ id: "33333333-3333-7333-8333-333333333333", status: "pending_review" }]),
    );
    const res = await listManualReportsGET(
      new NextRequest(
        "http://localhost:3003/api/admin/billing/manual-reports?status=pending_review",
        { headers: { cookie: "mocter_sid=sid-admin" } },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: Array<{ status: string }> };
    expect(json.data[0]?.status).toBe("pending_review");
  });

  it("POST /api/admin/billing/manual-reports/[id]/review aprueba y devuelve 422 si falta motivo al rechazar", async () => {
    const reportId = "33333333-3333-7333-8333-333333333333";
    mockResolvePortalContext.mockResolvedValue(platformAdminSession);

    mockReviewManualReport.mockResolvedValueOnce(
      err("Motivo corto", "INVALID_REJECTION_REASON"),
    );
    const invalidReject = await reviewManualReportPOST(
      new NextRequest(`http://localhost:3003/api/admin/billing/manual-reports/${reportId}/review`, {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-admin", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: "mal" }),
      }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(invalidReject.status).toBe(422);

    mockReviewManualReport.mockResolvedValueOnce(
      ok({ report: { id: reportId, status: "approved" }, subscription: { status: "active" } }),
    );
    const approved = await reviewManualReportPOST(
      new NextRequest(`http://localhost:3003/api/admin/billing/manual-reports/${reportId}/review`, {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-admin", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(approved.status).toBe(200);
  });

  it("GET /api/admin/billing/manual-reports/[id]/voucher transmite binario privado desde S3 solo a admin", async () => {
    const reportId = "33333333-3333-7333-8333-333333333333";
    mockResolvePortalContext.mockResolvedValueOnce(tenantOwnerSession);
    const forbidden = await downloadVoucherGET(
      new NextRequest(`http://localhost:3003/api/admin/billing/manual-reports/${reportId}/voucher`, {
        headers: { cookie: "mocter_sid=sid-owner" },
      }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(forbidden.status).toBe(403);

    mockResolvePortalContext.mockResolvedValueOnce(platformAdminSession);
    mockGetManualReportById.mockResolvedValueOnce(
      ok({
        id: reportId,
        voucherMediaKey: "billing-vouchers/c1/v.png",
        voucherMimeType: "image/png",
      }),
    );
    mockS3GetObject.mockResolvedValueOnce({
      ok: true,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
    });

    const okRes = await downloadVoucherGET(
      new NextRequest(`http://localhost:3003/api/admin/billing/manual-reports/${reportId}/voucher`, {
        headers: { cookie: "mocter_sid=sid-admin" },
      }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Content-Type")).toBe("image/png");
    expect(okRes.headers.get("Cache-Control")).toContain("no-store");
  });

  it("POST /api/admin/billing/reminders/dispatch ejecuta recordatorios D-5/D-0 con rol de plataforma", async () => {
    mockResolvePortalContext.mockResolvedValueOnce(platformAdminSession);
    mockDispatchDueReminders.mockResolvedValueOnce(
      ok({
        evaluatedCount: 3,
        d5SentCount: 1,
        d0SentCount: 1,
        expiredTransitionCount: 1,
        skippedCount: 1,
        errors: [],
      }),
    );

    const res = await dispatchRemindersPOST(
      new NextRequest("http://localhost:3003/api/admin/billing/reminders/dispatch", {
        method: "POST",
        headers: { cookie: "mocter_sid=sid-admin" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { d5SentCount: number; d0SentCount: number } };
    expect(json.ok).toBe(true);
    expect(json.data.d5SentCount).toBe(1);
    expect(json.data.d0SentCount).toBe(1);
  });
});

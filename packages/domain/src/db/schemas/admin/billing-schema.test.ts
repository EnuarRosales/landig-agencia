import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  clientBillingProfiles,
  paymentMethods,
  subscriptions,
  invoices,
  payments,
  paymentReceipts,
  subscriptionChanges,
} from "./billing";

describe("BILL-001 T-02 · Esquemas de Facturación SaaS, Pagos y Suscripciones", () => {
  it("client_billing_profiles declara los campos fiscales requeridos por Matías API", () => {
    const cols = getTableColumns(clientBillingProfiles);

    expect(cols.clientId).toBeDefined();
    expect(cols.identityDocumentId).toBeDefined();
    expect(cols.dni).toBeDefined();
    expect(cols.companyName).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.address).toBeDefined();
    expect(cols.cityCode).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("payment_methods implementa tokenización segura sin PAN ni CVV", () => {
    const cols = getTableColumns(paymentMethods);

    expect(cols.id).toBeDefined();
    expect(cols.clientId).toBeDefined();
    expect(cols.gateway).toBeDefined();
    expect(cols.gatewayCustomerId).toBeDefined();
    expect(cols.gatewayPaymentMethodId).toBeDefined();
    expect(cols.brand).toBeDefined();
    expect(cols.last4).toBeDefined();
    expect(cols.isDefault).toBeDefined();
    expect(cols.status).toBeDefined();

    // Verificación estricta de ausencia de campos de tarjeta vulnerables
    expect((cols as any).pan).toBeUndefined();
    expect((cols as any).cvv).toBeUndefined();
    expect((cols as any).cardNumber).toBeUndefined();
  });

  it("subscriptions modela el plan por UUID y el ciclo de vida", () => {
    const cols = getTableColumns(subscriptions);

    expect(cols.id).toBeDefined();
    expect(cols.clientId).toBeDefined();
    expect(cols.planId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.cycle).toBeDefined();
    expect(cols.currentPeriodStart).toBeDefined();
    expect(cols.currentPeriodEnd).toBeDefined();
  });

  it("invoices declara subtotal, tax_cents = 0 en v1, créditos y prorrateo", () => {
    const cols = getTableColumns(invoices);

    expect(cols.id).toBeDefined();
    expect(cols.clientId).toBeDefined();
    expect(cols.invoiceNumber).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.subtotalCents).toBeDefined();
    expect(cols.taxCents).toBeDefined();
    expect(cols.creditCents).toBeDefined();
    expect(cols.prorationCents).toBeDefined();
    expect(cols.totalCents).toBeDefined();
    expect(cols.currency).toBeDefined();
  });

  it("payments soporta conciliación e idempotencia por gatewayReference", () => {
    const cols = getTableColumns(payments);

    expect(cols.id).toBeDefined();
    expect(cols.clientId).toBeDefined();
    expect(cols.invoiceId).toBeDefined();
    expect(cols.gateway).toBeDefined();
    expect(cols.gatewayReference).toBeDefined();
    expect(cols.amountCents).toBeDefined();
    expect(cols.status).toBeDefined();
  });

  it("payment_receipts y subscription_changes declaran sus relaciones de auditoría y prorrateo", () => {
    const receiptCols = getTableColumns(paymentReceipts);
    expect(receiptCols.paymentId).toBeDefined();
    expect(receiptCols.receiptNumber).toBeDefined();

    const changeCols = getTableColumns(subscriptionChanges);
    expect(changeCols.subscriptionId).toBeDefined();
    expect(changeCols.fromPlanId).toBeDefined();
    expect(changeCols.toPlanId).toBeDefined();
    expect(changeCols.remainingDays).toBeDefined();
    expect(changeCols.netCents).toBeDefined();
  });
});


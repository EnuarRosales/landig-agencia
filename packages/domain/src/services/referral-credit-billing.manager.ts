import { ok, err, type Result } from "../types/result";
import { appLogger } from "../utils/logger";
import type { IBillingRepository } from "../repositories/billing.repository.interface";
import type { Invoice, PaymentReceipt } from "../db/schemas/admin/billing";

export interface AvailableReferralCredit {
  id: string;
  remainingCents: number;
  currency: string;
  expiresAt: Date;
}

export interface IReferralRewardsProvider {
  getAvailableCredits(clientId: string): Promise<AvailableReferralCredit[]>;
  deductCredit(rewardId: string, amountCents: number, invoiceId: string): Promise<void>;
}

export interface IssueInvoiceWithCreditsInput {
  clientId: string;
  subtotalCents: number;
  currency: "COP" | "USD";
  prorationCents?: number;
  executedBy: string;
}

export interface IssueInvoiceWithCreditsResult {
  invoice: Invoice;
  creditsAppliedCents: number;
  appliedCreditId: string | null;
  paidWithoutGateway: boolean;
  receipt?: PaymentReceipt;
}

/**
 * Gestor de aplicación de créditos de referidos en facturación SaaS (BILL-001 T-10, §4.3).
 *
 * Reglas:
 * 1. Imputa créditos disponibles ordenados por fecha de expiración ascendente.
 * 2. Descuenta el crédito en el módulo de referidos (REF-001).
 * 3. Si totalCents llega a 0, marca la factura inmediatamente como 'paid' sin invocar pasarela.
 * 4. Idempotencia y protección contra totales negativos.
 */
export class ReferralCreditBillingManager {
  constructor(
    private readonly billingRepo: IBillingRepository,
    private readonly referralProvider?: IReferralRewardsProvider,
  ) {}

  async issueInvoiceWithCredits(
    input: IssueInvoiceWithCreditsInput,
  ): Promise<Result<IssueInvoiceWithCreditsResult>> {
    try {
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${year}-${rand}`;

      const prorationCents = input.prorationCents ?? 0;
      let netPayable = input.subtotalCents + prorationCents;
      if (netPayable < 0) netPayable = 0;

      let creditsAppliedCents = 0;
      let appliedCreditId: string | null = null;

      // 1. Consultar créditos disponibles de referidos si el proveedor está inyectado
      if (this.referralProvider && netPayable > 0) {
        const availableCredits = await this.referralProvider.getAvailableCredits(input.clientId);
        // Ordenar por expiración ascendente
        const sorted = availableCredits.sort(
          (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime(),
        );

        for (const credit of sorted) {
          if (netPayable <= 0) break;
          if (credit.currency !== input.currency) continue;

          const toDeduct = Math.min(credit.remainingCents, netPayable);
          creditsAppliedCents += toDeduct;
          netPayable -= toDeduct;
          appliedCreditId = credit.id;
        }
      }

      const totalCents = Math.max(0, input.subtotalCents + prorationCents - creditsAppliedCents);
      const isFullyCovered = totalCents === 0;

      // 2. Crear factura
      const invoice = await this.billingRepo.createInvoice({
        clientId: input.clientId,
        invoiceNumber,
        status: isFullyCovered ? "paid" : "issued",
        subtotalCents: input.subtotalCents,
        taxCents: 0,
        creditCents: creditsAppliedCents,
        appliedReferralCreditId: appliedCreditId,
        prorationCents,
        totalCents,
        currency: input.currency,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: isFullyCovered ? new Date() : null,
        createdBy: input.executedBy,
        updatedBy: input.executedBy,
      });

      // 3. Si se aplicaron créditos, persistir deducción en REF-001
      if (this.referralProvider && appliedCreditId && creditsAppliedCents > 0) {
        await this.referralProvider.deductCredit(
          appliedCreditId,
          creditsAppliedCents,
          invoice.id,
        );
      }

      // 4. Si se cubrió al 100% con créditos, emitir recibo interno de pago
      let receipt: PaymentReceipt | undefined;
      if (isFullyCovered) {
        const payment = await this.billingRepo.createPayment({
          clientId: input.clientId,
          invoiceId: invoice.id,
          gateway: "wompi", // gateway simbólica para control contable interno
          gatewayReference: `credit_${invoice.id}`,
          amountCents: 0,
          currency: input.currency,
          status: "approved",
          createdBy: "system.referral_credits",
          updatedBy: "system.referral_credits",
        });

        receipt = await this.billingRepo.createReceipt({
          paymentId: payment.id,
          receiptNumber: `REC-${year}-${rand}`,
          pdfUrl: `/receipts/REC-${year}-${rand}.pdf`,
          emailedTo: null,
          emailedAt: null,
          createdBy: "system.referral_credits",
          updatedBy: "system.referral_credits",
        });

        appLogger.info("[ReferralCreditBilling] Factura cubierta 100% con créditos de referidos", {
          clientId: input.clientId,
          invoiceId: invoice.id,
          creditsAppliedCents,
        });
      }

      return ok({
        invoice,
        creditsAppliedCents,
        appliedCreditId,
        paidWithoutGateway: isFullyCovered,
        receipt,
      });
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      appLogger.error(`[ReferralCreditBilling] Error al emitir factura con créditos: ${msg}`, error);
      return err(msg, "REFERRAL_CREDIT_INVOICE_ERROR");
    }
  }
}


import type { OrderStatus } from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "guide_generated",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivery_issue",
  "delivered",
  "return_in_progress",
  "returned",
  "cancelled",
] as const;

export const MAIN_TIMELINE_STATUSES: readonly OrderStatus[] = [
  "pending_confirmation",
  "confirmed",
  "preparing",
  "guide_generated",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

/**
 * Formatea centavos enteros a moneda legible según idioma y divisa del comercio.
 */
export function formatOrderMoneyCents(
  cents: number,
  currency: string = "COP",
  locale: AdminLocale = "es",
): string {
  const code = (currency || "COP").toUpperCase();
  const amount = Math.round(cents) / 100;
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "COP" || code === "CLP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${code}`;
  }
}

/**
 * Resuelve etiqueta localizada en Title Case para cualquiera de los 12 estados homologados.
 */
export function getOrderStatusLabel(status: string, locale: AdminLocale): string {
  const w = getAdminDictionary(locale).workspace;
  switch (status) {
    case "pending_confirmation":
      return w.ordersStatusPendingConfirmation;
    case "confirmed":
      return w.ordersStatusConfirmed;
    case "preparing":
      return w.ordersStatusPreparing;
    case "guide_generated":
      return w.ordersStatusGuideGenerated;
    case "dispatched":
      return w.ordersStatusDispatched;
    case "in_transit":
      return w.ordersStatusInTransit;
    case "out_for_delivery":
      return w.ordersStatusOutForDelivery;
    case "delivery_issue":
      return w.ordersStatusDeliveryIssue;
    case "delivered":
      return w.ordersStatusDelivered;
    case "return_in_progress":
      return w.ordersStatusReturnInProgress;
    case "returned":
      return w.ordersStatusReturned;
    case "cancelled":
      return w.ordersStatusCancelled;
    default:
      return status;
  }
}

/**
 * Retorna clases visuales accesibles de insignia para el estado del pedido.
 */
export function getOrderStatusBadgeClasses(status: string): string {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "dispatched":
    case "in_transit":
    case "out_for_delivery":
      return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30";
    case "preparing":
    case "guide_generated":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30";
    case "confirmed":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30";
    case "delivery_issue":
    case "return_in_progress":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "returned":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "cancelled":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    case "pending_confirmation":
    default:
      return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
  }
}

/**
 * Resuelve etiqueta localizada para el estado de pago del pedido.
 */
export function getPaymentStatusLabel(paymentStatus: string, locale: AdminLocale): string {
  const w = getAdminDictionary(locale).workspace;
  switch (paymentStatus) {
    case "paid":
      return w.ordersPaymentPaid;
    case "refunded":
      return w.ordersPaymentRefunded;
    case "failed":
      return w.ordersPaymentFailed;
    case "pending":
    default:
      return w.ordersPaymentPending;
  }
}

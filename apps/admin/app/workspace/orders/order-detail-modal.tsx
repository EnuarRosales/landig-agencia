"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Repeat,
  Truck,
  User,
  X,
} from "lucide-react";
import type { OrderDetailDto } from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import {
  MAIN_TIMELINE_STATUSES,
  formatOrderMoneyCents,
  getOrderStatusBadgeClasses,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from "./order-ui-helpers";

export interface OrderDetailModalProps {
  isOpen: boolean;
  orderId: string | null;
  isOwner: boolean;
  locale: AdminLocale;
  onClose: () => void;
  onEdit: (order: OrderDetailDto) => void;
  onTransition: (order: OrderDetailDto) => void;
  onPrintGuide: (order: OrderDetailDto) => void;
  onRepeat: (order: OrderDetailDto) => void;
  onPaymentStatusUpdated?: (order: OrderDetailDto) => void;
}

export function OrderDetailModal({
  isOpen,
  orderId,
  isOwner,
  locale,
  onClose,
  onEdit,
  onTransition,
  onPrintGuide,
  onRepeat,
  onPaymentStatusUpdated,
}: OrderDetailModalProps) {
  const w = getAdminDictionary(locale).workspace;
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const loading = isOpen && Boolean(orderId) && loadedOrderId !== orderId;

  useEffect(() => {
    if (!isOpen || !orderId) return;
    let active = true;
    workspaceFetch<OrderDetailDto>(`/api/tenant/orders/${orderId}`)
      .then((res) => {
        if (!active) return;
        if (!res.ok || !res.data) {
          setErrorMsg(res.error || "No se pudo cargar el detalle del pedido.");
          setOrder(null);
        } else {
          setErrorMsg(null);
          setOrder(res.data);
        }
        setLoadedOrderId(orderId);
      })
      .catch(() => {
        if (active) {
          setErrorMsg("Error de conexión al consultar el pedido.");
          setOrder(null);
          setLoadedOrderId(orderId);
        }
      });
    return () => {
      active = false;
    };
  }, [isOpen, orderId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !orderId) return null;

  const currentTimelineIdx = order
    ? MAIN_TIMELINE_STATUSES.indexOf(order.status)
    : -1;

  async function handlePaymentChange(nextPaymentStatus: string) {
    if (!order) return;
    setUpdatingPayment(true);
    try {
      const res = await workspaceFetch<OrderDetailDto>(`/api/tenant/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ paymentStatus: nextPaymentStatus }),
      });
      if (res.ok && res.data) {
        setOrder(res.data);
        onPaymentStatusUpdated?.(res.data);
      }
    } finally {
      setUpdatingPayment(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] px-5 py-4 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <Package className="h-5 w-5 text-[var(--dsn-accent)]" />
            <h2
              id="order-detail-modal-title"
              className="text-base sm:text-lg font-bold text-[var(--dsn-text)]"
            >
              {w.ordersDetailTitle}
            </h2>
            {order && (
              <>
                <span className="font-mono text-sm font-bold text-[var(--dsn-accent)]">
                  {order.orderNumber}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getOrderStatusBadgeClasses(order.status)}`}
                >
                  {getOrderStatusLabel(order.status, locale)}
                </span>
                {order.repeatedFromOrderId && (
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-500 dark:text-indigo-300">
                    {w.ordersDetailRepeatedBadge}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
            aria-label={w.ordersDetailClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-[var(--dsn-text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--dsn-accent)]" />
              <span>{locale === "en" ? "Loading order details..." : "Cargando detalle del pedido..."}</span>
            </div>
          ) : errorMsg || !order ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">
              {errorMsg || "Pedido no disponible."}
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 space-y-3">
                <div className="text-xs font-semibold text-[var(--dsn-text)]">
                  {w.ordersDetailTimelineTitle}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {MAIN_TIMELINE_STATUSES.map((step, idx) => {
                    const reached = currentTimelineIdx >= idx;
                    const isCurrent = order.status === step;
                    return (
                      <div
                        key={step}
                        className={`rounded-lg border px-2 py-2 text-center text-[11px] transition-colors ${
                          isCurrent
                            ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/15 font-bold text-[var(--dsn-accent)]"
                            : reached
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] opacity-70"
                        }`}
                      >
                        <div className="flex items-center justify-center mb-1">
                          {reached ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Clock className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <span className="leading-tight block">
                          {getOrderStatusLabel(step, locale)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="rounded-xl border border-[var(--dsn-border)] p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
                    <User className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>{w.ordersDetailCustomerTitle}</span>
                  </div>
                  <div className="text-sm font-bold text-[var(--dsn-text)]">
                    {order.customerName}
                  </div>
                  <div className="text-xs font-mono text-[var(--dsn-text-secondary)]">
                    {order.customerPhone}
                    {order.customerDocument ? ` · ID: ${order.customerDocument}` : ""}
                  </div>
                  <div className="flex items-start gap-2 text-xs text-[var(--dsn-text)] pt-1">
                    <MapPin className="h-4 w-4 shrink-0 text-[var(--dsn-text-secondary)] mt-0.5" />
                    <div className="space-y-0.5">
                      <div>
                        {[order.addressLine, order.addressComplement, order.neighborhood]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                      <div className="text-[var(--dsn-text-secondary)]">
                        {[order.city, order.state, order.countryCode, order.postalCode]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                      {order.referenceNotes && (
                        <div className="text-[var(--dsn-text-secondary)] italic">
                          {order.referenceNotes}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-[var(--dsn-border)] p-4 space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-[var(--dsn-text)]">
                    <Truck className="h-4 w-4 text-[var(--dsn-accent)]" />
                    <span>{w.ordersDetailTotalsTitle}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[var(--dsn-text-secondary)] block">
                        {w.ordersDetailCarrier}
                      </span>
                      <span className="font-semibold text-[var(--dsn-text)]">
                        {order.carrierName || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--dsn-text-secondary)] block">
                        {w.ordersDetailTracking}
                      </span>
                      <span className="font-mono font-semibold text-[var(--dsn-accent)]">
                        {order.trackingCode || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--dsn-text-secondary)] block">
                        {w.ordersDetailPaymentChannel}
                      </span>
                      <span className="font-semibold text-[var(--dsn-text)]">
                        {order.paymentMethod}
                      </span>
                    </div>
                    <div>
                      <label
                        htmlFor="detail-payment-status"
                        className="text-[var(--dsn-text-secondary)] block mb-0.5"
                      >
                        {w.ordersColPayment}
                      </label>
                      <select
                        id="detail-payment-status"
                        value={order.paymentStatus}
                        disabled={updatingPayment}
                        onChange={(e) => handlePaymentChange(e.target.value)}
                        className="rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2 py-1 text-xs font-semibold text-[var(--dsn-text)]"
                      >
                        <option value="pending">{getPaymentStatusLabel("pending", locale)}</option>
                        <option value="paid">{getPaymentStatusLabel("paid", locale)}</option>
                        <option value="refunded">{getPaymentStatusLabel("refunded", locale)}</option>
                        <option value="failed">{getPaymentStatusLabel("failed", locale)}</option>
                      </select>
                    </div>
                  </div>
                  <div className="border-t border-[var(--dsn-border)] pt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[var(--dsn-text-secondary)]">{w.ordersDetailSubtotal}</span>
                      <span className="font-mono">{formatOrderMoneyCents(order.subtotalCents, order.currency, locale)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--dsn-text-secondary)]">{w.ordersDetailShipping}</span>
                      <span className="font-mono">{formatOrderMoneyCents(order.shippingCents, order.currency, locale)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--dsn-text-secondary)]">{w.ordersDetailDiscount}</span>
                      <span className="font-mono">-{formatOrderMoneyCents(order.discountCents, order.currency, locale)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1 border-t border-[var(--dsn-border)]">
                      <span>{w.ordersDetailTotal}</span>
                      <span className="font-mono text-[var(--dsn-accent)]">
                        {formatOrderMoneyCents(order.totalCents, order.currency, locale)}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-[var(--dsn-border)] overflow-hidden">
                <div className="bg-[var(--dsn-surface-secondary)]/40 px-4 py-2.5 text-xs font-semibold text-[var(--dsn-text)] border-b border-[var(--dsn-border)]">
                  {w.ordersDetailItemsTitle}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--dsn-border)] text-[var(--dsn-text-secondary)]">
                      <tr>
                        <th className="px-4 py-2 font-medium">{w.ordersFormItemsTitle}</th>
                        <th className="px-4 py-2 font-medium">{w.ordersFormItemQtyLabel}</th>
                        <th className="px-4 py-2 font-medium">{w.ordersFormItemPriceLabel}</th>
                        {isOwner && (
                          <th className="px-4 py-2 font-medium">{w.ordersDetailCostMargin}</th>
                        )}
                        <th className="px-4 py-2 font-medium text-right">{w.ordersDetailSubtotal}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--dsn-border)]">
                      {order.items.map((item) => {
                        const unitMargin = item.unitPriceCents - item.unitCostCents;
                        const attrEntries = item.selectedAttributes
                          ? Object.entries(item.selectedAttributes)
                          : [];
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-[var(--dsn-text)]">
                                {item.productName}
                              </div>
                              {item.productSku && (
                                <div className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                                  SKU: {item.productSku}
                                </div>
                              )}
                              {attrEntries.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {attrEntries.map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="rounded-md bg-[var(--dsn-surface-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--dsn-text-secondary)] border border-[var(--dsn-border)]"
                                    >
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono">{item.quantity}</td>
                            <td className="px-4 py-2.5 font-mono">
                              {formatOrderMoneyCents(item.unitPriceCents, order.currency, locale)}
                            </td>
                            {isOwner && (
                              <td className="px-4 py-2.5 font-mono text-[var(--dsn-text-secondary)]">
                                {formatOrderMoneyCents(item.unitCostCents, order.currency, locale)} /{" "}
                                <span className={unitMargin >= 0 ? "text-emerald-500" : "text-rose-500"}>
                                  {formatOrderMoneyCents(unitMargin, order.currency, locale)}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">
                              {formatOrderMoneyCents(item.lineTotalCents, order.currency, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-[var(--dsn-border)] p-4 space-y-2.5">
                <div className="text-xs font-semibold text-[var(--dsn-text)]">
                  {w.ordersDetailEventsTitle}
                </div>
                <div className="space-y-2">
                  {order.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--dsn-text)]">
                          {ev.fromStatus
                            ? `${getOrderStatusLabel(ev.fromStatus, locale)} → ${getOrderStatusLabel(ev.toStatus, locale)}`
                            : getOrderStatusLabel(ev.toStatus, locale)}
                        </span>
                        {ev.reason && (
                          <span className="text-[var(--dsn-text-secondary)]">· {ev.reason}</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                        {ev.actor} · {new Date(ev.createdAt).toLocaleString(locale === "en" ? "en-US" : "es-CO")}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {order && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dsn-border)] px-5 py-3.5 bg-[var(--dsn-surface-secondary)]/30 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPrintGuide(order)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <Printer className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                {w.ordersActionGuide}
              </button>
              <button
                type="button"
                onClick={() => onRepeat(order)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <Repeat className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                {w.ordersActionRepeat}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {order.canEditDetails && (
                <button
                  type="button"
                  onClick={() => onEdit(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  {w.ordersActionEdit}
                </button>
              )}
              {order.allowedNextStatuses.length > 0 && (
                <button
                  type="button"
                  onClick={() => onTransition(order)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {w.ordersActionTransition}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

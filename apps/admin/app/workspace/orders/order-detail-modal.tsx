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
} from "lucide-react";
import type { OrderDetailDto } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
} from "@mocter/ui";
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
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
        closeAriaLabel={w.ordersDetailClose}
        aria-labelledby="order-detail-modal-title"
      >
        <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2.5">
            <Package className="h-5 w-5 text-[var(--dsn-accent)]" />
            <DialogTitle
              id="order-detail-modal-title"
              className="text-base font-bold text-[var(--dsn-text)] sm:text-lg"
            >
              {w.ordersDetailTitle}
            </DialogTitle>
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
                  <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-300">
                    {w.ordersDetailRepeatedBadge}
                  </Badge>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--dsn-text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--dsn-accent)]" />
              <span>{locale === "en" ? "Loading order details..." : "Cargando detalle del pedido..."}</span>
            </div>
          ) : errorMsg || !order ? (
            <Alert variant="error">
              <AlertDescription>{errorMsg || "Pedido no disponible."}</AlertDescription>
            </Alert>
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
                      <Select
                        id="detail-payment-status"
                        value={order.paymentStatus}
                        disabled={updatingPayment}
                        onChange={(e) => handlePaymentChange(e.target.value)}
                        className="h-auto px-2 py-1 text-xs font-semibold"
                      >
                        <option value="pending">{getPaymentStatusLabel("pending", locale)}</option>
                        <option value="paid">{getPaymentStatusLabel("paid", locale)}</option>
                        <option value="refunded">{getPaymentStatusLabel("refunded", locale)}</option>
                        <option value="failed">{getPaymentStatusLabel("failed", locale)}</option>
                      </Select>
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
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-5 py-3.5 sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPrintGuide(order)}
              >
                <Printer className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                {w.ordersActionGuide}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRepeat(order)}
              >
                <Repeat className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                {w.ordersActionRepeat}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {order.canEditDetails && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(order)}
                >
                  <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  {w.ordersActionEdit}
                </Button>
              )}
              {order.allowedNextStatuses.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onTransition(order)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {w.ordersActionTransition}
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

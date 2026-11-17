"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, Truck, X } from "lucide-react";
import type { OrderDetailDto, OrderListItemDto, OrderStatus } from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import {
  formatOrderMoneyCents,
  getOrderStatusBadgeClasses,
  getOrderStatusLabel,
} from "./order-ui-helpers";

interface CarrierOption {
  id: string;
  name: string;
}

export interface OrderStatusModalProps {
  isOpen: boolean;
  order: OrderListItemDto | null;
  initialTargetStatus?: OrderStatus;
  isOwner: boolean;
  locale: AdminLocale;
  carriers: CarrierOption[];
  onClose: () => void;
  onTransitioned: (updatedOrder: OrderDetailDto) => void;
}

export function OrderStatusModal(props: OrderStatusModalProps) {
  if (!props.isOpen || !props.order) return null;
  return (
    <OrderStatusModalBody
      key={`${props.order.id}-${props.order.status}-${props.initialTargetStatus ?? ""}`}
      {...props}
      order={props.order}
    />
  );
}

function OrderStatusModalBody({
  order,
  initialTargetStatus,
  isOwner,
  locale,
  carriers,
  onClose,
  onTransitioned,
}: OrderStatusModalProps & { order: OrderListItemDto }) {
  const w = getAdminDictionary(locale).workspace;
  const availableTargets = order.allowedNextStatuses ?? [];
  const defaultTarget =
    initialTargetStatus && availableTargets.includes(initialTargetStatus)
      ? initialTargetStatus
      : availableTargets[0] ?? "";

  const [targetStatus, setTargetStatus] = useState<string>(defaultTarget);
  const [carrierName, setCarrierName] = useState(order.carrierName ?? "");
  const [trackingCode, setTrackingCode] = useState(order.trackingCode ?? "");
  const [reason, setReason] = useState("");
  const [confirmRefundIfPaid, setConfirmRefundIfPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saving, onClose]);

  const isCancelling = targetStatus === "cancelled";
  const isDispatched = targetStatus === "dispatched";
  const isDeliveryIssue = targetStatus === "delivery_issue";
  const paidCancelBlockedForAgent = isCancelling && order.paymentStatus === "paid" && !isOwner;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !targetStatus) return;
    setErrorMsg(null);

    if (paidCancelBlockedForAgent) {
      setErrorMsg(w.ordersTransitionPaidOwnerOnly);
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        status: targetStatus,
      };
      if (isDispatched) {
        payload.carrierName = carrierName.trim();
        payload.trackingCode = trackingCode.trim();
      }
      if (reason.trim()) {
        payload.reason = reason.trim();
        if (isDeliveryIssue) {
          payload.issueNotes = reason.trim();
        }
      }
      if (isCancelling && order.paymentStatus === "paid") {
        payload.confirmRefundIfPaid = confirmRefundIfPaid;
      }

      const res = await workspaceFetch<OrderDetailDto>(`/api/tenant/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.data) {
        setErrorMsg(res.error || "No se pudo actualizar el estado del pedido.");
        return;
      }

      onTransitioned(res.data);
      onClose();
    } catch {
      setErrorMsg("Error de conexión al actualizar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-transition-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            {isCancelling ? (
              <ShieldAlert className="h-5 w-5 text-rose-500" />
            ) : (
              <RefreshCw className="h-5 w-5 text-[var(--dsn-accent)]" />
            )}
            <h2
              id="order-transition-modal-title"
              className="text-base font-bold text-[var(--dsn-text)]"
            >
              {isCancelling ? w.ordersTransitionCancelTitle : w.ordersTransitionTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
            aria-label={w.ordersDetailClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-bold text-[var(--dsn-accent)]">
                {order.orderNumber}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClasses(order.status)}`}
              >
                {getOrderStatusLabel(order.status, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[var(--dsn-text-secondary)]">
              <span>{order.customerName}</span>
              <span className="font-mono font-semibold text-[var(--dsn-text)]">
                {formatOrderMoneyCents(order.totalCents, order.currency, locale)}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="order-target-status"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {w.ordersTransitionTargetLabel}
            </label>
            <select
              id="order-target-status"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              disabled={saving || availableTargets.length === 0}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
            >
              {availableTargets.map((st) => (
                <option key={st} value={st}>
                  {getOrderStatusLabel(st, locale)}
                </option>
              ))}
            </select>
          </div>

          {isDispatched && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                <Truck className="h-4 w-4" />
                <span>{w.ordersDetailCarrier}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="transition-carrier-name"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    {w.ordersTransitionCarrierLabel}
                  </label>
                  <input
                    id="transition-carrier-name"
                    list="tenant-carriers-list"
                    required
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="Servientrega, Coordinadora..."
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                  />
                  <datalist id="tenant-carriers-list">
                    {carriers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label
                    htmlFor="transition-tracking-code"
                    className="block text-xs font-medium text-[var(--dsn-text)] mb-1"
                  >
                    {w.ordersTransitionTrackingLabel}
                  </label>
                  <input
                    id="transition-tracking-code"
                    required
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="SRV-998811"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)]"
                  />
                </div>
              </div>
            </div>
          )}

          {isCancelling && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-200 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                <p>
                  {paidCancelBlockedForAgent
                    ? w.ordersTransitionPaidOwnerOnly
                    : order.stockDeducted
                      ? locale === "en"
                        ? "Stock previously deducted for this order will be automatically restored."
                        : "El inventario descontado por este pedido será restituido automáticamente."
                      : locale === "en"
                        ? "This order will be marked as cancelled permanently."
                        : "El pedido quedará marcado como cancelado de forma permanente."}
                </p>
              </div>
              {order.paymentStatus === "paid" && isOwner && (
                <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRefundIfPaid}
                    onChange={(e) => setConfirmRefundIfPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--dsn-border)]"
                  />
                  <span>{w.ordersTransitionRefundConfirm}</span>
                </label>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="transition-reason"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {isDeliveryIssue ? w.ordersTransitionIssueLabel : w.ordersTransitionReasonLabel}
            </label>
            <textarea
              id="transition-reason"
              rows={2}
              required={isCancelling || isDeliveryIssue}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--dsn-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
            >
              {w.crmCancelCta}
            </button>
            <button
              type="submit"
              disabled={saving || !targetStatus || paidCancelBlockedForAgent}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                isCancelling
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-[var(--dsn-accent)] hover:opacity-95"
              }`}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isCancelling ? w.ordersTransitionCancelOrderCta : w.ordersTransitionConfirmCta}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

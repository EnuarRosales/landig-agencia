"use client";

import React, { useState } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert, Truck } from "lucide-react";
import type { OrderDetailDto, OrderListItemDto, OrderStatus } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";
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
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className="w-full max-w-lg overflow-hidden p-0 gap-0"
        closeAriaLabel={w.ordersDetailClose}
        aria-labelledby="order-transition-modal-title"
        disableEscapeKeyDown={saving}
        disableInteractOutside={saving}
      >
        <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
          {isCancelling ? (
            <ShieldAlert className="h-5 w-5 text-rose-500" />
          ) : (
            <RefreshCw className="h-5 w-5 text-[var(--dsn-accent)]" />
          )}
          <DialogTitle
            id="order-transition-modal-title"
            className="text-base font-bold text-[var(--dsn-text)]"
          >
            {isCancelling ? w.ordersTransitionCancelTitle : w.ordersTransitionTitle}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="space-y-1.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3.5 text-xs">
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
            <Label htmlFor="order-target-status" className="mb-1.5 block text-xs font-semibold">
              {w.ordersTransitionTargetLabel}
            </Label>
            <Select
              id="order-target-status"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              disabled={saving || availableTargets.length === 0}
              className="text-sm"
            >
              {availableTargets.map((st) => (
                <option key={st} value={st}>
                  {getOrderStatusLabel(st, locale)}
                </option>
              ))}
            </Select>
          </div>

          {isDispatched && (
            <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-300">
                <Truck className="h-4 w-4" />
                <span>{w.ordersDetailCarrier}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label
                    htmlFor="transition-carrier-name"
                    className="mb-1 block text-xs font-medium"
                  >
                    {w.ordersTransitionCarrierLabel}
                  </Label>
                  <Input
                    id="transition-carrier-name"
                    list="tenant-carriers-list"
                    required
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="Servientrega, Coordinadora..."
                    className="text-sm"
                  />
                  <datalist id="tenant-carriers-list">
                    {carriers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label
                    htmlFor="transition-tracking-code"
                    className="mb-1 block text-xs font-medium"
                  >
                    {w.ordersTransitionTrackingLabel}
                  </Label>
                  <Input
                    id="transition-tracking-code"
                    required
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value)}
                    placeholder="SRV-998811"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {isCancelling && (
            <Alert variant="error" className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <AlertDescription>
                  {paidCancelBlockedForAgent
                    ? w.ordersTransitionPaidOwnerOnly
                    : order.stockDeducted
                      ? locale === "en"
                        ? "Stock previously deducted for this order will be automatically restored."
                        : "El inventario descontado por este pedido será restituido automáticamente."
                      : locale === "en"
                        ? "This order will be marked as cancelled permanently."
                        : "El pedido quedará marcado como cancelado de forma permanente."}
                </AlertDescription>
              </div>
              {order.paymentStatus === "paid" && isOwner && (
                <label className="flex cursor-pointer items-center gap-2 pt-1 font-medium">
                  <Checkbox
                    checked={confirmRefundIfPaid}
                    onCheckedChange={(checked) => setConfirmRefundIfPaid(checked === true)}
                  />
                  <span>{w.ordersTransitionRefundConfirm}</span>
                </label>
              )}
            </Alert>
          )}

          <div>
            <Label htmlFor="transition-reason" className="mb-1.5 block text-xs font-semibold">
              {isDeliveryIssue ? w.ordersTransitionIssueLabel : w.ordersTransitionReasonLabel}
            </Label>
            <Textarea
              id="transition-reason"
              rows={2}
              required={isCancelling || isDeliveryIssue}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm"
            />
          </div>

          {errorMsg && (
            <Alert variant="error">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="border-t border-[var(--dsn-border)] pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {w.crmCancelCta}
            </Button>
            <Button
              type="submit"
              variant={isCancelling ? "destructive" : "primary"}
              disabled={saving || !targetStatus || paidCancelBlockedForAgent}
              loading={saving}
              loadingText={
                isCancelling ? w.ordersTransitionCancelOrderCta : w.ordersTransitionConfirmCta
              }
            >
              {isCancelling ? w.ordersTransitionCancelOrderCta : w.ordersTransitionConfirmCta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

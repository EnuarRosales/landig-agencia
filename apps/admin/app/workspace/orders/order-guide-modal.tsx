"use client";

import React, { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import type { OrderListItemDto } from "@mocter/domain";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface OrderGuideModalProps {
  isOpen: boolean;
  order: OrderListItemDto | null;
  locale: AdminLocale;
  onClose: () => void;
  onGuideTriggered?: () => void;
}

export function OrderGuideModal({
  isOpen,
  order,
  locale,
  onClose,
  onGuideTriggered,
}: OrderGuideModalProps) {
  const w = getAdminDictionary(locale).workspace;
  const [size, setSize] = useState<"10x15" | "letter">("10x15");
  const [advanceStatus, setAdvanceStatus] = useState(true);

  if (!isOpen || !order) return null;

  const canAdvance = order.status === "preparing";

  const buildUrl = (format: "html" | "pdf") => {
    const adv = canAdvance && advanceStatus ? "&advance=true" : "";
    return `/api/tenant/orders/${order.id}/guide?format=${format}&size=${size}${adv}`;
  };

  const handleOpen = (format: "html" | "pdf") => {
    window.open(buildUrl(format), "_blank", "noopener,noreferrer");
    onGuideTriggered?.();
    onClose();
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-full max-w-md overflow-hidden p-0 gap-0"
        closeAriaLabel={w.ordersDetailClose}
        aria-labelledby="order-guide-modal-title"
      >
        <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
          <Printer className="h-5 w-5 text-[var(--dsn-accent)]" />
          <DialogTitle id="order-guide-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
            {w.ordersGuideTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3.5 py-2.5 text-xs">
            <span className="font-mono font-bold text-[var(--dsn-accent)]">{order.orderNumber}</span>
            <span className="font-medium text-[var(--dsn-text)]">{order.customerName}</span>
          </div>

          <div>
            <Label htmlFor="guide-paper-size" className="mb-1.5 block text-xs font-semibold">
              {w.ordersGuideSizeLabel}
            </Label>
            <Select
              id="guide-paper-size"
              value={size}
              onChange={(e) => setSize(e.target.value as "10x15" | "letter")}
              className="text-sm"
            >
              <option value="10x15">{w.ordersGuideSizeThermal}</option>
              <option value="letter">{w.ordersGuideSizeLetter}</option>
            </Select>
          </div>

          {canAdvance && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--dsn-text)]">
              <Checkbox
                checked={advanceStatus}
                onCheckedChange={(checked) => setAdvanceStatus(checked === true)}
              />
              <span>
                {locale === "en"
                  ? "Move order status to Guide Generated automatically"
                  : "Avanzar automáticamente a Guía Generada"}
              </span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-2.5 border-t border-[var(--dsn-border)] pt-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => handleOpen("html")}>
              <FileText className="h-4 w-4 text-[var(--dsn-accent)]" />
              {w.ordersGuideOpenHtml}
            </Button>
            <Button type="button" onClick={() => handleOpen("pdf")}>
              <Download className="h-4 w-4" />
              {w.ordersGuideDownloadPdf}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { Download, FileText, Printer, X } from "lucide-react";
import type { OrderListItemDto } from "@mocter/domain";
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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-guide-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Printer className="h-5 w-5 text-[var(--dsn-accent)]" />
            <h2
              id="order-guide-modal-title"
              className="text-base font-bold text-[var(--dsn-text)]"
            >
              {w.ordersGuideTitle}
            </h2>
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

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3.5 py-2.5 text-xs flex items-center justify-between">
            <span className="font-mono font-bold text-[var(--dsn-accent)]">{order.orderNumber}</span>
            <span className="text-[var(--dsn-text)] font-medium">{order.customerName}</span>
          </div>

          <div>
            <label
              htmlFor="guide-paper-size"
              className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
            >
              {w.ordersGuideSizeLabel}
            </label>
            <select
              id="guide-paper-size"
              value={size}
              onChange={(e) => setSize(e.target.value as "10x15" | "letter")}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-sm text-[var(--dsn-text)]"
            >
              <option value="10x15">{w.ordersGuideSizeThermal}</option>
              <option value="letter">{w.ordersGuideSizeLetter}</option>
            </select>
          </div>

          {canAdvance && (
            <label className="flex items-center gap-2 text-xs text-[var(--dsn-text)] cursor-pointer">
              <input
                type="checkbox"
                checked={advanceStatus}
                onChange={(e) => setAdvanceStatus(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--dsn-border)]"
              />
              <span>
                {locale === "en"
                  ? "Move order status to Guide Generated automatically"
                  : "Avanzar automáticamente a Guía Generada"}
              </span>
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[var(--dsn-border)]">
            <button
              type="button"
              onClick={() => handleOpen("html")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
            >
              <FileText className="h-4 w-4 text-[var(--dsn-accent)]" />
              {w.ordersGuideOpenHtml}
            </button>
            <button
              type="button"
              onClick={() => handleOpen("pdf")}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95"
            >
              <Download className="h-4 w-4" />
              {w.ordersGuideDownloadPdf}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

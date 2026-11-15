"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Box,
  Edit3,
  FileText,
  Image as ImageIcon,
  Layers,
  Music,
  Package,
  Sparkles,
  Star,
  Video,
  X,
} from "lucide-react";
import type { ProductDetailDto } from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatStorageBytes } from "@/components/catalog-quota-banner";
import { formatMoneyCents } from "./product-ui-helpers";

export interface ProductDetailModalProps {
  isOpen: boolean;
  product: ProductDetailDto | null;
  loading?: boolean;
  error?: string | null;
  locale?: AdminLocale;
  onClose: () => void;
  onEdit: (product: ProductDetailDto) => void;
}

/**
 * Modal de solo lectura para consultar ficha técnica completa, multimedia y rentabilidad del producto.
 */
export function ProductDetailModal({
  isOpen,
  product,
  loading = false,
  error = null,
  locale = "es",
  onClose,
  onEdit,
}: ProductDetailModalProps) {
  const dict = getAdminDictionary(locale).workspace;
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const images = product?.media.images ?? [];
  const videos = product?.media.videos ?? [];
  const audios = product?.media.audios ?? [];
  const pdfs = product?.media.pdfs ?? [];
  const primaryImage =
    selectedImageUrl ||
    images.find((m) => m.isCover)?.url ||
    images[0]?.url ||
    product?.coverImageUrl ||
    null;

  const statusLabel = (s: ProductDetailDto["status"]) =>
    s === "active"
      ? dict.productsFilterStatusActive
      : s === "inactive"
        ? dict.productsFilterStatusInactive
        : dict.productsFilterStatusDraft;

  const kindLabel = (k: ProductDetailDto["kind"]) =>
    k === "physical"
      ? dict.productsFilterKindPhysical
      : k === "digital"
        ? dict.productsFilterKindDigital
        : dict.productsFilterKindService;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dict.productsDetailModalTitle}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 md:p-6 backdrop-blur-xs"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Package className="h-5 w-5 shrink-0 text-[var(--dsn-accent)]" />
            <h3 className="truncate text-base font-bold text-[var(--dsn-text)]">
              {dict.productsDetailModalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.productsCloseModal}
            className="rounded-lg p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-[var(--dsn-text-secondary)]">
              Cargando ficha del producto...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
              {error}
            </div>
          ) : !product ? null : (
            <>
              {product.hasInactiveComboComponent && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{dict.productsInactiveComponentWarning}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                {/* Galería visual principal */}
                <div className="md:col-span-5 space-y-3">
                  <div className="aspect-square overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] flex items-center justify-center">
                    {primaryImage ? (
                      <img
                        src={primaryImage}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-12 w-12 text-[var(--dsn-text-secondary)]/40" />
                    )}
                  </div>

                  {images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {images.map((img) => {
                        const active = (selectedImageUrl ?? primaryImage) === img.url;
                        return (
                          <button
                            key={img.mediaId}
                            type="button"
                            onClick={() => setSelectedImageUrl(img.url)}
                            className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${
                              active
                                ? "border-[var(--dsn-accent)] ring-2 ring-[var(--dsn-accent)]/40"
                                : "border-[var(--dsn-border)] opacity-80 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={img.thumbUrl || img.url}
                              alt={img.altText || img.originalFilename}
                              className="h-full w-full object-cover"
                            />
                            {img.isCover && (
                              <span
                                title={dict.productsMediaCoverBadge}
                                className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-amber-400"
                              >
                                <Star className="h-2.5 w-2.5 fill-amber-400" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Resumen general, precios y stock */}
                <div className="md:col-span-7 space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                          product.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : product.status === "inactive"
                              ? "bg-slate-500/10 text-slate-400 border-slate-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {statusLabel(product.status)}
                      </span>
                      <span className="rounded-full bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--dsn-text-secondary)] border border-[var(--dsn-border)]">
                        {kindLabel(product.kind)}
                      </span>
                      {product.compositionType === "combo" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400 border border-indigo-500/20">
                          <Layers className="h-3 w-3" />
                          <span>{dict.productsFilterCompositionCombo}</span>
                        </span>
                      )}
                    </div>
                    <h4 className="text-lg font-bold text-[var(--dsn-text)]">{product.name}</h4>
                    <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] whitespace-pre-line">
                      {product.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--dsn-text-secondary)] font-mono">
                      {product.sku && <span>SKU: {product.sku}</span>}
                      {product.category && <span>{product.category}</span>}
                      {product.brand && <span>{product.brand}</span>}
                    </div>
                  </div>

                  {/* Tarjeta de precios y rentabilidad */}
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5 text-xs">
                    <div>
                      <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.productsFieldPriceLabel}
                      </span>
                      <p className="font-mono text-sm font-bold text-[var(--dsn-text)]">
                        {formatMoneyCents(product.priceCents, product.currency, locale)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.productsFieldCostLabel}
                      </span>
                      <p className="font-mono text-sm font-semibold text-[var(--dsn-text)]">
                        {formatMoneyCents(product.costPriceCents, product.currency, locale)}
                      </p>
                    </div>
                    {product.salePriceCents !== null && product.salePriceCents > 0 && (
                      <div>
                        <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {dict.productsFieldSalePriceLabel}
                        </span>
                        <p className="font-mono text-sm font-semibold text-emerald-400">
                          {formatMoneyCents(product.salePriceCents, product.currency, locale)}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.productsProfitAmountLabel}
                      </span>
                      <p
                        className={`font-mono text-sm font-semibold ${
                          product.profitability.isNegative ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {formatMoneyCents(product.profitability.profitCents, product.currency, locale)}{" "}
                        ({product.profitability.marginPct}%)
                      </p>
                    </div>
                  </div>

                  {/* Stock efectivo */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-[var(--dsn-accent)]" />
                      <span className="font-semibold text-[var(--dsn-text)]">
                        {dict.productsColStock}:
                      </span>
                      <span className="font-mono font-bold text-[var(--dsn-text)]">
                        {product.effectiveStock === null
                          ? dict.productsUnlimitedStock
                          : product.effectiveStock}
                      </span>
                    </div>
                    {product.isLowStock && (
                      <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400 border border-rose-500/20">
                        {dict.productsLowStockBadge}
                      </span>
                    )}
                  </div>

                  {/* Atributos dinámicos */}
                  {product.attributes.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-[var(--dsn-text)]">
                        {dict.productsAttributesTitle}
                      </h5>
                      <div className="space-y-1.5">
                        {product.attributes.map((attr) => (
                          <div key={attr.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-semibold text-[var(--dsn-text)]">{attr.name}:</span>
                            {attr.values.map((val) => (
                              <span
                                key={val}
                                className="rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[11px] text-[var(--dsn-text)]"
                              >
                                {val}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Componentes de combo */}
              {product.compositionType === "combo" && product.comboComponents.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-[var(--dsn-text)]">
                    {dict.productsComboTitle}
                  </h5>
                  <div className="overflow-x-auto rounded-xl border border-[var(--dsn-border)]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--dsn-surface-secondary)]/50 text-[var(--dsn-text-secondary)]">
                        <tr>
                          <th className="px-3 py-2 font-medium">{dict.productsFieldNameLabel}</th>
                          <th className="px-3 py-2 font-medium">{dict.productsComboQtyLabel}</th>
                          <th className="px-3 py-2 font-medium">{dict.productsColStock}</th>
                          <th className="px-3 py-2 font-medium">{dict.productsColStatus}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--dsn-border)]">
                        {product.comboComponents.map((comp) => (
                          <tr key={comp.componentProductId}>
                            <td className="px-3 py-2 font-medium text-[var(--dsn-text)]">
                              {comp.name}
                            </td>
                            <td className="px-3 py-2 font-mono">{comp.quantity}</td>
                            <td className="px-3 py-2 font-mono">
                              {comp.kind === "physical"
                                ? comp.stockQuantity ?? 0
                                : dict.productsUnlimitedStock}
                            </td>
                            <td className="px-3 py-2">{statusLabel(comp.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Multimedia multimodal: Video, Audio y PDF */}
              {(videos.length > 0 || audios.length > 0 || pdfs.length > 0) && (
                <div className="space-y-4">
                  {videos.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                        <Video className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                        <span>{dict.productsMediaVideosHeading}</span>
                      </h5>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {videos.map((v) => (
                          <div
                            key={v.mediaId}
                            className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-black"
                          >
                            <video controls preload="metadata" className="w-full max-h-56" src={v.url} />
                            <div className="bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-[11px] text-[var(--dsn-text-secondary)] flex justify-between">
                              <span className="truncate">{v.originalFilename}</span>
                              <span className="font-mono">{formatStorageBytes(v.sizeBytes)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {audios.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                        <Music className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                        <span>{dict.productsMediaAudiosHeading}</span>
                      </h5>
                      <div className="space-y-2">
                        {audios.map((a) => (
                          <div
                            key={a.mediaId}
                            className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[11px] text-[var(--dsn-text)]">
                              <span className="font-medium truncate">{a.originalFilename}</span>
                              <span className="font-mono text-[var(--dsn-text-secondary)]">
                                {formatStorageBytes(a.sizeBytes)}
                              </span>
                            </div>
                            <audio controls preload="metadata" className="w-full" src={a.url} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pdfs.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                        <FileText className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                        <span>{dict.productsMediaPdfsHeading}</span>
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {pdfs.map((doc) => (
                          <a
                            key={doc.mediaId}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                          >
                            <FileText className="h-3.5 w-3.5 text-rose-400" />
                            <span>{doc.originalFilename}</span>
                            <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">
                              ({formatStorageBytes(doc.sizeBytes)})
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt Maestro */}
              {product.botMasterPrompt.trim().length > 0 && (
                <div className="space-y-2">
                  <h5 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <span>{dict.productsPromptLabel}</span>
                  </h5>
                  <pre className="whitespace-pre-wrap rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5 text-xs text-[var(--dsn-text)] font-sans max-h-60 overflow-y-auto">
                    {product.botMasterPrompt}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--dsn-border)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.productsCloseModal}
          </button>
          {product && (
            <button
              type="button"
              onClick={() => onEdit(product)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{dict.productsActionEdit}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

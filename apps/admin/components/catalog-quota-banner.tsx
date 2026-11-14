"use client";

import React from "react";
import Link from "next/link";
import {
  Package,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  HardDrive,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface CatalogQuotaItem {
  mode: "LIMITED" | "UNLIMITED";
  value: number | null;
}

export interface CatalogQuotaLimits {
  products: CatalogQuotaItem;
  imagesPerProduct: CatalogQuotaItem;
  videosPerProduct: CatalogQuotaItem;
  audiosPerProduct: CatalogQuotaItem;
  pdfsPerProduct: CatalogQuotaItem;
  storageBytes: CatalogQuotaItem;
}

export interface CatalogQuotaBannerProps {
  planName?: string;
  limits: CatalogQuotaLimits;
  productsUsed?: number;
  storageBytesUsed?: number;
  compact?: boolean;
  upgradeHref?: string;
  locale?: AdminLocale;
}

/**
 * Formatea bytes en unidades legibles (KB, MB o GB) para vistas de catálogo y cuotas.
 */
export function formatStorageBytes(bytes: number | null | undefined): string {
  const safe = Number(bytes ?? 0);
  if (safe <= 0) return "0 MB";
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (safe >= gb) {
    const val = safe / gb;
    return `${Number.isInteger(val) ? val : val.toFixed(1)} GB`;
  }
  if (safe >= mb) {
    const val = safe / mb;
    return `${Number.isInteger(val) ? val : val.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(safe / 1024))} KB`;
}

function formatAllowance(item: CatalogQuotaItem, unlimitedLabel: string, notIncludedLabel: string): string {
  if (item.mode === "UNLIMITED") return unlimitedLabel;
  const val = item.value ?? 0;
  if (val <= 0) return notIncludedLabel;
  return `${val}`;
}

/**
 * Banner reutilizable que muestra las capacidades reales de catálogo y archivos multimedia
 * incluidas en el plan del comercio antes de cargar productos o medios.
 */
export function CatalogQuotaBanner({
  planName,
  limits,
  productsUsed,
  storageBytesUsed,
  compact = false,
  upgradeHref,
  locale = "es",
}: CatalogQuotaBannerProps) {
  const dict = getAdminDictionary(locale).workspace;

  const isProductsLimited = limits.products.mode === "LIMITED";
  const productsCap = limits.products.value ?? 0;
  const hasProductsCount = typeof productsUsed === "number";
  const isProductsExhausted =
    isProductsLimited && hasProductsCount && (productsCap === 0 || productsUsed >= productsCap);
  const isProductsNearLimit =
    isProductsLimited &&
    !isProductsExhausted &&
    hasProductsCount &&
    productsCap > 0 &&
    productsUsed / productsCap >= 0.85;

  const formatProductsText = () => {
    if (limits.products.mode === "UNLIMITED") {
      return hasProductsCount ? `${productsUsed} / ${dict.billingUnlimited}` : dict.billingUnlimited;
    }
    if (productsCap <= 0) return dict.billingNotIncluded;
    return hasProductsCount ? `${productsUsed} / ${productsCap}` : `${productsCap}`;
  };

  const formatStorageText = () => {
    if (limits.storageBytes.mode === "UNLIMITED") {
      return typeof storageBytesUsed === "number"
        ? `${formatStorageBytes(storageBytesUsed)} / ${dict.billingUnlimited}`
        : dict.billingUnlimited;
    }
    const capBytes = limits.storageBytes.value ?? 0;
    if (capBytes <= 0) return dict.billingNotIncluded;
    return typeof storageBytesUsed === "number"
      ? `${formatStorageBytes(storageBytesUsed)} / ${formatStorageBytes(capBytes)}`
      : formatStorageBytes(capBytes);
  };

  const items = [
    {
      key: "products",
      icon: Package,
      label: locale === "en" ? "Products" : "Productos",
      value: formatProductsText(),
      excluded: limits.products.mode === "LIMITED" && productsCap <= 0,
    },
    {
      key: "images",
      icon: ImageIcon,
      label: locale === "en" ? "Images / Product" : "Imágenes / Producto",
      value: formatAllowance(limits.imagesPerProduct, dict.billingUnlimited, dict.billingNotIncluded),
      excluded: limits.imagesPerProduct.mode === "LIMITED" && (limits.imagesPerProduct.value ?? 0) <= 0,
    },
    {
      key: "videos",
      icon: Video,
      label: locale === "en" ? "Videos / Product" : "Videos / Producto",
      value: formatAllowance(limits.videosPerProduct, dict.billingUnlimited, dict.billingNotIncluded),
      excluded: limits.videosPerProduct.mode === "LIMITED" && (limits.videosPerProduct.value ?? 0) <= 0,
    },
    {
      key: "audios",
      icon: Music,
      label: locale === "en" ? "Audios / Product" : "Audios / Producto",
      value: formatAllowance(limits.audiosPerProduct, dict.billingUnlimited, dict.billingNotIncluded),
      excluded: limits.audiosPerProduct.mode === "LIMITED" && (limits.audiosPerProduct.value ?? 0) <= 0,
    },
    {
      key: "pdfs",
      icon: FileText,
      label: locale === "en" ? "PDFs / Product" : "PDFs / Producto",
      value: formatAllowance(limits.pdfsPerProduct, dict.billingUnlimited, dict.billingNotIncluded),
      excluded: limits.pdfsPerProduct.mode === "LIMITED" && (limits.pdfsPerProduct.value ?? 0) <= 0,
    },
    {
      key: "storage",
      icon: HardDrive,
      label: locale === "en" ? "Storage" : "Almacenamiento",
      value: formatStorageText(),
      excluded: limits.storageBytes.mode === "LIMITED" && (limits.storageBytes.value ?? 0) <= 0,
    },
  ];

  return (
    <div
      data-testid="catalog-quota-banner"
      className={`rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 ${
        compact ? "p-3.5 space-y-2.5" : "p-4 space-y-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
          <p className="text-xs font-semibold text-[var(--dsn-text)]">
            {dict.catalogQuotaBannerTitle}
            {planName ? ` · ${planName}` : ""}
          </p>
        </div>

        {(isProductsExhausted || isProductsNearLimit) && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                isProductsExhausted
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>
                {isProductsExhausted ? dict.catalogQuotaExhausted : dict.catalogQuotaNearLimit}
              </span>
            </span>
            {upgradeHref && (
              <Link
                href={upgradeHref}
                className="text-[11px] font-semibold text-[var(--dsn-accent)] hover:underline"
              >
                {dict.billingUpgradeCta}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="rounded-lg border border-[var(--dsn-border)]/70 bg-[var(--dsn-surface)] px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--dsn-text-secondary)]">
                <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--dsn-accent)]" />
                <span className="truncate">{item.label}</span>
              </div>
              <p
                className={`mt-1 text-xs font-semibold font-mono truncate ${
                  item.excluded ? "text-[var(--dsn-text-secondary)]" : "text-[var(--dsn-text)]"
                }`}
              >
                {item.value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

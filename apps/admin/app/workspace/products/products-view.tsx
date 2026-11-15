"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Layers,
  Package,
  Plus,
  Power,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  CatalogListResultDto,
  ProductCompositionType,
  ProductDetailDto,
  ProductKind,
  ProductListItemDto,
  ProductStatus,
  WorkspaceBillingDto,
  WorkspaceProductDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import {
  CatalogQuotaBanner,
  type CatalogQuotaLimits,
} from "@/components/catalog-quota-banner";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { ProductDetailModal } from "./product-detail-modal";
import { ProductFormModal, type ProductFormTab } from "./product-form-modal";
import {
  detailToListItem,
  formatMoneyCents,
  resolveInitialCatalog,
} from "./product-ui-helpers";

type SortByOption = "createdAt" | "name" | "priceCents" | "stock" | "status";

export interface ProductsViewProps {
  initialCatalog?: CatalogListResultDto | null;
  initialProducts?: WorkspaceProductDto[];
  initialBilling?: WorkspaceBillingDto | null;
  canDelete?: boolean;
  locale?: AdminLocale;
  hasInferenceAccess?: boolean;
  initialCurrency?: string;
}

function buildQuotaBannerData(
  billing: WorkspaceBillingDto | null,
  fallbackProductsCount: number,
): {
  planName: string;
  limits: CatalogQuotaLimits;
  productsUsed: number;
  storageBytesUsed: number;
} | null {
  if (!billing) return null;

  const productsQuota = billing.quotas.find((q) => q.dimension === "products");
  const storageQuota = billing.quotas.find(
    (q) => q.dimension === "storage_bytes" || q.dimension === "media_storage_bytes",
  );

  return {
    planName: billing.plan.name,
    limits: {
      products: productsQuota
        ? { mode: productsQuota.mode, value: productsQuota.limit }
        : { mode: "UNLIMITED", value: null },
      imagesPerProduct: {
        mode: billing.mediaLimits.imagesPerProduct.mode,
        value: billing.mediaLimits.imagesPerProduct.value,
      },
      videosPerProduct: {
        mode: billing.mediaLimits.videosPerProduct.mode,
        value: billing.mediaLimits.videosPerProduct.value,
      },
      audiosPerProduct: {
        mode: billing.mediaLimits.audiosPerProduct.mode,
        value: billing.mediaLimits.audiosPerProduct.value,
      },
      pdfsPerProduct: {
        mode: billing.mediaLimits.pdfsPerProduct.mode,
        value: billing.mediaLimits.pdfsPerProduct.value,
      },
      storageBytes: storageQuota
        ? { mode: storageQuota.mode, value: storageQuota.limit }
        : { mode: "UNLIMITED", value: null },
    },
    productsUsed: Math.max(productsQuota?.used ?? 0, fallbackProductsCount),
    storageBytesUsed: storageQuota?.used ?? 0,
  };
}

/**
 * Vista interactiva del Catálogo de Productos, Combos, Inventario y Multimedia.
 */
export function ProductsView({
  initialCatalog = null,
  initialProducts = [],
  initialBilling = null,
  canDelete = true,
  locale = "es",
  hasInferenceAccess = true,
  initialCurrency = "COP",
}: ProductsViewProps) {
  const dict = getAdminDictionary(locale).workspace;

  const [catalog, setCatalog] = useState<CatalogListResultDto>(() =>
    resolveInitialCatalog(initialCatalog, initialProducts),
  );
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [kindFilter, setKindFilter] = useState<ProductKind | "all">("all");
  const [compositionFilter, setCompositionFilter] = useState<ProductCompositionType | "all">(
    "all",
  );
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortByOption>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(catalog.pagination?.page ?? 1);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<ProductDetailDto | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitialTab, setFormInitialTab] = useState<ProductFormTab>("general");
  const [formLoadingDetail, setFormLoadingDetail] = useState(false);
  const [formProduct, setFormProduct] = useState<ProductDetailDto | null>(null);

  const [statusModalTarget, setStatusModalTarget] = useState<ProductListItemDto | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleteModalTarget, setDeleteModalTarget] = useState<ProductListItemDto | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [toastBanner, setToastBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const defaultCurrency = useMemo(() => {
    const firstCurrency = catalog.items[0]?.currency;
    return firstCurrency || initialCurrency || "COP";
  }, [catalog.items, initialCurrency]);

  const hasActiveFilters = Boolean(
    searchInput.trim() ||
      statusFilter !== "all" ||
      kindFilter !== "all" ||
      compositionFilter !== "all" ||
      lowStockOnly,
  );

  const quotaBannerData = useMemo(
    () => buildQuotaBannerData(initialBilling, catalog.pagination.total),
    [initialBilling, catalog.pagination.total],
  );

  async function loadCatalog(overrides?: {
    q?: string;
    status?: ProductStatus | "all";
    kind?: ProductKind | "all";
    compositionType?: ProductCompositionType | "all";
    lowStock?: boolean;
    page?: number;
    sortBy?: SortByOption;
    sortDir?: "asc" | "desc";
  }) {
    const qVal = overrides?.q ?? searchInput;
    const statusVal = overrides?.status ?? statusFilter;
    const kindVal = overrides?.kind ?? kindFilter;
    const compVal = overrides?.compositionType ?? compositionFilter;
    const lowStockVal = overrides?.lowStock ?? lowStockOnly;
    const pageVal = overrides?.page ?? page;
    const sortByVal = overrides?.sortBy ?? sortBy;
    const sortDirVal = overrides?.sortDir ?? sortDir;

    setLoadingList(true);
    setListError(null);

    const params = new URLSearchParams();
    params.set("page", String(pageVal));
    params.set("limit", String(catalog.pagination.limit || 20));
    params.set("sortBy", sortByVal);
    params.set("sortDir", sortDirVal);

    if (qVal.trim()) {
      params.set("q", qVal.trim());
    }
    if (statusVal !== "all") {
      params.set("status", statusVal);
    }
    if (kindVal !== "all") {
      params.set("kind", kindVal);
    }
    if (compVal !== "all") {
      params.set("compositionType", compVal);
    }
    if (lowStockVal) {
      params.set("lowStock", "true");
    }

    const res = await workspaceFetch<CatalogListResultDto>(
      `/api/tenant/products?${params.toString()}`,
    );
    setLoadingList(false);

    if (!res.ok || !res.data || !Array.isArray(res.data.items) || !res.data.pagination) {
      setListError(
        res.error ||
          (locale === "en"
            ? "Could not refresh the product catalog."
            : "No se pudo actualizar el catálogo de productos."),
      );
      return;
    }

    setCatalog(res.data);
    setPage(res.data.pagination.page ?? 1);
  }

  function handleSearchInputChange(nextValue: string) {
    setSearchInput(nextValue);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      void loadCatalog({ q: nextValue, page: 1 });
    }, 300);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setPage(1);
    void loadCatalog({ q: searchInput, page: 1 });
  }

  function handleResetFilters() {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearchInput("");
    setStatusFilter("all");
    setKindFilter("all");
    setCompositionFilter("all");
    setLowStockOnly(false);
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
    void loadCatalog({
      q: "",
      status: "all",
      kind: "all",
      compositionType: "all",
      lowStock: false,
      sortBy: "createdAt",
      sortDir: "desc",
      page: 1,
    });
  }

  async function openDetailModal(productId: string) {
    setDetailOpen(true);
    setDetailProduct(null);
    setDetailLoading(true);
    setDetailError(null);

    const res = await workspaceFetch<ProductDetailDto>(
      `/api/tenant/products/${encodeURIComponent(productId)}`,
    );
    setDetailLoading(false);
    if (!res.ok || !res.data) {
      setDetailError(
        res.error ||
          (locale === "en"
            ? "Could not load the product detail."
            : "No se pudo cargar el detalle del producto."),
      );
      return;
    }
    setDetailProduct(res.data);
  }

  function openCreateModal() {
    setFormMode("create");
    setFormInitialTab("general");
    setFormProduct(null);
    setFormLoadingDetail(false);
    setFormOpen(true);
  }

  async function openEditModal(productId: string, initialTab: ProductFormTab = "general") {
    setFormMode("edit");
    setFormInitialTab(initialTab);
    setFormProduct(null);
    setFormLoadingDetail(true);
    setFormOpen(true);

    const res = await workspaceFetch<ProductDetailDto>(
      `/api/tenant/products/${encodeURIComponent(productId)}`,
    );
    setFormLoadingDetail(false);
    if (!res.ok || !res.data) {
      setFormOpen(false);
      setToastBanner({
        type: "error",
        message:
          res.error ||
          (locale === "en"
            ? "Could not load the product for editing."
            : "No se pudo cargar el producto para edición."),
      });
      return;
    }
    setFormProduct(res.data);
  }

  function handleFormSaved(detail: ProductDetailDto, meta: { isCreate: boolean }) {
    const item = detailToListItem(detail);
    setCatalog((prev) => {
      const exists = prev.items.some((existing) => existing.id === item.id);
      const nextItems = exists
        ? prev.items.map((existing) => (existing.id === item.id ? item : existing))
        : [item, ...prev.items];
      return {
        ...prev,
        items: nextItems,
        pagination: {
          ...prev.pagination,
          total: exists ? prev.pagination.total : prev.pagination.total + 1,
        },
      };
    });
    if (detailProduct?.id === detail.id) {
      setDetailProduct(detail);
    }
    setFormOpen(false);
    setFormProduct(null);
    setToastBanner({
      type: "success",
      message: meta.isCreate
        ? locale === "en"
          ? "Product created and added to catalog."
          : "Producto creado y agregado al catálogo."
        : locale === "en"
          ? "Product changes saved."
          : "Cambios del producto guardados correctamente.",
    });
    void loadCatalog();
  }

  function handleProductChanged(detail: ProductDetailDto) {
    const item = detailToListItem(detail);
    setCatalog((prev) => ({
      ...prev,
      items: prev.items.map((existing) => (existing.id === item.id ? item : existing)),
    }));
    if (detailProduct?.id === detail.id) {
      setDetailProduct(detail);
    }
  }

  async function handleConfirmStatusToggle() {
    if (!statusModalTarget) return;
    const isCurrentlyActive = statusModalTarget.status === "active";
    const targetStatus: ProductStatus = isCurrentlyActive ? "inactive" : "active";

    setStatusLoading(true);
    setStatusError(null);
    const res = await workspaceFetch<ProductDetailDto>(
      `/api/tenant/products/${encodeURIComponent(statusModalTarget.id)}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      },
    );
    setStatusLoading(false);

    if (!res.ok || !res.data) {
      setStatusError(
        res.error ||
          (locale === "en"
            ? "Could not update product status."
            : "No se pudo actualizar el estado del producto."),
      );
      return;
    }

    const updatedItem = detailToListItem(res.data);
    setCatalog((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    }));
    setStatusModalTarget(null);
    setToastBanner({
      type: "success",
      message:
        targetStatus === "active"
          ? locale === "en"
            ? "Product activated in catalog."
            : "Producto activado en el catálogo."
          : locale === "en"
            ? "Product inactivated."
            : "Producto inactivado.",
    });
    void loadCatalog();
  }

  async function handleConfirmDelete() {
    if (!deleteModalTarget || !canDelete) return;

    setDeleteLoading(true);
    setDeleteError(null);
    const res = await workspaceFetch<{ deleted: boolean }>(
      `/api/tenant/products/${encodeURIComponent(deleteModalTarget.id)}`,
      { method: "DELETE" },
    );
    setDeleteLoading(false);

    if (!res.ok) {
      setDeleteError(
        res.error ||
          (locale === "en"
            ? "Could not delete this product."
            : "No se pudo eliminar este producto."),
      );
      return;
    }

    const deletedId = deleteModalTarget.id;
    setCatalog((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== deletedId),
      pagination: {
        ...prev.pagination,
        total: Math.max(0, prev.pagination.total - 1),
      },
    }));
    setDeleteModalTarget(null);
    setToastBanner({
      type: "success",
      message:
        locale === "en" ? "Product removed from catalog." : "Producto eliminado del catálogo.",
    });
    void loadCatalog();
  }

  function renderStatusLabel(status: ProductStatus): string {
    if (status === "active") return dict.productsFilterStatusActive;
    if (status === "inactive") return dict.productsFilterStatusInactive;
    return dict.productsFilterStatusDraft;
  }

  function renderStatusBadgeClass(status: ProductStatus): string {
    if (status === "active") {
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30";
    }
    if (status === "inactive") {
      return "bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30";
    }
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30";
  }

  function renderKindLabel(kind: ProductKind): string {
    if (kind === "physical") return dict.productsFilterKindPhysical;
    if (kind === "digital") return dict.productsFilterKindDigital;
    return dict.productsFilterKindService;
  }

  function renderStockDisplay(item: ProductListItemDto) {
    if (item.effectiveStock === null) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          {dict.productsUnlimitedStock}
        </span>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.isLowStock || item.effectiveStock === 0
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
              : "bg-slate-500/10 text-[var(--dsn-text)]"
          }`}
        >
          {item.effectiveStock}
        </span>
        {item.isLowStock && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" />
            {dict.productsLowStockBadge}
          </span>
        )}
        {item.hasInactiveComboComponent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {dict.productsInactiveComponentWarning}
          </span>
        )}
      </div>
    );
  }

  const inventoryCountLabel =
    catalog.pagination.total === 1 ? dict.productsCountSingular : dict.productsCountPlural;

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Cabecera Principal */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.productsPageTitle}
          </h1>
          <p className="mt-1 text-xs md:text-sm text-[var(--dsn-text-secondary)]">
            {dict.productsInventoryTitle}: {catalog.pagination.total} {inventoryCountLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadCatalog()}
            disabled={loadingList}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 text-[var(--dsn-accent)] ${loadingList ? "animate-spin" : ""}`}
            />
            <span>{locale === "en" ? "Refresh" : "Actualizar"}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>{dict.productsNewAction}</span>
          </button>
        </div>
      </header>

      {/* Cuota del Plan */}
      {quotaBannerData && (
        <CatalogQuotaBanner
          planName={quotaBannerData.planName}
          limits={quotaBannerData.limits}
          productsUsed={quotaBannerData.productsUsed}
          storageBytesUsed={quotaBannerData.storageBytesUsed}
          upgradeHref="/workspace/billing"
          locale={locale}
        />
      )}

      {/* Alerta Inline de Operación */}
      {toastBanner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            toastBanner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastBanner.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{toastBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastBanner(null)}
            className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label={dict.productsCloseModal}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Métricas Resumidas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="text-xs font-medium text-[var(--dsn-text-secondary)]">
            {dict.productsInventoryTitle}
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--dsn-text)]">
            {catalog.pagination.total}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="text-xs font-medium text-[var(--dsn-text-secondary)]">
            {dict.productsSummaryActive}
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {catalog.summary.totalActive}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="text-xs font-medium text-[var(--dsn-text-secondary)]">
            {dict.productsSummaryCombos}
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--dsn-text)]">
            {catalog.summary.comboCount}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const next = !lowStockOnly;
            setLowStockOnly(next);
            setPage(1);
            void loadCatalog({ lowStock: next, page: 1 });
          }}
          className={`rounded-xl border p-4 text-left transition-colors ${
            lowStockOnly
              ? "border-amber-500 bg-amber-500/10"
              : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] hover:border-amber-500/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-[var(--dsn-text-secondary)]">
            <span>{dict.productsSummaryLowStock}</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {catalog.summary.lowStockCount}
          </div>
        </button>
      </div>

      {/* Barra de Búsqueda, Filtros y Ordenamiento */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dsn-text-secondary)]" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder={dict.productsSearchPlaceholder}
              aria-label={dict.productsSearchPlaceholder}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] py-2 pl-9 pr-3 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />
          </form>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <select
              aria-label={dict.productsColStatus}
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value as ProductStatus | "all";
                setStatusFilter(next);
                setPage(1);
                void loadCatalog({ status: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)]"
            >
              <option value="all">{dict.productsFilterAllStatuses}</option>
              <option value="active">{dict.productsFilterStatusActive}</option>
              <option value="draft">{dict.productsFilterStatusDraft}</option>
              <option value="inactive">{dict.productsFilterStatusInactive}</option>
            </select>

            <select
              aria-label={dict.productsFieldKindLabel}
              value={kindFilter}
              onChange={(e) => {
                const next = e.target.value as ProductKind | "all";
                setKindFilter(next);
                setPage(1);
                void loadCatalog({ kind: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)]"
            >
              <option value="all">{dict.productsFilterAllKinds}</option>
              <option value="physical">{dict.productsFilterKindPhysical}</option>
              <option value="digital">{dict.productsFilterKindDigital}</option>
              <option value="service">{dict.productsFilterKindService}</option>
            </select>

            <select
              aria-label={dict.productsFieldCompositionLabel}
              value={compositionFilter}
              onChange={(e) => {
                const next = e.target.value as ProductCompositionType | "all";
                setCompositionFilter(next);
                setPage(1);
                void loadCatalog({ compositionType: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)]"
            >
              <option value="all">{dict.productsFilterAllCompositions}</option>
              <option value="simple">{dict.productsFilterCompositionSimple}</option>
              <option value="combo">{dict.productsFilterCompositionCombo}</option>
            </select>

            <div className="flex items-center gap-1.5">
              <select
                aria-label={locale === "en" ? "Sort By" : "Ordenar Por"}
                value={sortBy}
                onChange={(e) => {
                  const next = e.target.value as SortByOption;
                  setSortBy(next);
                  setPage(1);
                  void loadCatalog({ sortBy: next, page: 1 });
                }}
                className="flex-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)]"
              >
                <option value="createdAt">{dict.productsSortNewest}</option>
                <option value="name">{dict.productsSortName}</option>
                <option value="priceCents">{dict.productsSortPrice}</option>
                <option value="stock">{dict.productsSortStock}</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  const nextDir = sortDir === "asc" ? "desc" : "asc";
                  setSortDir(nextDir);
                  void loadCatalog({ sortDir: nextDir, page: 1 });
                }}
                title={sortDir === "asc" ? "Ascendente" : "Descendente"}
                aria-label={sortDir === "asc" ? "Ascendente" : "Descendente"}
                className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-2 text-[var(--dsn-text)] hover:bg-[var(--dsn-surface)]"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dsn-border)] pt-2.5 text-xs">
            <span className="text-[var(--dsn-text-secondary)]">
              {locale === "en" ? "Active filters applied" : "Filtros activos aplicados"}
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="font-medium text-[var(--dsn-accent)] hover:underline"
            >
              {locale === "en" ? "Clear All Filters" : "Limpiar Filtros"}
            </button>
          </div>
        )}
      </div>

      {/* Error de Listado */}
      {listError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {listError}
        </div>
      )}

      {/* Estado Vacío o Tabla/Tarjetas */}
      {catalog.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-[var(--dsn-text-secondary)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--dsn-text)]">
            {hasActiveFilters
              ? locale === "en"
                ? "No Matching Products Found"
                : "No Hay Productos Con Esos Filtros"
              : dict.productsEmptyTitle}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--dsn-text-secondary)]">
            {hasActiveFilters
              ? locale === "en"
                ? "Try clearing your search or filter selections."
                : "Prueba limpiando la búsqueda o ajustando los filtros seleccionados."
              : dict.productsEmptyDesc}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-4 py-2 text-sm font-medium text-[var(--dsn-text)]"
              >
                {locale === "en" ? "Clear Filters" : "Limpiar Filtros"}
              </button>
            ) : (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                <span>{dict.productsFirstAction}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Vista Móvil (Mobile First) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {catalog.items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] flex items-center justify-center">
                    {item.coverImageUrl ? (
                      <img
                        src={item.coverImageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-[var(--dsn-text-secondary)]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate font-semibold text-[var(--dsn-text)]">
                        {item.name}
                      </h3>
                      {item.compositionType === "combo" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--dsn-accent)]">
                          <Layers className="h-3 w-3" />
                          {dict.productsFilterCompositionCombo}
                        </span>
                      )}
                    </div>
                    {item.sku && (
                      <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">SKU: {item.sku}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${renderStatusBadgeClass(
                          item.status,
                        )}`}
                      >
                        {renderStatusLabel(item.status)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--dsn-text-secondary)]">
                        <Box className="h-3 w-3" />
                        {renderKindLabel(item.kind)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--dsn-surface-secondary)] p-2.5 text-xs">
                  <div>
                    <div className="text-[var(--dsn-text-secondary)]">{dict.productsColPrice}</div>
                    <div className="mt-0.5 font-semibold text-[var(--dsn-text)]">
                      {formatMoneyCents(
                        item.salePriceCents ?? item.priceCents,
                        item.currency,
                        locale,
                      )}
                    </div>
                    <div className="text-[var(--dsn-text-secondary)]">
                      {dict.productsMarginLabel}: {item.profitability.marginPct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--dsn-text-secondary)]">{dict.productsColStock}</div>
                    <div className="mt-1">{renderStockDisplay(item)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => void openDetailModal(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{dict.productsActionView}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void openEditModal(item.id, "general")}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>{dict.productsActionEdit}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void openEditModal(item.id, "media")}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>{dict.productsActionUpload}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusError(null);
                      setStatusModalTarget(item);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>
                      {item.status === "active"
                        ? dict.productsActionInactivate
                        : dict.productsActionActivate}
                    </span>
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteModalTarget(item);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{dict.productsActionDelete}</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Vista Escritorio */}
          <div className="hidden overflow-x-auto rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-xs font-semibold text-[var(--dsn-text-secondary)]">
                  <th className="px-4 py-3">{dict.productsColThumbnail}</th>
                  <th className="px-4 py-3">{dict.productsColName}</th>
                  <th className="px-4 py-3">{dict.productsColType}</th>
                  <th className="px-4 py-3">{dict.productsColPrice}</th>
                  <th className="px-4 py-3">{dict.productsColStock}</th>
                  <th className="px-4 py-3">{dict.productsColStatus}</th>
                  <th className="px-4 py-3 text-right">{dict.productsColActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {catalog.items.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--dsn-surface-secondary)]/50">
                    <td className="px-4 py-3">
                      <div className="h-11 w-11 overflow-hidden rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] flex items-center justify-center">
                        {item.coverImageUrl ? (
                          <img
                            src={item.coverImageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-[var(--dsn-text-secondary)]" />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void openDetailModal(item.id)}
                        className="text-left font-semibold text-[var(--dsn-text)] hover:text-[var(--dsn-accent)]"
                      >
                        {item.name}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
                        {item.sku && <span>SKU: {item.sku}</span>}
                        {item.category && <span>{item.category}</span>}
                        {item.mediaCounts.image +
                          item.mediaCounts.video +
                          item.mediaCounts.audio +
                          item.mediaCounts.pdf >
                          0 && (
                          <span>
                            •{" "}
                            {item.mediaCounts.image +
                              item.mediaCounts.video +
                              item.mediaCounts.audio +
                              item.mediaCounts.pdf}{" "}
                            {dict.productsTabMedia}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-[var(--dsn-text)]">
                          {renderKindLabel(item.kind)}
                        </span>
                        {item.compositionType === "combo" ? (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--dsn-accent)]">
                            <Layers className="h-3 w-3" />
                            {dict.productsFilterCompositionCombo} ({item.comboComponentsCount})
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--dsn-text-secondary)]">
                            {dict.productsFilterCompositionSimple}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--dsn-text)]">
                        {formatMoneyCents(
                          item.salePriceCents ?? item.priceCents,
                          item.currency,
                          locale,
                        )}
                      </div>
                      {item.salePriceCents !== null && item.salePriceCents < item.priceCents && (
                        <div className="text-xs text-[var(--dsn-text-secondary)] line-through">
                          {formatMoneyCents(item.priceCents, item.currency, locale)}
                        </div>
                      )}
                      <div className="text-xs text-[var(--dsn-text-secondary)]">
                        {dict.productsMarginLabel}: {item.profitability.marginPct.toFixed(1)}%
                      </div>
                    </td>

                    <td className="px-4 py-3">{renderStockDisplay(item)}</td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${renderStatusBadgeClass(
                          item.status,
                        )}`}
                      >
                        {renderStatusLabel(item.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openDetailModal(item.id)}
                          title={dict.productsActionView}
                          aria-label={`${dict.productsActionView} ${item.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2 py-1 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEditModal(item.id, "general")}
                          title={dict.productsActionEdit}
                          aria-label={`${dict.productsActionEdit} ${item.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2 py-1 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void openEditModal(item.id, "media")}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{dict.productsActionUpload}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusError(null);
                            setStatusModalTarget(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>
                            {item.status === "active"
                              ? dict.productsActionInactivate
                              : dict.productsActionActivate}
                          </span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteModalTarget(item);
                            }}
                            title={dict.productsActionDelete}
                            aria-label={`${dict.productsActionDelete} ${item.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{dict.productsActionDelete}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {catalog.pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-3 text-sm">
              <div className="text-[var(--dsn-text-secondary)]">
                {catalog.pagination.page} {dict.productsPaginationPageOf}{" "}
                {catalog.pagination.totalPages} ({catalog.pagination.total} {inventoryCountLabel})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={catalog.pagination.page <= 1 || loadingList}
                  onClick={() => {
                    const nextPage = Math.max(1, catalog.pagination.page - 1);
                    setPage(nextPage);
                    void loadCatalog({ page: nextPage });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{dict.productsPaginationPrev}</span>
                </button>
                <button
                  type="button"
                  disabled={catalog.pagination.page >= catalog.pagination.totalPages || loadingList}
                  onClick={() => {
                    const nextPage = Math.min(
                      catalog.pagination.totalPages,
                      catalog.pagination.page + 1,
                    );
                    setPage(nextPage);
                    void loadCatalog({ page: nextPage });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] disabled:opacity-50"
                >
                  <span>{dict.productsPaginationNext}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Detalle Completo */}
      <ProductDetailModal
        isOpen={detailOpen}
        product={detailProduct}
        loading={detailLoading}
        error={detailError}
        locale={locale}
        onClose={() => setDetailOpen(false)}
        onEdit={(prod) => {
          setDetailOpen(false);
          setFormMode("edit");
          setFormInitialTab("general");
          setFormProduct(prod);
          setFormLoadingDetail(false);
          setFormOpen(true);
        }}
      />

      {/* Modal de Creación / Edición en 5 Pestañas */}
      <ProductFormModal
        isOpen={formOpen}
        mode={formMode}
        initialTab={formInitialTab}
        initialProduct={formProduct}
        loadingDetail={formLoadingDetail}
        currency={defaultCurrency}
        billing={initialBilling}
        locale={locale}
        hasInferenceAccess={hasInferenceAccess}
        onClose={() => setFormOpen(false)}
        onSaved={handleFormSaved}
        onProductChanged={handleProductChanged}
      />

      {/* Modal de Confirmación de Cambio de Estado (Sin Diálogos Nativos) */}
      <ConfirmationModal
        isOpen={Boolean(statusModalTarget)}
        onClose={() => {
          if (!statusLoading) {
            setStatusModalTarget(null);
            setStatusError(null);
          }
        }}
        onConfirm={() => void handleConfirmStatusToggle()}
        title={
          statusModalTarget?.status === "active"
            ? dict.productsStatusModalInactivateTitle
            : dict.productsStatusModalActivateTitle
        }
        subtitle={dict.productsStatusModalSubtitle}
        variant={statusModalTarget?.status === "active" ? "warning" : "neutral"}
        details={
          statusModalTarget
            ? [
                { label: dict.productsFieldNameLabel, value: statusModalTarget.name },
                {
                  label: dict.productsFieldSkuLabel,
                  value: statusModalTarget.sku || "—",
                },
                {
                  label: dict.productsColStock,
                  value:
                    statusModalTarget.effectiveStock === null
                      ? dict.productsUnlimitedStock
                      : String(statusModalTarget.effectiveStock),
                },
              ]
            : []
        }
        warningTitle={
          statusModalTarget?.status === "active"
            ? dict.productsActionInactivate
            : dict.productsActionActivate
        }
        warningMessage={
          statusModalTarget?.status === "active"
            ? dict.productsStatusModalWarningInactivate
            : dict.productsStatusModalWarningActivate
        }
        confirmText={
          statusModalTarget?.status === "active"
            ? dict.productsStatusConfirmInactivate
            : dict.productsStatusConfirmActivate
        }
        cancelText={dict.productsCancelAction}
        loading={statusLoading}
        error={statusError}
      />

      {/* Modal de Confirmación de Eliminación (Solo Propietario, Sin Diálogos Nativos) */}
      {canDelete && (
        <ConfirmationModal
          isOpen={Boolean(deleteModalTarget)}
          onClose={() => {
            if (!deleteLoading) {
              setDeleteModalTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={() => void handleConfirmDelete()}
          title={dict.productsDeleteModalTitle}
          subtitle={dict.productsDeleteModalSubtitle}
          variant="danger"
          details={
            deleteModalTarget
              ? [
                  { label: dict.productsFieldNameLabel, value: deleteModalTarget.name },
                  {
                    label: dict.productsFieldSkuLabel,
                    value: deleteModalTarget.sku || "—",
                  },
                  {
                    label: dict.productsColPrice,
                    value: formatMoneyCents(
                      deleteModalTarget.salePriceCents ?? deleteModalTarget.priceCents,
                      deleteModalTarget.currency,
                      locale,
                    ),
                  },
                ]
              : []
          }
          warningTitle={dict.productsDeleteWarningTitle}
          warningMessage={dict.productsDeleteWarningBody}
          confirmText={dict.productsDeleteConfirmAction}
          confirmLoadingText={dict.productsDeleteLoadingAction}
          cancelText={dict.productsDeleteKeepAction}
          loading={deleteLoading}
          error={deleteError}
        />
      )}
    </div>
  );
}

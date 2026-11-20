"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Edit3,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import type {
  ProductListItemDto,
  PromotionDetailDto,
  PromotionLifecycleStatus,
  PromotionListItemDto,
  PromotionListResultDto,
  PromotionScopeType,
} from "@mocter/domain";
import { Alert, AlertDescription, Badge, Button, Card, Select } from "@mocter/ui";
import { ConfirmationModal } from "@/components/confirmation-modal";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { PromotionFormModal } from "./promotion-form-modal";
import {
  formatDiscountSummary,
  formatPromotionDateTime,
  getPromotionStatusBadgeClass,
} from "./promotion-ui-helpers";

export interface PromotionsViewProps {
  initialPromotions?: PromotionListResultDto | null;
  catalogProducts?: ProductListItemDto[];
  canDelete?: boolean;
  locale?: AdminLocale;
  currency?: string;
  hasInferenceAccess?: boolean;
}

const EMPTY_LIST: PromotionListResultDto = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  summary: {
    activeCount: 0,
    scheduledCount: 0,
    pausedCount: 0,
    expiredOrDepletedCount: 0,
    productsOnOfferTodayCount: 0,
  },
};

/**
 * Vista principal de la Central de Promociones (`/workspace/promotions`).
 */
export function PromotionsView({
  initialPromotions = null,
  catalogProducts = [],
  canDelete = false,
  locale = "es",
  currency = "COP",
  hasInferenceAccess = true,
}: PromotionsViewProps) {
  const dict = getAdminDictionary(locale).workspace;

  const [listData, setListData] = useState<PromotionListResultDto>(
    initialPromotions ?? EMPTY_LIST,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PromotionLifecycleStatus | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<PromotionScopeType | "all">("all");
  const [page, setPage] = useState(initialPromotions?.pagination.page ?? 1);
  const [pageSize, setPageSize] = useState(initialPromotions?.pagination.limit ?? 20);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingTarget, setEditingTarget] = useState<PromotionListItemDto | null>(null);

  const [toggleTarget, setToggleTarget] = useState<PromotionListItemDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionListItemDto | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const fetchPromotions = useCallback(
    async (opts?: {
      q?: string;
      status?: PromotionLifecycleStatus | "all";
      scopeType?: PromotionScopeType | "all";
      page?: number;
      limit?: number;
    }) => {
      const nextQ = opts?.q ?? searchQuery;
      const nextStatus = opts?.status ?? statusFilter;
      const nextScope = opts?.scopeType ?? scopeFilter;
      const nextPage = opts?.page ?? page;
      const nextLimit = opts?.limit ?? pageSize;

      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (nextQ.trim()) params.set("q", nextQ.trim());
        if (nextStatus !== "all") params.set("status", nextStatus);
        if (nextScope !== "all") params.set("scopeType", nextScope);
        params.set("page", String(nextPage));
        params.set("limit", String(nextLimit));

        const res = await workspaceFetch<PromotionListResultDto>(
          `/api/tenant/promotions?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        if (!res.ok || !res.data) {
          setFeedback({ type: "error", message: res.error || dict.promotionsLoadError });
          return;
        }
        setListData(res.data);
      } catch {
        setFeedback({ type: "error", message: dict.promotionsLoadError });
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, statusFilter, scopeFilter, page, pageSize, dict.promotionsLoadError],
  );

  function getStatusLabel(status: PromotionLifecycleStatus): string {
    switch (status) {
      case "active":
        return dict.promotionsStatusActive;
      case "scheduled":
        return dict.promotionsStatusScheduled;
      case "paused":
        return dict.promotionsStatusPaused;
      case "depleted":
        return dict.promotionsStatusDepleted;
      case "expired":
      default:
        return dict.promotionsStatusExpired;
    }
  }

  function getScopeLabel(scope: PromotionScopeType): string {
    switch (scope) {
      case "product":
        return dict.promotionsScopeProduct;
      case "category":
        return dict.promotionsScopeCategory;
      case "all_catalog":
      default:
        return dict.promotionsScopeAllCatalog;
    }
  }

  function handleOpenCreate() {
    setFormMode("create");
    setEditingTarget(null);
    setFormOpen(true);
  }

  function handleOpenEdit(row: PromotionListItemDto) {
    setFormMode("edit");
    setEditingTarget(row);
    setFormOpen(true);
  }

  function handleFormSaved(_detail: PromotionDetailDto, meta: { isCreate: boolean }) {
    setFormOpen(false);
    setEditingTarget(null);
    setFeedback({
      type: "success",
      message: meta.isCreate ? dict.promotionsSavedCreate : dict.promotionsSavedUpdate,
    });
    void fetchPromotions({ page: 1 });
  }

  async function handleConfirmToggleStatus() {
    if (!toggleTarget) return;
    const nextIsActive = !toggleTarget.isActive;
    setMutatingId(toggleTarget.id);
    try {
      const res = await workspaceFetch<PromotionDetailDto>(
        `/api/tenant/promotions/${encodeURIComponent(toggleTarget.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: nextIsActive }),
        },
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error || dict.promotionsLoadError });
        return;
      }
      setToggleTarget(null);
      setFeedback({
        type: "success",
        message: nextIsActive
          ? dict.promotionsStatusActivatedSuccess
          : dict.promotionsStatusPausedSuccess,
      });
      await fetchPromotions();
    } finally {
      setMutatingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setMutatingId(deleteTarget.id);
    try {
      const res = await workspaceFetch<{ id: string; deleted: true }>(
        `/api/tenant/promotions/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setFeedback({ type: "error", message: res.error || dict.promotionsLoadError });
        return;
      }
      setDeleteTarget(null);
      setFeedback({ type: "success", message: dict.promotionsDeletedSuccess });
      await fetchPromotions();
    } finally {
      setMutatingId(null);
    }
  }

  const columns: WorkspaceTableColumn<PromotionListItemDto>[] = useMemo(
    () => [
      {
        key: "name",
        header: dict.promotionsColCampaign,
        renderCell: (row) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--dsn-text)]">{row.name}</span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {formatDiscountSummary(row.discountType, row.discountValue, currency, locale)}
              </span>
            </div>
            {row.description && (
              <p className="line-clamp-1 text-xs text-[var(--dsn-text-secondary)]">
                {row.description}
              </p>
            )}
          </div>
        ),
      },
      {
        key: "scopeType",
        header: dict.promotionsColScope,
        renderCell: (row) => (
          <div className="space-y-0.5 text-xs">
            <div className="font-medium text-[var(--dsn-text)]">{getScopeLabel(row.scopeType)}</div>
            <div className="text-[var(--dsn-text-secondary)]">
              {row.applicableProductsCount} {dict.promotionsProductsApplicable}
              {row.excludedProductsCount > 0 && (
                <span className="ml-1 text-amber-600 dark:text-amber-300">
                  · {row.excludedProductsCount} {dict.promotionsProductsExcluded}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "validity",
        header: dict.promotionsColValidity,
        renderCell: (row) => (
          <div className="space-y-0.5 text-xs">
            <div className="text-[var(--dsn-text)]">
              {formatPromotionDateTime(row.startsAt, locale)}
            </div>
            <div className="text-[var(--dsn-text-secondary)]">
              {row.endsAt
                ? `${dict.productsPromoValidUntil} ${formatPromotionDateTime(row.endsAt, locale)}`
                : dict.promotionsOpenEnded}
            </div>
          </div>
        ),
      },
      {
        key: "quota",
        header: dict.promotionsColQuota,
        renderCell: (row) => (
          <div className="text-xs font-mono text-[var(--dsn-text)]">
            {row.maxDiscountedUnits !== null ? (
              <span>
                {row.discountedUnitsSold} / {row.maxDiscountedUnits}
              </span>
            ) : (
              <span className="text-[var(--dsn-text-secondary)]">
                {dict.promotionsUnlimitedQuota}
              </span>
            )}
          </div>
        ),
      },
      {
        key: "margin",
        header: dict.promotionsColMargin,
        renderCell: (row) => {
          if (row.applicableProductsCount === 0) {
            return (
              <span className="text-xs text-[var(--dsn-text-secondary)]">
                {dict.promotionsMarginNoProducts}
              </span>
            );
          }
          if (row.lossProductsCount > 0) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {dict.promotionsMarginLoss} ({row.lossProductsCount})
              </span>
            );
          }
          if (row.tightMarginProductsCount > 0) {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {dict.promotionsMarginTight}
                {row.minMarginPct !== null ? ` (${row.minMarginPct.toFixed(1)}%)` : ""}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {dict.promotionsMarginHealthy}
              {row.minMarginPct !== null ? ` (${row.minMarginPct.toFixed(1)}%)` : ""}
            </span>
          );
        },
      },
      {
        key: "status",
        header: dict.promotionsColStatus,
        renderCell: (row) => (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPromotionStatusBadgeClass(row.lifecycleStatus)}`}
          >
            {getStatusLabel(row.lifecycleStatus)}
          </span>
        ),
      },
      {
        key: "actions",
        header: dict.promotionsColActions,
        align: "right",
        renderCell: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenEdit(row)}
              title={dict.promotionsActionEdit}
              className="h-8 min-h-0 px-2.5 text-xs font-medium"
            >
              <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span className="hidden xl:inline">{dict.promotionsActionEdit}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setToggleTarget(row)}
              disabled={mutatingId === row.id}
              title={row.isActive ? dict.promotionsActionPause : dict.promotionsActionActivate}
              className="h-8 min-h-0 px-2.5 text-xs font-medium"
            >
              {row.isActive ? (
                <PauseCircle className="h-3.5 w-3.5 text-amber-500" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
              )}
              <span className="hidden xl:inline">
                {row.isActive ? dict.promotionsActionPause : dict.promotionsActionActivate}
              </span>
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteTarget(row)}
                disabled={mutatingId === row.id}
                title={dict.promotionsActionDelete}
                className="h-8 min-h-0 px-2.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [dict, currency, locale, canDelete, mutatingId],
  );

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)] md:text-2xl">
            {dict.promotionsTitle}
          </h1>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] md:text-sm">
            {dict.promotionsSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchPromotions()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 text-[var(--dsn-accent)] ${loading ? "animate-spin" : ""}`} />
            <span>{dict.promotionsRefresh}</span>
          </Button>
          <Button type="button" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            <span>{dict.promotionsCreateNew}</span>
          </Button>
        </div>
      </header>

      {feedback && (
        <Alert
          role={feedback.type === "error" ? "alert" : "status"}
          variant={feedback.type === "success" ? "success" : "error"}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <AlertDescription>{feedback.message}</AlertDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="h-auto px-2 py-0.5 text-xs underline"
          >
            {dict.promotionsCancel}
          </Button>
        </Alert>
      )}

      {/* 4 Tarjetas KPI */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--dsn-text-secondary)]">
            <span>{dict.promotionsKpiActive}</span>
            <Tag className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {listData.summary.activeCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--dsn-text-secondary)]">
            <span>{dict.promotionsKpiScheduled}</span>
            <CalendarClock className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {listData.summary.scheduledCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--dsn-text-secondary)]">
            <span>{dict.promotionsKpiProductsOnOffer}</span>
            <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {listData.summary.productsOnOfferTodayCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--dsn-text-secondary)]">
            <span>{dict.promotionsKpiPausedOrEnded}</span>
            <PauseCircle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {listData.summary.pausedCount + listData.summary.expiredOrDepletedCount}
          </div>
        </Card>
      </section>

      <WorkspaceDataTable
        data={listData.items}
        columns={columns}
        getRowKey={(row) => row.id}
        locale={locale}
        totalItems={listData.pagination.total}
        page={listData.pagination.page}
        pageSize={listData.pagination.limit}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          void fetchPromotions({ page: nextPage });
        }}
        onPageSizeChange={(nextLimit) => {
          setPageSize(nextLimit);
          setPage(1);
          void fetchPromotions({ page: 1, limit: nextLimit });
        }}
        searchable
        searchQuery={searchQuery}
        searchPlaceholder={dict.promotionsSearchPlaceholder}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setPage(1);
          void fetchPromotions({ q, page: 1 });
        }}
        filterSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={dict.promotionsColStatus}
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value as PromotionLifecycleStatus | "all";
                setStatusFilter(next);
                setPage(1);
                void fetchPromotions({ status: next, page: 1 });
              }}
              className="w-auto min-h-[38px] text-xs"
            >
              <option value="all">{dict.promotionsFilterAllStatuses}</option>
              <option value="active">{dict.promotionsStatusActive}</option>
              <option value="scheduled">{dict.promotionsStatusScheduled}</option>
              <option value="paused">{dict.promotionsStatusPaused}</option>
              <option value="expired">{dict.promotionsStatusExpired}</option>
              <option value="depleted">{dict.promotionsStatusDepleted}</option>
            </Select>
            <Select
              aria-label={dict.promotionsColScope}
              value={scopeFilter}
              onChange={(e) => {
                const next = e.target.value as PromotionScopeType | "all";
                setScopeFilter(next);
                setPage(1);
                void fetchPromotions({ scopeType: next, page: 1 });
              }}
              className="w-auto min-h-[38px] text-xs"
            >
              <option value="all">{dict.promotionsFilterAllScopes}</option>
              <option value="all_catalog">{dict.promotionsScopeAllCatalog}</option>
              <option value="category">{dict.promotionsScopeCategory}</option>
              <option value="product">{dict.promotionsScopeProduct}</option>
            </Select>
          </div>
        }
        emptyState={{
          icon: <Tag className="h-8 w-8 text-[var(--dsn-accent)]" />,
          title: dict.promotionsEmptyTitle,
          description: dict.promotionsEmptyDescription,
          action: (
            <Button type="button" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              <span>{dict.promotionsCreateNew}</span>
            </Button>
          ),
        }}
      />

      <PromotionFormModal
        isOpen={formOpen}
        mode={formMode}
        initialPromotion={editingTarget}
        catalogProducts={catalogProducts}
        currency={currency}
        locale={locale}
        hasInferenceAccess={hasInferenceAccess}
        onClose={() => setFormOpen(false)}
        onSaved={handleFormSaved}
      />

      <ConfirmationModal
        isOpen={Boolean(toggleTarget)}
        title={
          toggleTarget?.isActive
            ? dict.promotionsConfirmToggleTitlePause
            : dict.promotionsConfirmToggleTitleActivate
        }
        warningMessage={
          toggleTarget?.isActive
            ? dict.promotionsConfirmToggleDescPause
            : dict.promotionsConfirmToggleDescActivate
        }
        confirmText={
          toggleTarget?.isActive ? dict.promotionsActionPause : dict.promotionsActionActivate
        }
        cancelText={dict.promotionsCancel}
        variant={toggleTarget?.isActive ? "warning" : "neutral"}
        loading={Boolean(toggleTarget && mutatingId === toggleTarget.id)}
        details={
          toggleTarget
            ? [
                { label: dict.promotionsFieldName, value: toggleTarget.name },
                {
                  label: dict.promotionsFieldDiscountType,
                  value: formatDiscountSummary(
                    toggleTarget.discountType,
                    toggleTarget.discountValue,
                    currency,
                    locale,
                  ),
                },
                { label: dict.promotionsColScope, value: getScopeLabel(toggleTarget.scopeType) },
              ]
            : []
        }
        onClose={() => setToggleTarget(null)}
        onConfirm={handleConfirmToggleStatus}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title={dict.promotionsConfirmDeleteTitle}
        warningMessage={dict.promotionsConfirmDeleteDesc}
        confirmText={dict.promotionsConfirmDeleteAction}
        cancelText={dict.promotionsCancel}
        variant="danger"
        loading={Boolean(deleteTarget && mutatingId === deleteTarget.id)}
        details={
          deleteTarget
            ? [
                { label: dict.promotionsFieldName, value: deleteTarget.name },
                {
                  label: dict.promotionsColQuota,
                  value:
                    deleteTarget.maxDiscountedUnits !== null
                      ? `${deleteTarget.discountedUnitsSold} / ${deleteTarget.maxDiscountedUnits}`
                      : dict.promotionsUnlimitedQuota,
                },
              ]
            : []
        }
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

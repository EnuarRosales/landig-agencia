"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Repeat,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type {
  OrderDetailDto,
  OrderListItemDto,
  OrderListResultDto,
  OrderStatus,
  RepeatOrderResult,
  WorkspaceOrderDto,
} from "@mocter/domain";
import { Badge, Button, Card, Input, Label, Select } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";
import {
  ALL_ORDER_STATUSES,
  formatOrderMoneyCents,
  getOrderStatusBadgeClasses,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from "./order-ui-helpers";
import { OrderDetailModal } from "./order-detail-modal";
import { OrderFormModal } from "./order-form-modal";
import { OrderStatusModal } from "./order-status-modal";
import { OrderGuideModal } from "./order-guide-modal";

export interface OrdersViewProps {
  initialOrderList?: OrderListResultDto | null;
  initialOrders?: WorkspaceOrderDto[];
  isOwner?: boolean;
  locale?: AdminLocale;
  initialCurrency?: string;
}

function normalizeInitialData(
  initialOrderList?: OrderListResultDto | null,
  initialOrders?: WorkspaceOrderDto[],
): OrderListResultDto {
  if (initialOrderList) return initialOrderList;

  const items: OrderListItemDto[] = (initialOrders ?? []).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    number: o.orderNumber,
    contactId: null,
    prospectId: null,
    contactAddressId: null,
    source: "manual",
    status: o.status as OrderStatus,
    paymentMethod: "manual",
    paymentChannelId: null,
    paymentStatus: o.paymentStatus,
    shippingMethod: "home",
    carrierId: null,
    carrierName: null,
    trackingCode: null,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerDocument: null,
    countryCode: "CO",
    subdivisionCode: null,
    city: null,
    state: null,
    addressLine: null,
    subtotalCents: o.totalCents,
    shippingCents: 0,
    discountCents: 0,
    totalCents: o.totalCents,
    currency: o.currency,
    stockDeducted: false,
    guideGeneratedAt: null,
    repeatedFromOrderId: null,
    canEditDetails:
      o.status === "pending_confirmation" ||
      o.status === "confirmed" ||
      o.status === "preparing" ||
      o.status === "guide_generated",
    allowedNextStatuses: [],
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  }));

  return {
    items,
    pagination: {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: 1,
    },
    summary: {
      total: items.length,
      pending: items.filter(
        (i) => i.status === "pending_confirmation" || i.status === "confirmed",
      ).length,
      preparingAndGuide: items.filter(
        (i) => i.status === "preparing" || i.status === "guide_generated",
      ).length,
      inTransitAndIssue: items.filter(
        (i) =>
          i.status === "dispatched" ||
          i.status === "in_transit" ||
          i.status === "out_for_delivery" ||
          i.status === "delivery_issue",
      ).length,
      delivered: items.filter((i) => i.status === "delivered").length,
      cancelledAndReturned: items.filter(
        (i) =>
          i.status === "cancelled" ||
          i.status === "returned" ||
          i.status === "return_in_progress",
      ).length,
      byStatus: {},
    },
  };
}

export function OrdersView({
  initialOrderList,
  initialOrders,
  isOwner = true,
  locale = "es",
  initialCurrency = "COP",
}: OrdersViewProps) {
  const w = getAdminDictionary(locale).workspace;
  const [data, setData] = useState<OrderListResultDto>(() =>
    normalizeInitialData(initialOrderList, initialOrders),
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<Array<{ id: string; name: string }>>([]);

  // Filtros y paginación
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("created_at:desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modales activos
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<{
    open: boolean;
    mode: "create" | "edit" | "repeat";
    order?: OrderDetailDto | null;
    repeatPayload?: RepeatOrderResult | null;
  }>({ open: false, mode: "create" });
  const [transitionModal, setTransitionModal] = useState<{
    open: boolean;
    order: OrderListItemDto | null;
    initialTarget?: OrderStatus;
  }>({ open: false, order: null });
  const [guideOrder, setGuideOrder] = useState<OrderListItemDto | null>(null);

  useEffect(() => {
    workspaceFetch<Array<{ id: string; name: string }>>("/api/tenant/orders/carriers")
      .then((res) => {
        if (res.ok && Array.isArray(res.data)) {
          setCarriers(res.data);
        }
      })
      .catch(() => {});
  }, []);

  async function fetchOrders(overrides?: {
    q?: string;
    status?: string;
    carrier?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const sp = new URLSearchParams();
      const qVal = overrides?.q ?? query;
      const stVal = overrides?.status ?? statusFilter;
      const carVal = overrides?.carrier ?? carrierFilter;
      const dfVal = overrides?.dateFrom ?? dateFrom;
      const dtVal = overrides?.dateTo ?? dateTo;
      const sortVal = overrides?.sort ?? sort;
      const pageVal = overrides?.page ?? page;
      const limitVal = overrides?.limit ?? limit;

      if (qVal.trim()) sp.set("q", qVal.trim());
      if (stVal && stVal !== "all") sp.set("status", stVal);
      if (carVal.trim()) sp.set("carrier", carVal.trim());
      if (dfVal) sp.set("dateFrom", dfVal);
      if (dtVal) sp.set("dateTo", dtVal);
      sp.set("sort", sortVal);
      sp.set("page", String(pageVal));
      sp.set("limit", String(limitVal));

      const res = await workspaceFetch<OrderListResultDto>(`/api/tenant/orders?${sp.toString()}`);
      if (!res.ok || !res.data) {
        setErrorMsg(res.error || "No se pudieron cargar los pedidos.");
        return;
      }
      setData(res.data);
    } catch {
      setErrorMsg("Error de conexión al consultar pedidos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenEdit(orderItem: OrderListItemDto) {
    try {
      const res = await workspaceFetch<OrderDetailDto>(`/api/tenant/orders/${orderItem.id}`);
      if (res.ok && res.data) {
        setFormModal({
          open: true,
          mode: "edit",
          order: res.data,
        });
      }
    } catch {
      setErrorMsg("No se pudo abrir la edición del pedido.");
    }
  }

  async function handleRepeatOrder(orderItem: OrderListItemDto) {
    setErrorMsg(null);
    try {
      const res = await workspaceFetch<RepeatOrderResult>(
        `/api/tenant/orders/${orderItem.id}/repeat`,
        {
          method: "POST",
          body: JSON.stringify({ confirmImmediately: false }),
        },
      );
      if (!res.ok || !res.data) {
        setErrorMsg(res.error || "No se pudo preparar la repetición del pedido.");
        return;
      }
      setDetailOrderId(null);
      setFormModal({
        open: true,
        mode: "repeat",
        repeatPayload: res.data,
      });
    } catch {
      setErrorMsg("Error de conexión al repetir el pedido.");
    }
  }

  function handleClearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCarrierFilter("");
    setDateFrom("");
    setDateTo("");
    setSort("created_at:desc");
    setPage(1);
    fetchOrders({
      q: "",
      status: "all",
      carrier: "",
      dateFrom: "",
      dateTo: "",
      sort: "created_at:desc",
      page: 1,
    });
  }

  const hasActiveFilters = Boolean(
    query.trim() || statusFilter !== "all" || carrierFilter.trim() || dateFrom || dateTo,
  );

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)] md:text-2xl">
              {w.ordersTitle}
            </h1>
            <Badge variant="accent">{w.ordersBadge}</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] md:text-sm">
            {w.ordersSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchOrders()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[var(--dsn-accent)] ${loading ? "animate-spin" : ""}`} />
            {w.ordersRefreshCta}
          </Button>
          <Button
            type="button"
            onClick={() => setFormModal({ open: true, mode: "create" })}
          >
            <Plus className="h-4 w-4" />
            {w.ordersNewCta}
          </Button>
        </div>
      </header>

      {/* Métricas rápidas */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiPending}</span>
            <Clock className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {data.summary.pending}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiPreparing}</span>
            <Package className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {data.summary.preparingAndGuide}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiTransit}</span>
            <Truck className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {data.summary.inTransitAndIssue}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiDelivered}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[var(--dsn-text)]">
            {data.summary.delivered}
          </div>
        </Card>
      </section>

      {/* Listado Estandarizado de Pedidos (<WorkspaceDataTable />) */}
      <WorkspaceDataTable<OrderListItemDto>
        testId="orders-data-table"
        locale={locale}
        data={data.items}
        getRowKey={(o) => o.id}
        page={data.pagination.page}
        pageSize={limit}
        totalItems={data.pagination.total}
        onPageChange={(next) => {
          setPage(next);
          void fetchOrders({ page: next });
        }}
        onPageSizeChange={(nextLimit) => {
          setLimit(nextLimit);
          setPage(1);
          void fetchOrders({ limit: nextLimit, page: 1 });
        }}
        sortBy={sort.split(":")[0] || "created_at"}
        sortDir={sort.split(":")[1] === "asc" ? "asc" : "desc"}
        onSortChange={(col, dir) => {
          const nextSort = `${col}:${dir}`;
          setSort(nextSort);
          setPage(1);
          void fetchOrders({ sort: nextSort, page: 1 });
        }}
        searchQuery={query}
        onSearchChange={(next) => {
          setQuery(next);
          setPage(1);
          void fetchOrders({ q: next, page: 1 });
        }}
        searchPlaceholder={w.ordersSearchPlaceholder}
        activeFiltersCount={
          (statusFilter !== "all" ? 1 : 0) +
          (carrierFilter.trim() ? 1 : 0) +
          (dateFrom ? 1 : 0) +
          (dateTo ? 1 : 0)
        }
        onResetFilters={handleClearFilters}
        loading={loading}
        error={errorMsg}
        onRetry={() => void fetchOrders()}
        filterSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={w.ordersColStatus}
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                setPage(1);
                void fetchOrders({ status: next, page: 1 });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="all">{w.ordersFilterStatusAll}</option>
              {ALL_ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getOrderStatusLabel(st, locale)}
                </option>
              ))}
            </Select>

            <Input
              type="text"
              aria-label={w.ordersFilterCarrierPlaceholder}
              placeholder={w.ordersFilterCarrierPlaceholder}
              value={carrierFilter}
              onChange={(e) => {
                const next = e.target.value;
                setCarrierFilter(next);
                setPage(1);
                void fetchOrders({ carrier: next, page: 1 });
              }}
              className="w-36 min-h-[40px] text-xs"
            />

            <Select
              aria-label={locale === "en" ? "Sort orders" : "Ordenar pedidos"}
              value={sort}
              onChange={(e) => {
                const next = e.target.value;
                setSort(next);
                setPage(1);
                void fetchOrders({ sort: next, page: 1 });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="created_at:desc">{w.ordersSortNewest}</option>
              <option value="created_at:asc">{w.ordersSortOldest}</option>
              <option value="total_cents:desc">{w.ordersSortTotalDesc}</option>
              <option value="total_cents:asc">{w.ordersSortTotalAsc}</option>
            </Select>

            <Label htmlFor="orders-date-from" className="text-[11px] font-normal text-[var(--dsn-text-secondary)]">
              {w.ordersFilterDateFrom}
            </Label>
            <Input
              id="orders-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const next = e.target.value;
                setDateFrom(next);
                setPage(1);
                void fetchOrders({ dateFrom: next, page: 1 });
              }}
              className="w-auto min-h-[38px] text-xs"
            />

            <Label htmlFor="orders-date-to" className="text-[11px] font-normal text-[var(--dsn-text-secondary)]">
              {w.ordersFilterDateTo}
            </Label>
            <Input
              id="orders-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                const next = e.target.value;
                setDateTo(next);
                setPage(1);
                void fetchOrders({ dateTo: next, page: 1 });
              }}
              className="w-auto min-h-[38px] text-xs"
            />
          </div>
        }
        emptyState={{
          icon: <ShoppingCart className="mx-auto h-10 w-10 text-[var(--dsn-text-secondary)]/50" />,
          title: w.ordersEmptyTitle,
          description: hasActiveFilters ? w.ordersEmptyFilteredDesc : w.ordersEmptyDesc,
          action: !hasActiveFilters ? (
            <Button type="button" onClick={() => setFormModal({ open: true, mode: "create" })}>
              <Plus className="h-4 w-4" />
              {w.ordersNewCta}
            </Button>
          ) : undefined,
        }}
        renderMobileCard={(o) => (
          <div key={o.id} className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-[var(--dsn-accent)]">
                {o.orderNumber}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClasses(o.status)}`}
              >
                {getOrderStatusLabel(o.status, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-[var(--dsn-text)]">{o.customerName}</div>
                <div className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                  {o.customerPhone} {o.city ? `· ${o.city}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-[var(--dsn-text)]">
                  {formatOrderMoneyCents(o.totalCents, o.currency, locale)}
                </div>
                <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                  {getPaymentStatusLabel(o.paymentStatus, locale)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDetailOrderId(o.id)}
                className="h-7 min-h-0 px-2.5 text-[11px]"
              >
                <Eye className="h-3 w-3 text-[var(--dsn-accent)]" />
                {w.ordersActionView}
              </Button>
              {o.canEditDetails && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEdit(o)}
                  className="h-7 min-h-0 px-2.5 text-[11px]"
                >
                  <Edit3 className="h-3 w-3 text-[var(--dsn-accent)]" />
                  {w.ordersActionEdit}
                </Button>
              )}
              {o.allowedNextStatuses.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTransitionModal({ open: true, order: o })}
                  className="h-7 min-h-0 px-2.5 text-[11px]"
                >
                  <RefreshCw className="h-3 w-3 text-[var(--dsn-accent)]" />
                  {w.ordersActionTransition}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGuideOrder(o)}
                className="h-7 min-h-0 px-2.5 text-[11px]"
              >
                <Printer className="h-3 w-3 text-[var(--dsn-accent)]" />
                {w.ordersActionGuide}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRepeatOrder(o)}
                className="h-7 min-h-0 px-2.5 text-[11px]"
              >
                <Repeat className="h-3 w-3 text-[var(--dsn-accent)]" />
                {w.ordersActionRepeat}
              </Button>
            </div>
          </div>
        )}
        columns={
          [
            {
              key: "number",
              header: w.ordersColNumber,
              sortable: true,
              renderCell: (o) => (
                <div>
                  <div className="font-mono font-bold text-[var(--dsn-accent)]">
                    {o.orderNumber}
                  </div>
                  <div className="text-[10px] text-[var(--dsn-text-secondary)]">
                    {new Date(o.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "es-CO")}
                  </div>
                </div>
              ),
            },
            {
              key: "customer_name",
              header: w.ordersColCustomer,
              sortable: true,
              renderCell: (o) => (
                <div>
                  <div className="font-semibold">{o.customerName}</div>
                  <div className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                    {o.customerPhone}
                  </div>
                </div>
              ),
            },
            {
              key: "location",
              header: w.ordersColLocation,
              renderCell: (o) => (
                <div>
                  <div>{o.city || "—"}</div>
                  <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {o.carrierName
                      ? `${o.carrierName}${o.trackingCode ? ` · ${o.trackingCode}` : ""}`
                      : o.shippingMethod === "office"
                        ? w.ordersFormShippingOffice
                        : w.ordersFormShippingHome}
                  </div>
                </div>
              ),
            },
            {
              key: "total_cents",
              header: w.ordersColTotal,
              sortable: true,
              isNumeric: true,
              renderCell: (o) => (
                <span className="font-mono font-semibold">
                  {formatOrderMoneyCents(o.totalCents, o.currency, locale)}
                </span>
              ),
            },
            {
              key: "status",
              header: w.ordersColStatus,
              sortable: true,
              renderCell: (o) => (
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClasses(o.status)}`}
                >
                  {getOrderStatusLabel(o.status, locale)}
                </span>
              ),
            },
            {
              key: "payment",
              header: w.ordersColPayment,
              renderCell: (o) => (
                <div>
                  <div className="font-semibold text-[11px]">
                    {getPaymentStatusLabel(o.paymentStatus, locale)}
                  </div>
                  <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {o.paymentMethod}
                  </div>
                </div>
              ),
            },
            {
              key: "actions",
              header: w.ordersColActions,
              align: "right",
              renderCell: (o) => (
                <div className="inline-flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={w.ordersActionView}
                    aria-label={`${w.ordersActionView} ${o.orderNumber}`}
                    onClick={() => setDetailOrderId(o.id)}
                    className="h-7 w-7 min-h-0"
                  >
                    <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  </Button>
                  {o.canEditDetails && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={w.ordersActionEdit}
                      aria-label={`${w.ordersActionEdit} ${o.orderNumber}`}
                      onClick={() => handleOpenEdit(o)}
                      className="h-7 w-7 min-h-0"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    </Button>
                  )}
                  {o.allowedNextStatuses.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title={w.ordersActionTransition}
                      aria-label={`${w.ordersActionTransition} ${o.orderNumber}`}
                      onClick={() => setTransitionModal({ open: true, order: o })}
                      className="h-7 w-7 min-h-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={w.ordersActionGuide}
                    aria-label={`${w.ordersActionGuide} ${o.orderNumber}`}
                    onClick={() => setGuideOrder(o)}
                    className="h-7 w-7 min-h-0"
                  >
                    <Printer className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={w.ordersActionRepeat}
                    aria-label={`${w.ordersActionRepeat} ${o.orderNumber}`}
                    onClick={() => handleRepeatOrder(o)}
                    className="h-7 w-7 min-h-0"
                  >
                    <Repeat className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  </Button>
                </div>
              ),
            },
          ] satisfies WorkspaceTableColumn<OrderListItemDto>[]
        }
      />

      <OrderDetailModal
        isOpen={Boolean(detailOrderId)}
        orderId={detailOrderId}
        isOwner={isOwner}
        locale={locale}
        onClose={() => setDetailOrderId(null)}
        onEdit={(order) => {
          setDetailOrderId(null);
          setFormModal({ open: true, mode: "edit", order });
        }}
        onTransition={(order) => {
          setDetailOrderId(null);
          setTransitionModal({ open: true, order });
        }}
        onPrintGuide={(order) => setGuideOrder(order)}
        onRepeat={(order) => handleRepeatOrder(order)}
        onPaymentStatusUpdated={() => fetchOrders()}
      />

      <OrderFormModal
        isOpen={formModal.open}
        mode={formModal.mode}
        initialOrder={formModal.order}
        repeatPayload={formModal.repeatPayload}
        currency={initialCurrency}
        locale={locale}
        carriers={carriers}
        onClose={() => setFormModal({ open: false, mode: "create" })}
        onSaved={() => fetchOrders({ page: 1 })}
      />

      <OrderStatusModal
        isOpen={transitionModal.open}
        order={transitionModal.order}
        initialTargetStatus={transitionModal.initialTarget}
        isOwner={isOwner}
        locale={locale}
        carriers={carriers}
        onClose={() => setTransitionModal({ open: false, order: null })}
        onTransitioned={() => fetchOrders()}
      />

      <OrderGuideModal
        isOpen={Boolean(guideOrder)}
        order={guideOrder}
        locale={locale}
        onClose={() => setGuideOrder(null)}
        onGuideTriggered={() => fetchOrders()}
      />
    </div>
  );
}

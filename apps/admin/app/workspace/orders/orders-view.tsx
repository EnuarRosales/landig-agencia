"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Repeat,
  Search,
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
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              {w.ordersTitle}
            </h1>
            <span className="rounded-full bg-[var(--dsn-accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/25">
              {w.ordersBadge}
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            {w.ordersSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchOrders()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[var(--dsn-accent)] ${loading ? "animate-spin" : ""}`} />
            {w.ordersRefreshCta}
          </button>
          <button
            type="button"
            onClick={() => setFormModal({ open: true, mode: "create" })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            {w.ordersNewCta}
          </button>
        </div>
      </header>

      {/* Métricas rápidas */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiPending}</span>
            <Clock className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {data.summary.pending}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiPreparing}</span>
            <Package className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {data.summary.preparingAndGuide}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiTransit}</span>
            <Truck className="h-4 w-4 text-cyan-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {data.summary.inTransitAndIssue}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4">
          <div className="flex items-center justify-between text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersKpiDelivered}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--dsn-text)]">
            {data.summary.delivered}
          </div>
        </div>
      </section>

      {/* Filtros y búsqueda */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="h-4 w-4 text-[var(--dsn-text-secondary)] absolute left-3 top-2.5" />
            <input
              type="search"
              aria-label={w.ordersSearchPlaceholder}
              placeholder={w.ordersSearchPlaceholder}
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                setPage(1);
                fetchOrders({ q: next, page: 1 });
              }}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] pl-9 pr-3 py-2 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>
          <div className="md:col-span-3">
            <select
              aria-label={w.ordersColStatus}
              value={statusFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStatusFilter(next);
                setPage(1);
                fetchOrders({ status: next, page: 1 });
              }}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
            >
              <option value="all">{w.ordersFilterStatusAll}</option>
              {ALL_ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getOrderStatusLabel(st, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <input
              type="text"
              aria-label={w.ordersFilterCarrierPlaceholder}
              placeholder={w.ordersFilterCarrierPlaceholder}
              value={carrierFilter}
              onChange={(e) => {
                const next = e.target.value;
                setCarrierFilter(next);
                setPage(1);
                fetchOrders({ carrier: next, page: 1 });
              }}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
            />
          </div>
          <div className="md:col-span-3">
            <select
              aria-label="Ordenar pedidos"
              value={sort}
              onChange={(e) => {
                const next = e.target.value;
                setSort(next);
                setPage(1);
                fetchOrders({ sort: next, page: 1 });
              }}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
            >
              <option value="created_at:desc">{w.ordersSortNewest}</option>
              <option value="created_at:asc">{w.ordersSortOldest}</option>
              <option value="total_cents:desc">{w.ordersSortTotalDesc}</option>
              <option value="total_cents:asc">{w.ordersSortTotalAsc}</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="orders-date-from" className="text-[var(--dsn-text-secondary)]">
              {w.ordersFilterDateFrom}
            </label>
            <input
              id="orders-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const next = e.target.value;
                setDateFrom(next);
                setPage(1);
                fetchOrders({ dateFrom: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
            />
            <label htmlFor="orders-date-to" className="text-[var(--dsn-text-secondary)]">
              {w.ordersFilterDateTo}
            </label>
            <input
              id="orders-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                const next = e.target.value;
                setDateTo(next);
                setPage(1);
                fetchOrders({ dateTo: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)]"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-semibold text-[var(--dsn-accent)] hover:underline ml-2"
              >
                {w.ordersClearFilters}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
            <span>{w.ordersPerPage}</span>
            <select
              aria-label={w.ordersPerPage}
              value={limit}
              onChange={(e) => {
                const next = Number(e.target.value) || 20;
                setLimit(next);
                setPage(1);
                fetchOrders({ limit: next, page: 1 });
              }}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2 py-1 text-xs text-[var(--dsn-text)]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-600 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Listado */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        {data.items.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShoppingCart className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto" />
            <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
              {w.ordersEmptyTitle}
            </h2>
            <p className="text-xs text-[var(--dsn-text-secondary)] max-w-sm mx-auto">
              {hasActiveFilters ? w.ordersEmptyFilteredDesc : w.ordersEmptyDesc}
            </p>
            {!hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFormModal({ open: true, mode: "create" })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                {w.ordersNewCta}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Vista Mobile First en tarjetas */}
            <div className="md:hidden divide-y divide-[var(--dsn-border)]">
              {data.items.map((o) => (
                <div key={o.id} className="p-4 space-y-3">
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
                    <button
                      type="button"
                      onClick={() => setDetailOrderId(o.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)]"
                    >
                      <Eye className="h-3 w-3 text-[var(--dsn-accent)]" />
                      {w.ordersActionView}
                    </button>
                    {o.canEditDetails && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(o)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)]"
                      >
                        <Edit3 className="h-3 w-3 text-[var(--dsn-accent)]" />
                        {w.ordersActionEdit}
                      </button>
                    )}
                    {o.allowedNextStatuses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransitionModal({ open: true, order: o })}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)]"
                      >
                        <RefreshCw className="h-3 w-3 text-[var(--dsn-accent)]" />
                        {w.ordersActionTransition}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setGuideOrder(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)]"
                    >
                      <Printer className="h-3 w-3 text-[var(--dsn-accent)]" />
                      {w.ordersActionGuide}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRepeatOrder(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--dsn-text)]"
                    >
                      <Repeat className="h-3 w-3 text-[var(--dsn-accent)]" />
                      {w.ordersActionRepeat}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Vista Escritorio tabular */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">{w.ordersColNumber}</th>
                    <th className="px-4 py-3 font-medium">{w.ordersColCustomer}</th>
                    <th className="px-4 py-3 font-medium">{w.ordersColLocation}</th>
                    <th className="px-4 py-3 font-medium">{w.ordersColTotal}</th>
                    <th className="px-4 py-3 font-medium">{w.ordersColStatus}</th>
                    <th className="px-4 py-3 font-medium">{w.ordersColPayment}</th>
                    <th className="px-4 py-3 font-medium text-right">{w.ordersColActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                  {data.items.map((o) => (
                    <tr key={o.id} className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-[var(--dsn-accent)]">
                          {o.orderNumber}
                        </div>
                        <div className="text-[10px] text-[var(--dsn-text-secondary)]">
                          {new Date(o.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "es-CO")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{o.customerName}</div>
                        <div className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                          {o.customerPhone}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{o.city || "—"}</div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {o.carrierName
                            ? `${o.carrierName}${o.trackingCode ? ` · ${o.trackingCode}` : ""}`
                            : o.shippingMethod === "office"
                              ? w.ordersFormShippingOffice
                              : w.ordersFormShippingHome}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {formatOrderMoneyCents(o.totalCents, o.currency, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getOrderStatusBadgeClasses(o.status)}`}
                        >
                          {getOrderStatusLabel(o.status, locale)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[11px]">
                          {getPaymentStatusLabel(o.paymentStatus, locale)}
                        </div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          {o.paymentMethod}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title={w.ordersActionView}
                            aria-label={`${w.ordersActionView} ${o.orderNumber}`}
                            onClick={() => setDetailOrderId(o.id)}
                            className="rounded-lg border border-[var(--dsn-border)] p-1.5 hover:bg-[var(--dsn-surface-secondary)]"
                          >
                            <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                          </button>
                          {o.canEditDetails && (
                            <button
                              type="button"
                              title={w.ordersActionEdit}
                              aria-label={`${w.ordersActionEdit} ${o.orderNumber}`}
                              onClick={() => handleOpenEdit(o)}
                              className="rounded-lg border border-[var(--dsn-border)] p-1.5 hover:bg-[var(--dsn-surface-secondary)]"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                            </button>
                          )}
                          {o.allowedNextStatuses.length > 0 && (
                            <button
                              type="button"
                              title={w.ordersActionTransition}
                              aria-label={`${w.ordersActionTransition} ${o.orderNumber}`}
                              onClick={() => setTransitionModal({ open: true, order: o })}
                              className="rounded-lg border border-[var(--dsn-border)] p-1.5 hover:bg-[var(--dsn-surface-secondary)]"
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                            </button>
                          )}
                          <button
                            type="button"
                            title={w.ordersActionGuide}
                            aria-label={`${w.ordersActionGuide} ${o.orderNumber}`}
                            onClick={() => setGuideOrder(o)}
                            className="rounded-lg border border-[var(--dsn-border)] p-1.5 hover:bg-[var(--dsn-surface-secondary)]"
                          >
                            <Printer className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                          </button>
                          <button
                            type="button"
                            title={w.ordersActionRepeat}
                            aria-label={`${w.ordersActionRepeat} ${o.orderNumber}`}
                            onClick={() => handleRepeatOrder(o)}
                            className="rounded-lg border border-[var(--dsn-border)] p-1.5 hover:bg-[var(--dsn-surface-secondary)]"
                          >
                            <Repeat className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between border-t border-[var(--dsn-border)] px-4 py-3 text-xs text-[var(--dsn-text-secondary)]">
              <span>
                {w.crmPaginationPage} {data.pagination.page} {w.crmPaginationOf}{" "}
                {data.pagination.totalPages} ({data.pagination.total})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={data.pagination.page <= 1 || loading}
                  onClick={() => {
                    const prev = Math.max(1, data.pagination.page - 1);
                    setPage(prev);
                    fetchOrders({ page: prev });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {w.crmPaginationPrev}
                </button>
                <button
                  type="button"
                  disabled={data.pagination.page >= data.pagination.totalPages || loading}
                  onClick={() => {
                    const next = Math.min(data.pagination.totalPages, data.pagination.page + 1);
                    setPage(next);
                    fetchOrders({ page: next });
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 text-xs font-medium text-[var(--dsn-text)] disabled:opacity-40"
                >
                  {w.crmPaginationNext}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

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

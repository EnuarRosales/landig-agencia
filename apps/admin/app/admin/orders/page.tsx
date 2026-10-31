import React from "react";
import { DataTable } from "@/components/data-table";
import { getAdminDictionary } from "@/lib/i18n";
import { NewOrderDialog } from "./new-order-dialog";

interface OrderRow {
  number: string;
  customerName: string;
  customerPhone: string;
  source: string;
  status: string;
  paymentStatus: string;
  shippingMethod: string;
  totalFormatted: string;
  createdAt: string;
}

/**
 * Maestro de pedidos comerciales y fulfillment (`ORD-001`, `RF-01`, `DSN-001`).
 *
 * Características:
 * - Server Component con Tablero Mobile First de 5 KPIs comerciales.
 * - Tabla estándar accesible con paginación, filtros y ordenamiento.
 * - Alta manual de pedidos mediante diálogo cliente aislado.
 */
export default function AdminOrdersPage() {
  const dict = getAdminDictionary("es").orders;

  const orderKpis = [
    { label: dict.kpiRegistered, value: "12", color: "text-[var(--dsn-accent)]" },
    { label: dict.kpiConfirmed, value: "8", color: "text-[var(--dsn-text)]" },
    { label: dict.kpiShipped, value: "15", color: "text-amber-500" },
    { label: dict.kpiDelivered, value: "45", color: "text-emerald-500" },
    { label: dict.kpiReturns, value: "1", color: "text-rose-500" },
  ];

  const demoOrders: OrderRow[] = [
    {
      number: "ORD-202610-0001",
      customerName: "Carlos Eduardo Pérez",
      customerPhone: "+573001234567",
      source: "bot",
      status: "registered",
      paymentStatus: "pending",
      shippingMethod: "home",
      totalFormatted: "$105.000 COP",
      createdAt: "2026-10-31 14:30",
    },
    {
      number: "ORD-202610-0002",
      customerName: "Laura Restrepo",
      customerPhone: "+573155554433",
      source: "manual",
      status: "confirmed",
      paymentStatus: "paid",
      shippingMethod: "office",
      totalFormatted: "$210.000 COP",
      createdAt: "2026-10-31 11:15",
    },
    {
      number: "ORD-202610-0003",
      customerName: "Distribuciones Comerciales SAS",
      customerPhone: "+573109876543",
      source: "bot",
      status: "shipped",
      paymentStatus: "paid",
      shippingMethod: "home",
      totalFormatted: "$540.000 COP",
      createdAt: "2026-10-30 16:45",
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--dsn-text)]">{dict.title}</h1>
          <p className="text-xs text-[var(--dsn-muted)]">{dict.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-sm font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            {dict.exportCsv}
          </button>
          <NewOrderDialog />
        </div>
      </header>

      {/* Indicadores de pedidos en caliente (ORD-001 §4) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {orderKpis.map((kpi, index) => (
          <div
            key={index}
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3 text-center shadow-sm"
          >
            <div className="text-xs font-medium text-[var(--dsn-muted)]">{kpi.label}</div>
            <div className={`mt-1 font-mono text-xl font-bold tracking-tight ${kpi.color}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </section>

      {/* Tabla estándar de pedidos */}
      <DataTable
        columns={[
          { key: "number", header: dict.colNumber, sortable: true, filterable: true },
          { key: "customerName", header: dict.colCustomer, sortable: true, filterable: true },
          { key: "totalFormatted", header: dict.colTotal, isNumeric: true, sortable: true },
          { key: "status", header: dict.colStatus, sortable: true, filterable: true },
          { key: "paymentStatus", header: dict.colPayment, sortable: true, filterable: true },
          { key: "shippingMethod", header: dict.colShipping, sortable: true, filterable: true },
          { key: "createdAt", header: dict.colCreatedAt, sortable: true },
        ]}
        data={demoOrders}
        pageSize={10}
        ariaLabel={dict.title}
      />
    </main>
  );
}

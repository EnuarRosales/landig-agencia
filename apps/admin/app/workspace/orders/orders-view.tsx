"use client";

import React, { useState } from "react";
import { ShoppingCart, CheckCircle, Clock, Truck, AlertCircle } from "lucide-react";
import type { WorkspaceOrderDto } from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";

interface OrdersViewProps {
  initialOrders: WorkspaceOrderDto[];
}

export function OrdersView({ initialOrders }: OrdersViewProps) {
  const [orders, setOrders] = useState<WorkspaceOrderDto[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await workspaceFetch(`/api/tenant/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">Entregado</span>;
      case "shipped":
        return <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400 border border-cyan-500/20">Enviado</span>;
      case "preparing":
        return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">En Preparación</span>;
      case "confirmed":
        return <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-400 border border-purple-500/20">Confirmado</span>;
      case "cancelled":
        return <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400 border border-rose-500/20">Cancelado</span>;
      default:
        return <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-500/20">Registrado</span>;
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Pedidos Y Ventas
            </h1>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-mono font-medium text-amber-400 border border-amber-500/20">
              Ventas Celulares
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Supervisión transaccional de órdenes de compra, pagos y estado de despacho.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
            Registro De Pedidos
          </h2>
          <span className="text-xs text-[var(--dsn-text-secondary)] font-mono">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </span>
        </div>

        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No Hay Pedidos Registrados
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1 max-w-sm mx-auto">
              Cuando los clientes confirmen órdenes a través de tu bot o catálogo, aparecerán reflejadas aquí en tiempo real.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Consecutivo</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 font-medium text-right">Actualizar Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[var(--dsn-surface-secondary)]/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--dsn-accent)]">
                      {o.orderNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold">{o.customerName}</td>
                    <td className="px-4 py-3 font-mono text-[var(--dsn-text-secondary)]">
                      {o.customerPhone}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      ${(o.totalCents / 100).toLocaleString("es-CO")} {o.currency}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(o.status)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] uppercase">
                      {o.paymentStatus}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        disabled={updatingId === o.id}
                        value={o.status}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2 py-1 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden disabled:opacity-50"
                      >
                        <option value="registered">Registrado</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="preparing">En Preparación</option>
                        <option value="shipped">Enviado</option>
                        <option value="delivered">Entregado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


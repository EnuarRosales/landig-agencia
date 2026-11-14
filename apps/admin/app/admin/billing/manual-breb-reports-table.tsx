"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
  ExternalLink,
} from "lucide-react";
import type { ManualPaymentReportDetail } from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";

interface ManualBreBReportsTableProps {
  initialReports: ManualPaymentReportDetail[];
}

const PAGE_SIZE = 10;

export function ManualBreBReportsTable({ initialReports }: ManualBreBReportsTableProps) {
  const router = useRouter();
  const [reports, setReports] = useState<ManualPaymentReportDetail[]>(initialReports);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_review" | "approved" | "rejected">("pending_review");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);

  const [voucherModalReport, setVoucherModalReport] = useState<ManualPaymentReportDetail | null>(null);
  const [approveTarget, setApproveTarget] = useState<ManualPaymentReportDetail | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ManualPaymentReportDetail | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.clientName.toLowerCase().includes(q) ||
        r.clientSlug.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.paymentReference || "").toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortDir === "desc" ? timeB - timeA : timeA - timeB;
    });
    return list;
  }, [reports, searchQuery, statusFilter, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function formatCop(cents: number): string {
    return (cents / 100).toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });
  }

  async function executeReview(
    report: ManualPaymentReportDetail,
    action: "approve" | "reject",
    reason?: string,
  ) {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`/api/admin/billing/manual-reports/${report.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "reject" ? { rejectionReason: reason } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        detail?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.detail || json.error || "No se pudo completar la revisión del reporte.");
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: action === "approve" ? "approved" : "rejected",
                rejectionReason: action === "reject" ? reason ?? null : null,
                reviewedAt: new Date(),
              }
            : item,
        ),
      );
      setActionSuccess(
        action === "approve"
          ? `Pago Bre-B de ${report.clientName} aprobado y suscripción activada.`
          : `Reporte de ${report.clientName} rechazado sin interrumpir su plan base.`,
      );
      setApproveTarget(null);
      setRejectTarget(null);
      setRejectionReason("");
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error inesperado en la revisión.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-200 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Barra de búsqueda, filtro de estado y ordenamiento */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar por comercio, factura o referencia Bre-B..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--dsn-text-secondary)] shrink-0" />
          <select
            aria-label="Filtrar Por Estado De Revisión"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
            className="min-h-[42px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
          >
            <option value="pending_review">Pendientes Por Verificar</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
            <option value="all">Todos Los Reportes</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))}
            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 text-xs text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{sortDir === "desc" ? "Más Recientes" : "Más Antiguos"}</span>
          </button>
        </div>
      </div>

      {/* Tabla principal */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
        {paginated.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 text-[var(--dsn-text-secondary)]/50 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              No hay comprobantes Bre-B en este filtro
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
              Cuando un inquilino en Colombia reporte un pago por Bre-B aparecerá aquí para verificación manual.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Comercio E Inquilino</th>
                  <th className="py-3 px-4 font-semibold">Plan Y Operación</th>
                  <th className="py-3 px-4 font-semibold">Monto Reportado</th>
                  <th className="py-3 px-4 font-semibold">Factura Y Referencia</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Fecha De Reporte</th>
                  <th className="py-3 px-4 font-semibold text-right">Verificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {paginated.map((rep) => {
                  const isPending = rep.status === "pending_review";
                  const planTitle = rep.planName?.es || rep.planName?.en || rep.planCode;

                  return (
                    <tr
                      key={rep.id}
                      className="hover:bg-[var(--dsn-surface-secondary)]/40 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--dsn-text)]">{rep.clientName}</div>
                        <div className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                          {rep.clientSlug} · {rep.clientEmail}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[var(--dsn-text)]">{planTitle}</div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] mt-0.5">
                          {rep.targetCycle === "annual" ? "Anual" : "Mensual"} ·{" "}
                          {rep.operationKind === "upgrade"
                            ? "Upgrade"
                            : rep.operationKind === "renewal"
                              ? "Renovación"
                              : "Nueva Suscripción"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-[var(--dsn-text)]">
                          {formatCop(Number(rep.reportedAmountCents))}
                        </div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          Esperado: {formatCop(Number(rep.expectedAmountCents))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-[var(--dsn-text)]">{rep.invoiceNumber}</div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)]">
                          Ref: {rep.paymentReference || "Sin referencia"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            rep.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : rep.status === "rejected"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                          }`}
                        >
                          {rep.status === "approved"
                            ? "Aprobado"
                            : rep.status === "rejected"
                              ? "Rechazado"
                              : "Pendiente De Revisión"}
                        </span>
                        {rep.status === "rejected" && rep.rejectionReason && (
                          <p className="mt-1 max-w-[220px] truncate text-[11px] text-red-300" title={rep.rejectionReason}>
                            {rep.rejectionReason}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[var(--dsn-text-secondary)]">
                        {new Date(rep.createdAt).toLocaleString("es-CO")}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVoucherModalReport(rep)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ver Comprobante</span>
                          </button>

                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionError(null);
                                  setApproveTarget(rep);
                                }}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-600/90 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Aprobar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActionError(null);
                                  setRejectionReason("");
                                  setRejectTarget(rep);
                                }}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/20"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Rechazar</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[var(--dsn-border)] px-4 py-3 text-xs text-[var(--dsn-text-secondary)]">
            <span>
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} reportes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>
              <span className="font-mono">{currentPage} / {totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-2.5 py-1 disabled:opacity-40"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Visor Seguro De Comprobante */}
      {voucherModalReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="voucher-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <div>
                <h3 id="voucher-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
                  Comprobante De Pago Bre-B · {voucherModalReport.clientName}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  Factura {voucherModalReport.invoiceNumber} · Monto {formatCop(Number(voucherModalReport.reportedAmountCents))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoucherModalReport(null)}
                className="rounded-lg p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] hover:text-[var(--dsn-text)]"
                aria-label="Cerrar Visor De Comprobante"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-[var(--dsn-border)] bg-black/40 p-3 max-h-[60vh] overflow-auto flex items-center justify-center">
              {voucherModalReport.voucherMimeType === "application/pdf" ? (
                <iframe
                  title={`Comprobante ${voucherModalReport.invoiceNumber}`}
                  src={`/api/admin/billing/manual-reports/${voucherModalReport.id}/voucher`}
                  className="w-full h-[52vh] rounded-lg bg-white"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/admin/billing/manual-reports/${voucherModalReport.id}/voucher`}
                  alt={`Comprobante ${voucherModalReport.invoiceNumber}`}
                  className="max-h-[54vh] w-auto rounded-lg object-contain"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <a
                href={`/api/admin/billing/manual-reports/${voucherModalReport.id}/voucher`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-accent)] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Abrir Archivo En Pestaña Segura</span>
              </a>
              <button
                type="button"
                onClick={() => setVoucherModalReport(null)}
                className="min-h-[40px] rounded-xl border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Aprobación (DSN-001 / Regla 4.17) */}
      <ConfirmationModal
        isOpen={Boolean(approveTarget)}
        onClose={() => !actionLoading && setApproveTarget(null)}
        onConfirm={() => {
          if (approveTarget) return executeReview(approveTarget, "approve");
        }}
        title="Confirmar Aprobación De Pago Bre-B"
        subtitle="Esta acción concilia la factura, genera el recibo y activa inmediatamente el plan contratado."
        variant="neutral"
        details={
          approveTarget
            ? [
                { label: "Comercio", value: approveTarget.clientName },
                { label: "Factura", value: approveTarget.invoiceNumber },
                { label: "Monto Verificado", value: formatCop(Number(approveTarget.reportedAmountCents)) },
                { label: "Referencia", value: approveTarget.paymentReference || "Sin referencia" },
              ]
            : []
        }
        warningTitle="Impacto En El Servicio Del Inquilino"
        warningMessage="Asegúrate de haber validado en tu extracto bancario Bre-B que el valor exacto en COP ingresó antes de aprobar."
        confirmText="Aprobar Y Activar Plan"
        confirmLoadingText="Conciliando Pago..."
        cancelText="Cancelar"
        loading={actionLoading}
        error={actionError}
      />

      {/* Modal Confirmación Rechazo Con Motivo Obligatorio (DSN-001 / Regla 4.17) */}
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-breb-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="reject-breb-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
                  Rechazar Comprobante De Pago Bre-B
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  El inquilino conservará su plan o periodo de prueba vigente sin perder servicio y recibirá este motivo por correo.
                </p>
              </div>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setRejectTarget(null)}
                className="rounded-lg p-1.5 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs space-y-1">
              <div>
                <span className="text-[var(--dsn-text-secondary)]">Comercio: </span>
                <strong className="text-[var(--dsn-text)]">{rejectTarget.clientName}</strong>
              </div>
              <div>
                <span className="text-[var(--dsn-text-secondary)]">Factura / Monto: </span>
                <strong className="font-mono text-[var(--dsn-text)]">
                  {rejectTarget.invoiceNumber} · {formatCop(Number(rejectTarget.reportedAmountCents))}
                </strong>
              </div>
            </div>

            <div>
              <label
                htmlFor="breb-rejection-reason"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                Motivo Del Rechazo (Mínimo 10 Caracteres)
              </label>
              <textarea
                id="breb-rejection-reason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ej. El comprobante está recortado y no muestra el número de aprobación ni el monto exacto."
                className="w-full rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--dsn-text-secondary)]">
                <span>El mensaje será enviado al propietario del espacio.</span>
                <span className="font-mono">{rejectionReason.trim().length} / 10 min</span>
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--dsn-border)]">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setRejectTarget(null)}
                className="min-h-[42px] rounded-xl border border-[var(--dsn-border)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading || rejectionReason.trim().length < 10}
                onClick={() => executeReview(rejectTarget, "reject", rejectionReason.trim())}
                className="min-h-[42px] rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? "Procesando Rechazo..." : "Confirmar Rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

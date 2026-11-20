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
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  ConfirmationModal,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";

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
        <Alert variant="success" className="flex items-center justify-between">
          <AlertDescription className="text-xs">{actionSuccess}</AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActionSuccess(null)}
            className="h-auto p-1 text-emerald-200 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      )}

      {/* Barra de búsqueda, filtro de estado y ordenamiento */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <Input
            type="text"
            placeholder="Buscar por comercio, factura o referencia Bre-B..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="min-h-[42px] rounded-xl bg-[var(--dsn-surface)] pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--dsn-text-secondary)] shrink-0" />
          <Select
            aria-label="Filtrar por Estado de Revisión"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(1);
            }}
            className="min-h-[42px] rounded-xl bg-[var(--dsn-surface)] text-xs w-auto"
          >
            <option value="pending_review">Pendientes Por Verificar</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
            <option value="all">Todos Los Reportes</option>
          </Select>

          <Button
            type="button"
            variant="secondary"
            onClick={() => setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))}
            className="min-h-[42px] rounded-xl text-xs"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{sortDir === "desc" ? "Más Recientes" : "Más Antiguos"}</span>
          </Button>
        </div>
      </div>

      {/* Tabla principal */}
      <Card className="overflow-hidden">
        {paginated.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-10 w-10 text-[var(--dsn-text-secondary)]/50" />}
            title="No hay comprobantes Bre-B en este filtro"
            description="Cuando un inquilino en Colombia reporte un pago por Bre-B aparecerá aquí para verificación manual."
            className="border-0 rounded-none py-12"
          />
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
                        <Badge
                          variant={
                            rep.status === "approved"
                              ? "success"
                              : rep.status === "rejected"
                                ? "destructive"
                                : "warning"
                          }
                          className="font-mono text-[10px]"
                        >
                          {rep.status === "approved"
                            ? "Aprobado"
                            : rep.status === "rejected"
                              ? "Rechazado"
                              : "Pendiente de Revisión"}
                        </Badge>
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
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setVoucherModalReport(rep)}
                            className="min-h-[36px] text-[11px]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ver Comprobante</span>
                          </Button>

                          {isPending && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setActionError(null);
                                  setApproveTarget(rep);
                                }}
                                className="min-h-[36px] bg-emerald-600/90 border-emerald-500 text-[11px] text-white hover:bg-emerald-500"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Aprobar</span>
                              </Button>

                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setActionError(null);
                                  setRejectionReason("");
                                  setRejectTarget(rep);
                                }}
                                className="min-h-[36px] text-[11px]"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Rechazar</span>
                              </Button>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[36px]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </Button>
              <span className="font-mono">{currentPage} / {totalPages}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[36px]"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Visor Seguro De Comprobante */}
      <Dialog
        open={Boolean(voucherModalReport)}
        onOpenChange={(open) => {
          if (!open) setVoucherModalReport(null);
        }}
      >
        <DialogContent
          className="max-w-2xl p-5 space-y-4"
          closeAriaLabel="Cerrar Visor de Comprobante"
        >
          {voucherModalReport && (
            <>
              <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
                <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                  Comprobante De Pago Bre-B · {voucherModalReport.clientName}
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
                  Factura {voucherModalReport.invoiceNumber} · Monto {formatCop(Number(voucherModalReport.reportedAmountCents))}
                </DialogDescription>
              </DialogHeader>

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

              <DialogFooter className="flex flex-wrap items-center justify-between gap-3 pt-2 sm:justify-between">
                <a
                  href={`/api/admin/billing/manual-reports/${voucherModalReport.id}/voucher`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-accent)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir Archivo En Pestaña Segura</span>
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVoucherModalReport(null)}
                  className="min-h-[40px] rounded-xl text-xs"
                >
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Confirmación Aprobación (DSN-001 / Regla 4.17) */}
      <ConfirmationModal
        isOpen={Boolean(approveTarget)}
        onClose={() => !actionLoading && setApproveTarget(null)}
        onConfirm={() => {
          if (approveTarget) return executeReview(approveTarget, "approve");
        }}
        title="Confirmar Aprobación de Pago Bre-B"
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
        warningTitle="Impacto en el Servicio del Inquilino"
        warningMessage="Asegúrate de haber validado en tu extracto bancario Bre-B que el valor exacto en COP ingresó antes de aprobar."
        confirmText="Aprobar y Activar Plan"
        confirmLoadingText="Conciliando Pago..."
        cancelText="Cancelar"
        loading={actionLoading}
        error={actionError}
      />

      {/* Modal Confirmación Rechazo Con Motivo Obligatorio (DSN-001 / Regla 4.17) */}
      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoading) setRejectTarget(null);
        }}
      >
        <DialogContent
          className="max-w-lg p-6 space-y-4"
          disableEscapeKeyDown={actionLoading}
          disableInteractOutside={actionLoading}
        >
          {rejectTarget && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                  Rechazar Comprobante De Pago Bre-B
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
                  El inquilino conservará su plan o periodo de prueba vigente sin perder servicio y recibirá este motivo por correo.
                </DialogDescription>
              </DialogHeader>

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
                <Label
                  htmlFor="breb-rejection-reason"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
                >
                  Motivo Del Rechazo (Mínimo 10 Caracteres)
                </Label>
                <Textarea
                  id="breb-rejection-reason"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ej. El comprobante está recortado y no muestra el número de aprobación ni el monto exacto."
                  className="rounded-xl text-xs"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--dsn-text-secondary)]">
                  <span>El mensaje será enviado al propietario del espacio.</span>
                  <span className="font-mono">{rejectionReason.trim().length} / 10 min</span>
                </div>
              </div>

              {actionError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{actionError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter className="pt-2 border-t border-[var(--dsn-border)]">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={actionLoading}
                  onClick={() => setRejectTarget(null)}
                  className="min-h-[42px] rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={actionLoading || rejectionReason.trim().length < 10}
                  loading={actionLoading}
                  loadingText="Procesando Rechazo..."
                  onClick={() => executeReview(rejectTarget, "reject", rejectionReason.trim())}
                  className="min-h-[42px] rounded-xl text-xs"
                >
                  <span>Confirmar Rechazo</span>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Filter,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Building2,
} from "lucide-react";
import type { SubscriptionDetail, BillingOverviewMetrics } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
} from "@mocter/ui";

interface SubscriptionsTableProps {
  initialSubscriptions: SubscriptionDetail[];
  metrics: BillingOverviewMetrics;
}

export function SubscriptionsTable({ initialSubscriptions, metrics }: SubscriptionsTableProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeModal, setActiveModal] = useState<{
    type: "extend_trial" | "matias_profile";
    sub: SubscriptionDetail;
  } | null>(null);
  const [trialDaysInput, setTrialDaysInput] = useState(14);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const filteredSubs = initialSubscriptions.filter((sub) => {
    const matchesSearch =
      sub.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.clientSlug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.planCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formattedMrr = (metrics.mrrCents / 100).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  async function handleAction(subscriptionId: string, action: "extend_trial" | "suspend" | "activate", days?: number) {
    setLoadingActionId(subscriptionId);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/billing/subscriptions/${subscriptionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days, actor: "platform_owner" }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Fallo al ejecutar la acción sobre la suscripción");
      }

      setFeedback({
        type: "success",
        message:
          action === "extend_trial"
            ? `Período de prueba extendido ${days || 14} días con éxito.`
            : action === "suspend"
            ? "Suscripción suspendida administrativamente."
            : "Suscripción reactivada con éxito.",
      });

      setActiveModal(null);
      router.refresh();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error inesperado",
      });
    } finally {
      setLoadingActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tarjetas de Métricas SaaS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <span className="text-xs text-[var(--dsn-text-secondary)]">MRR Estimado (Mensual)</span>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">{formattedMrr}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Ingresos recurrentes activos</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-[var(--dsn-text-secondary)]">Suscripciones Activas</span>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">{metrics.activeCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Inquilinos en producción</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-[var(--dsn-text-secondary)]">En Período De Prueba</span>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-accent)] font-mono">{metrics.trialingCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">En ventana de 14 días</p>
        </Card>

        <Card className="p-4">
          <span className="text-xs text-[var(--dsn-text-secondary)]">Cobro Pendiente (Dunning)</span>
          <p className="mt-2 text-2xl font-bold text-amber-400 font-mono">{metrics.pastDueCount}</p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">Reintentos automáticos</p>
        </Card>
      </section>

      {feedback && (
        <Alert variant={feedback.type === "success" ? "success" : "destructive"}>
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className="text-xs">{feedback.message}</AlertDescription>
        </Alert>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <Input
            type="text"
            placeholder="Buscar por inquilino, slug o plan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="min-h-[42px] rounded-xl bg-[var(--dsn-surface)] pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-4 w-4 text-[var(--dsn-text-secondary)] shrink-0" />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[42px] rounded-xl bg-[var(--dsn-surface)] text-xs w-auto"
          >
            <option value="all">Todos Los Estados</option>
            <option value="active">Activa</option>
            <option value="trialing">En Prueba (Trial)</option>
            <option value="past_due">Pago Pendiente</option>
            <option value="suspended">Suspendida</option>
            <option value="cancelled">Cancelada</option>
          </Select>
        </div>
      </div>

      {/* Tabla de Suscripciones */}
      <Card className="overflow-hidden">
        {filteredSubs.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10 text-[var(--dsn-text-secondary)]/50" />}
            title="No se encontraron suscripciones"
            description="Ajusta los filtros de búsqueda o registra nuevos inquilinos en el onboarding."
            className="border-0 rounded-none py-12"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Inquilino</th>
                  <th className="py-3 px-4 font-semibold">Plan Y Ciclo</th>
                  <th className="py-3 px-4 font-semibold">Tarifa Recurrente</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Vencimiento / Trial</th>
                  <th className="py-3 px-4 font-semibold">Datos Fiscales</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dsn-border)]">
                {filteredSubs.map((sub) => {
                  const price =
                    sub.cycle === "annual"
                      ? sub.planPriceAnnualCents / 100
                      : sub.planPriceMonthlyCents / 100;
                  const formattedPrice = price.toLocaleString("es-CO", {
                    style: "currency",
                    currency: sub.currency || "COP",
                    maximumFractionDigits: 0,
                  });
                  const isLoading = loadingActionId === sub.id;

                  return (
                    <tr key={sub.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--dsn-text)]">{sub.clientName}</div>
                        <span className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">{sub.clientSlug}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[var(--dsn-text)]">
                          {sub.planName?.es || sub.planCode}
                        </div>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[var(--dsn-surface-secondary)] text-[var(--dsn-accent)] mt-0.5">
                          {sub.cycle === "annual" ? "Ciclo Anual" : "Ciclo Mensual"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-[var(--dsn-text)]">
                        {formattedPrice}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            sub.status === "active"
                              ? "success"
                              : sub.status === "trialing"
                                ? "accent"
                                : sub.status === "past_due"
                                  ? "warning"
                                  : "destructive"
                          }
                          className="font-mono text-[10px]"
                        >
                          {sub.status === "trialing"
                            ? "En Prueba"
                            : sub.status === "active"
                            ? "Activa"
                            : sub.status === "past_due"
                            ? "Pago Pendiente"
                            : sub.status === "suspended"
                            ? "Suspendida"
                            : sub.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        {sub.status === "trialing" && sub.trialEndsAt ? (
                          <div className="flex items-center gap-1 text-cyan-400">
                            <Clock className="h-3 w-3" />
                            <span suppressHydrationWarning>
                              Fin trial: {new Date(sub.trialEndsAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span suppressHydrationWarning>
                              {new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {sub.billingProfile ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveModal({ type: "matias_profile", sub })}
                            className="h-auto px-1.5 py-0.5 text-[11px] font-semibold text-[var(--dsn-accent)] hover:underline"
                          >
                            <Building2 className="h-3 w-3" />
                            <span>{sub.billingProfile.companyName}</span>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-[var(--dsn-text-secondary)] italic">
                            Sin datos fiscales
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => setActiveModal({ type: "extend_trial", sub })}
                            className="h-auto min-h-0 px-2.5 py-1 text-[11px]"
                          >
                            <Clock className="h-3 w-3 text-cyan-400" />
                            <span>Extender Trial</span>
                          </Button>

                          {sub.status === "suspended" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleAction(sub.id, "activate")}
                              className="h-auto min-h-0 px-2 py-1 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            >
                              <PlayCircle className="h-3 w-3" />
                              <span>Reactivar</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => handleAction(sub.id, "suspend")}
                              className="h-auto min-h-0 px-2 py-1 text-[11px]"
                            >
                              <PauseCircle className="h-3 w-3" />
                              <span>Suspender</span>
                            </Button>
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
      </Card>

      {/* Modal: Extender Trial */}
      <Dialog
        open={Boolean(activeModal && activeModal.type === "extend_trial")}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null);
        }}
      >
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
              Extender Período De Prueba Gratuito
            </DialogTitle>
          </DialogHeader>
          {activeModal?.type === "extend_trial" && (
            <>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                Inquilino: <strong className="text-[var(--dsn-text)]">{activeModal.sub.clientName}</strong>
              </p>

              <div className="my-5">
                <Label
                  htmlFor="extend-trial-days"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  Días De Extensión Adicionales
                </Label>
                <Input
                  id="extend-trial-days"
                  type="number"
                  min="1"
                  max="90"
                  value={trialDaysInput}
                  onChange={(e) => setTrialDaysInput(Number(e.target.value))}
                  className="min-h-[42px] text-xs"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setActiveModal(null)}
                  className="text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleAction(activeModal.sub.id, "extend_trial", trialDaysInput)}
                  className="text-xs font-bold"
                >
                  <span>Aplicar Extensión</span>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Datos Fiscales Matías API */}
      <Dialog
        open={Boolean(activeModal && activeModal.type === "matias_profile" && activeModal.sub.billingProfile)}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null);
        }}
      >
        <DialogContent className="max-w-md p-6">
          {activeModal?.type === "matias_profile" && activeModal.sub.billingProfile && (
            <>
              <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 mb-4">
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                    Datos Fiscales (Estándar Matías API)
                  </DialogTitle>
                  <span className="text-[11px] font-mono text-[var(--dsn-accent)]">BILL-001 RF-04</span>
                </div>
              </DialogHeader>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[var(--dsn-text-secondary)] block">Razón Social o Nombre Legal:</span>
                  <span className="font-semibold text-[var(--dsn-text)] text-sm">
                    {activeModal.sub.billingProfile.companyName}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--dsn-text-secondary)] block">Número De Identificación Tributaria (DNI / NIT):</span>
                  <span className="font-mono font-semibold text-[var(--dsn-text)]">
                    {activeModal.sub.billingProfile.dni}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--dsn-text-secondary)] block">Correo De Notificaciones Fiscales:</span>
                  <span className="font-mono text-[var(--dsn-text)]">
                    {activeModal.sub.billingProfile.email}
                  </span>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveModal(null)}
                  className="text-xs"
                >
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


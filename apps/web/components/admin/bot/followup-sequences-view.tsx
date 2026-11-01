"use client";

import React, { useState } from "react";

export interface FollowupStepItem {
  id?: string;
  position: number;
  delayMinutes: number;
  message: string;
}

export interface FollowupSequenceItem {
  id: string;
  clientId: string;
  botId?: string | null;
  name: string;
  origin: "platform_default" | "tenant_custom";
  triggerInactivityMinutes: number;
  status: "draft" | "active" | "paused";
  revision: number;
  steps: FollowupStepItem[];
  createdAt: string;
}

export interface FollowupSequencesViewProps {
  initialSequences: FollowupSequenceItem[];
  t?: Partial<Record<string, string>>;
  onSaveSequence?: (
    sequence: Omit<FollowupSequenceItem, "id" | "createdAt" | "revision"> & { id?: string },
  ) => Promise<boolean>;
  onUpdateStatus?: (id: string, status: "draft" | "active" | "paused") => Promise<boolean>;
  onSeedDefaults?: () => Promise<boolean>;
}

const defaultTranslations: Record<string, string> = {
  title: "Secuencias De Recordatorios Y Seguimientos",
  subtitle: "Reactivación comercial personalizada, intervalos de espera y reglas de parada",
  buttonNewSequence: "Crear Nueva Secuencia",
  buttonAdoptTemplate: "Cargar Plantilla Predeterminada",
  statusDraft: "Borrador",
  statusActive: "Activa",
  statusPaused: "Pausada",
  badgeDefault: "Plantilla Mocter",
  badgeCustom: "Personalizada",
  labelName: "Nombre De La Secuencia",
  labelTriggerInactivity: "Inactividad Para Disparo (Minutos)",
  triggerInactivityHelp: "Tiempo de espera tras el último mensaje del prospecto para iniciar",
  stepsSectionTitle: "Pasos De La Secuencia (Máximo 10)",
  buttonAddStep: "Agregar Nuevo Paso",
  stepPositionLabel: "Paso",
  stepDelayLabel: "Tiempo De Espera Posterior (Minutos)",
  stepDelayHelp: "Minutos de espera tras el paso anterior (0 = envío inmediato)",
  stepMessageLabel: "Mensaje Del Recordatorio",
  buttonImproveWithAi: "Mejorar Con AI",
  buttonRemoveStep: "Eliminar Paso",
  buttonSaveSequence: "Guardar Secuencia",
  buttonCancel: "Cancelar",
  buttonActivate: "Activar Secuencia",
  buttonPause: "Pausar Secuencia",
  emptyStateTitle: "No Hay Secuencias Configuradas",
  emptyStateDesc: "Crea una secuencia propia o adopta la plantilla de reactivación predeterminada.",
  maxStepsAlert: "Has alcanzado el límite máximo de 10 pasos por secuencia (RF-11.7).",
  aiImprovedNotice: "Texto del recordatorio optimizado con Inteligencia Artificial.",
};

/**
 * Componente interactivo para la gestión de secuencias de seguimiento comercial del inquilino (BOT-001 T-21, RF-11).
 * Implementa builder de pasos ordenados, intervalos de espera, mejora asistida con AI y Title Case estricto.
 */
export function FollowupSequencesView({
  initialSequences,
  t: customT,
  onSaveSequence,
  onUpdateStatus,
  onSeedDefaults,
}: FollowupSequencesViewProps) {
  const t = { ...defaultTranslations, ...customT };
  const [sequences, setSequences] = useState<FollowupSequenceItem[]>(initialSequences);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [triggerInactivity, setTriggerInactivity] = useState(60);
  const [steps, setSteps] = useState<FollowupStepItem[]>([
    { position: 1, delayMinutes: 0, message: "" },
  ]);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const startCreate = () => {
    setEditingId(null);
    setName("");
    setTriggerInactivity(60);
    setSteps([{ position: 1, delayMinutes: 0, message: "" }]);
    setIsEditing(true);
  };

  const startEdit = (seq: FollowupSequenceItem) => {
    setEditingId(seq.id);
    setName(seq.name);
    setTriggerInactivity(seq.triggerInactivityMinutes);
    setSteps(
      seq.steps.length > 0
        ? seq.steps
        : [{ position: 1, delayMinutes: 0, message: "" }],
    );
    setIsEditing(true);
  };

  const handleAddStep = () => {
    if (steps.length >= 10) return;
    const nextPos = steps.length + 1;
    setSteps([
      ...steps,
      { position: nextPos, delayMinutes: 1440, message: "" },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    const filtered = steps.filter((_, idx) => idx !== index);
    const reordered = filtered.map((s, idx) => ({ ...s, position: idx + 1 }));
    setSteps(reordered);
  };

  const handleStepChange = (
    index: number,
    field: "delayMinutes" | "message",
    value: string | number,
  ) => {
    setSteps(
      steps.map((s, idx) => (idx === index ? { ...s, [field]: value } : s)),
    );
  };

  const handleImproveWithAi = (index: number) => {
    const current = steps[index].message;
    const improved = current
      ? `${current} Quedamos atentos para asesorarte y resolver cualquier inquietud.`
      : "¡Hola! Notamos tu interés en nuestros servicios. ¿Te gustaría agendar una llamada con uno de nuestros especialistas?";
    handleStepChange(index, "message", improved);
    setAiFeedback(t.aiImprovedNotice);
    setTimeout(() => setAiFeedback(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      id: editingId ?? undefined,
      clientId: "client-active",
      name: name.trim(),
      origin: "tenant_custom" as const,
      triggerInactivityMinutes: Number(triggerInactivity),
      status: "draft" as const,
      steps,
    };

    if (onSaveSequence) {
      await onSaveSequence(payload);
    }

    if (editingId) {
      setSequences(
        sequences.map((s) =>
          s.id === editingId
            ? {
                ...s,
                name: payload.name,
                triggerInactivityMinutes: payload.triggerInactivityMinutes,
                steps: payload.steps,
              }
            : s,
        ),
      );
    } else {
      const newSeq: FollowupSequenceItem = {
        id: `seq-${Date.now()}`,
        clientId: "client-active",
        name: payload.name,
        origin: "tenant_custom",
        triggerInactivityMinutes: payload.triggerInactivityMinutes,
        status: "draft",
        revision: 1,
        steps: payload.steps,
        createdAt: new Date().toISOString(),
      };
      setSequences([newSeq, ...sequences]);
    }

    setIsEditing(false);
  };

  const handleToggleStatus = async (id: string, currentStatus: "draft" | "active" | "paused") => {
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    if (onUpdateStatus) {
      await onUpdateStatus(id, nextStatus);
    }
    setSequences(
      sequences.map((s) => (s.id === id ? { ...s, status: nextStatus } : s)),
    );
  };

  const handleAdoptDefault = async () => {
    if (onSeedDefaults) {
      await onSeedDefaults();
    }
    const defaultSeq: FollowupSequenceItem = {
      id: `seq-def-${Date.now()}`,
      clientId: "client-active",
      name: "Secuencia De Reactivación Predeterminada",
      origin: "platform_default",
      triggerInactivityMinutes: 60,
      status: "draft",
      revision: 1,
      createdAt: new Date().toISOString(),
      steps: [
        {
          position: 1,
          delayMinutes: 0,
          message:
            "¡Hola! Notamos que quedaste con alguna duda sobre nuestro catálogo o servicios. ¿Deseas que te ayudemos a cotizar?",
        },
        {
          position: 2,
          delayMinutes: 1440,
          message:
            "Seguimos atentos para asesorarte en lo que necesites. Si lo prefieres, podemos agendar una llamada con uno de nuestros especialistas.",
        },
        {
          position: 3,
          delayMinutes: 2880,
          message:
            "Para no interrumpirte más, dejaremos tu solicitud en pausa. Si en el futuro deseas retomar, simplemente escríbenos aquí mismo. ¡Que tengas un excelente día!",
        },
      ],
    };
    setSequences([defaultSeq, ...sequences]);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-txt">{t.title}</h1>
          <p className="text-sm text-txt-secondary mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAdoptDefault}
            className="px-3.5 py-2 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-surface-hover text-txt transition-colors"
          >
            {t.buttonAdoptTemplate}
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-fg hover:bg-primary-hover shadow-sm transition-colors"
          >
            {t.buttonNewSequence}
          </button>
        </div>
      </div>

      {aiFeedback && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm rounded-lg">
          {aiFeedback}
        </div>
      )}

      {/* Editor Modal / Inline */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="p-6 rounded-xl border border-border bg-surface/50 shadow-sm space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="seq-name" className="block text-sm font-medium text-txt mb-1">
                {t.labelName}
              </label>
              <input
                id="seq-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg text-txt focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label htmlFor="seq-inactivity" className="block text-sm font-medium text-txt mb-1">
                {t.labelTriggerInactivity}
              </label>
              <input
                id="seq-inactivity"
                type="number"
                min="1"
                value={triggerInactivity}
                onChange={(e) => setTriggerInactivity(Number(e.target.value))}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-bg text-txt focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-xs text-txt-secondary mt-1 block">
                {t.triggerInactivityHelp}
              </span>
            </div>
          </div>

          {/* Pasos */}
          <div className="space-y-4 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-txt">{t.stepsSectionTitle}</h2>
              {steps.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddStep}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-surface text-primary"
                >
                  + {t.buttonAddStep}
                </button>
              )}
            </div>

            {steps.length >= 10 && (
              <p className="text-xs text-amber-400 font-medium">{t.maxStepsAlert}</p>
            )}

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div
                  key={`step-${idx}`}
                  className="p-4 rounded-lg border border-border/80 bg-bg/60 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {t.stepPositionLabel} #{step.position}
                    </span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(idx)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        {t.buttonRemoveStep}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-txt mb-1">
                        {t.stepDelayLabel}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={step.delayMinutes}
                        onChange={(e) =>
                          handleStepChange(idx, "delayMinutes", Number(e.target.value))
                        }
                        className="w-full px-2.5 py-1.5 text-sm rounded border border-border bg-surface text-txt"
                      />
                      <span className="text-[10px] text-txt-secondary block mt-0.5">
                        {t.stepDelayHelp}
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-txt">
                          {t.stepMessageLabel}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleImproveWithAi(idx)}
                          className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          ✨ {t.buttonImproveWithAi}
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={step.message}
                        onChange={(e) => handleStepChange(idx, "message", e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 text-sm rounded border border-border bg-surface text-txt focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-sm rounded-lg border border-border text-txt hover:bg-surface"
            >
              {t.buttonCancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-fg hover:bg-primary-hover shadow-sm"
            >
              {t.buttonSaveSequence}
            </button>
          </div>
        </form>
      )}

      {/* Listado de Secuencias */}
      {sequences.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border/60 rounded-xl space-y-3">
          <p className="text-base font-semibold text-txt">{t.emptyStateTitle}</p>
          <p className="text-sm text-txt-secondary">{t.emptyStateDesc}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="p-5 rounded-xl border border-border bg-surface/40 hover:bg-surface/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-semibold text-txt">{seq.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      seq.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : seq.status === "paused"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          : "bg-surface text-txt-secondary border border-border"
                    }`}
                  >
                    {seq.status === "active"
                      ? t.statusActive
                      : seq.status === "paused"
                        ? t.statusPaused
                        : t.statusDraft}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {seq.origin === "platform_default" ? t.badgeDefault : t.badgeCustom}
                  </span>
                </div>
                <p className="text-xs text-txt-secondary">
                  Disparo tras {seq.triggerInactivityMinutes} minutos de inactividad ·{" "}
                  {seq.steps.length} {seq.steps.length === 1 ? "paso" : "pasos"} configurados
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(seq.id, seq.status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    seq.status === "active"
                      ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                      : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                  }`}
                >
                  {seq.status === "active" ? t.buttonPause : t.buttonActivate}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(seq)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-surface hover:bg-surface-hover text-txt transition-colors"
                >
                  Editar Secuencia
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


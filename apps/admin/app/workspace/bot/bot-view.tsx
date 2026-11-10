"use client";

import React, { useState } from "react";
import { Bot, Save, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import type { WorkspaceBotConfigDto } from "@mocter/domain";
import { workspaceFetch } from "@/lib/workspace-client";

interface BotViewProps {
  initialConfig: WorkspaceBotConfigDto | null;
}

const PRESETS = [
  {
    id: "natural_rhythm",
    name: "Ritmo Natural",
    description: "Tono cálido y conversacional que responde con cercanía y fluidez comercial.",
  },
  {
    id: "direct_seller",
    name: "Vendedor Directo",
    description: "Enfoque ágil orientado al cierre de ventas y resolución rápida de dudas de catálogo.",
  },
  {
    id: "technical_advisor",
    name: "Asesor Técnico",
    description: "Explicaciones detalladas sobre especificaciones de producto, materiales y garantías.",
  },
  {
    id: "empathetic_support",
    name: "Soporte Empático",
    description: "Prioriza la atención cuidadosa, aclaración de inquietudes y seguimiento postventa.",
  },
];

export function BotView({ initialConfig }: BotViewProps) {
  const [preset, setPreset] = useState(initialConfig?.botPreset || "natural_rhythm");
  const [reminders, setReminders] = useState(initialConfig?.remindersEnabled ?? false);
  const [returnsPolicy, setReturnsPolicy] = useState(initialConfig?.returnsPolicy || "");
  const [warrantyPolicy, setWarrantyPolicy] = useState(initialConfig?.warrantyPolicy || "");
  const [orderMessage, setOrderMessage] = useState(initialConfig?.orderMessage || "");
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>(
    initialConfig?.faqs || [],
  );

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddFaq = () => {
    setFaqs((prev) => [...prev, { question: "", answer: "" }]);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", val: string) => {
    setFaqs((prev) =>
      prev.map((faq, i) => (i === index ? { ...faq, [field]: val } : faq)),
    );
  };

  const handleRemoveFaq = (index: number) => {
    setFaqs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await workspaceFetch<WorkspaceBotConfigDto>("/api/tenant/bot", {
        method: "PUT",
        body: JSON.stringify({
          botPreset: preset,
          remindersEnabled: reminders,
          returnsPolicy: returnsPolicy.trim() || null,
          warrantyPolicy: warrantyPolicy.trim() || null,
          orderMessage: orderMessage.trim() || null,
          faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
        }),
      });

      if (!res.ok) {
        setError(res.error || "Error al guardar la configuración.");
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Error de conexión al guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Asistente AI Y Políticas De Atención
            </h1>
            <span className="rounded-full bg-[var(--dsn-accent)]/15 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30">
              Personalidad Comercial
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Personalidad, tono de respuesta y contexto de políticas comerciales para tu bot autónomo.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Guardando..." : "Guardar Cambios"}</span>
        </button>
      </header>

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Configuración del asistente actualizada exitosamente en la celda física.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Preset de Personalidad */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
          <h2 className="text-sm font-bold text-[var(--dsn-text)] mb-1">
            Preset De Personalidad Y Tono
          </h2>
          <p className="text-xs text-[var(--dsn-text-secondary)] mb-4">
            Selecciona el estilo con el que tu bot atenderá las conversaciones con tus clientes.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRESETS.map((p) => {
              const selected = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/10 text-[var(--dsn-text)]"
                      : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 text-[var(--dsn-text-secondary)] hover:border-[var(--dsn-border-strong)]"
                  }`}
                >
                  <span className={`text-xs font-bold ${selected ? "text-[var(--dsn-accent)]" : "text-[var(--dsn-text)]"}`}>
                    {p.name}
                  </span>
                  <span className="text-[11px] mt-1 text-[var(--dsn-text-secondary)]">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--dsn-border)] flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--dsn-text)]">
                Recordatorios Automáticos De Seguimiento
              </p>
              <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                Reconectar con prospectos inactivos tras un período de silencio.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[var(--dsn-surface-secondary)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--dsn-accent)]" />
            </label>
          </div>
        </section>

        {/* Políticas Comerciales */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[var(--dsn-text)]">
            Políticas Comerciales Y De Garantía
          </h2>

          <div>
            <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
              Política De Garantías
            </label>
            <textarea
              rows={2}
              value={warrantyPolicy}
              onChange={(e) => setWarrantyPolicy(e.target.value)}
              placeholder="Ej. Todos nuestros productos cuentan con 6 meses de garantía por defectos de fábrica."
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
              Política De Cambios Y Devoluciones
            </label>
            <textarea
              rows={2}
              value={returnsPolicy}
              onChange={(e) => setReturnsPolicy(e.target.value)}
              placeholder="Ej. Tienes hasta 15 días calendario para solicitar cambios en productos sin uso."
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--dsn-text)] mb-1">
              Mensaje De Confirmación De Pedido
            </label>
            <textarea
              rows={2}
              value={orderMessage}
              onChange={(e) => setOrderMessage(e.target.value)}
              placeholder="Ej. ¡Gracias por tu compra! Tu pedido fue registrado y te notificaremos el despacho."
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)] placeholder:text-[var(--dsn-text-secondary)]/50 focus:border-[var(--dsn-accent)] focus:outline-hidden"
            />
          </div>
        </section>

        {/* Preguntas Frecuentes */}
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--dsn-border)] mb-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                Preguntas Frecuentes (FAQ)
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Respuestas preparadas que el asistente usará para contestar inmediatamente.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddFaq}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Agregar Pregunta</span>
            </button>
          </div>

          {faqs.length === 0 ? (
            <p className="text-xs text-[var(--dsn-text-secondary)] italic text-center py-4">
              No has registrado preguntas frecuentes aún.
            </p>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                      placeholder="Pregunta (ej. ¿Hacen envíos a todo el país?)"
                      className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFaq(index)}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                    placeholder="Respuesta detallada..."
                    className="w-full rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </form>
    </div>
  );
}


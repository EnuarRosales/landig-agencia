"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu,
  Layers,
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit2,
  ShieldAlert,
  Percent,
} from "lucide-react";
import type {
  AdminAiGovernanceOverviewDto,
  AdminAiModelDto,
  AdminPromptBlockDto,
} from "@mocter/domain";

interface AiGovernanceViewProps {
  initialData: AdminAiGovernanceOverviewDto;
}

type TabType = "models" | "prompts" | "guardrails";

/**
 * Consola interactiva de gobernanza de IA, modelos LLM y prompts maestros (BOT-001, BOT-002, AI-001).
 *
 * Cumple estrictamente con la directiva AGENTS.md §4.8:
 * Todos los labels utilizan formato Title Case sin mayúsculas sostenidas ni clases uppercase.
 */
export function AiGovernanceView({ initialData }: AiGovernanceViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("models");
  const [editingModel, setEditingModel] = useState<AdminAiModelDto | null>(null);
  const [modelSpread, setModelSpread] = useState<number>(30);
  const [modelActive, setModelActive] = useState<boolean>(true);

  const [editingBlock, setEditingBlock] = useState<AdminPromptBlockDto | null>(null);
  const [blockEs, setBlockEs] = useState("");
  const [blockEn, setBlockEn] = useState("");

  const [defaultsForm, setDefaultsForm] = useState({
    defaultMaxTurns: initialData.defaults.defaultMaxTurns,
    defaultAnswerPolicy: initialData.defaults.defaultAnswerPolicy,
    defaultHandoffTriggers: initialData.defaults.defaultHandoffTriggers.join(", "),
    defaultMaxMessagesPerContact: initialData.defaults.defaultMaxMessagesPerContact,
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSaveModelSpread(e: React.FormEvent) {
    e.preventDefault();
    if (!editingModel) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_model_spread",
          modelId: editingModel.id,
          spreadPercent: modelSpread,
          isActive: modelActive,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar el modelo");
      }

      setFeedback({ type: "success", message: "Margen comercial y estado del modelo actualizados." });
      setEditingModel(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePromptBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBlock) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_prompt_block",
          blockKey: editingBlock.blockKey,
          contentEs: blockEs,
          contentEn: blockEn,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al guardar el bloque de prompt");
      }

      setFeedback({ type: "success", message: `Bloque ${editingBlock.blockKey} versionado y activado.` });
      setEditingBlock(null);
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDefaults(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const triggers = defaultsForm.defaultHandoffTriggers
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_defaults",
          defaultMaxTurns: Number(defaultsForm.defaultMaxTurns),
          defaultAnswerPolicy: defaultsForm.defaultAnswerPolicy,
          defaultHandoffTriggers: triggers,
          defaultMaxMessagesPerContact: Number(defaultsForm.defaultMaxMessagesPerContact),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fallo al actualizar parámetros por defecto");
      }

      setFeedback({ type: "success", message: "Parámetros globales de bots guardados exitosamente." });
      router.refresh();
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Selector de Pestañas HUD */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
        <button
          type="button"
          onClick={() => { setActiveTab("models"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "models"
              ? "bg-[var(--dsn-accent)] text-black shadow-xs"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Cpu className="h-4 w-4" />
          <span>Proveedores y Modelos LLM</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("prompts"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "prompts"
              ? "bg-[var(--dsn-accent)] text-black shadow-xs"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Biblioteca De Prompts Maestros</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab("guardrails"); setFeedback(null); }}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
            activeTab === "guardrails"
              ? "bg-[var(--dsn-accent)] text-black shadow-xs"
              : "text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Parámetros Globales y Guardrails</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 1: PROVEEDORES Y MODELOS LLM
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "models" && (
        <div className="space-y-6">
          {/* Grilla de proveedores soportados */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {initialData.providers.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3 text-center shadow-xs"
              >
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dsn-accent)]/10 text-[var(--dsn-accent)] mb-2 font-bold font-mono text-xs">
                  {p.code.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="text-xs font-semibold text-[var(--dsn-text)] truncate">{p.name}</h3>
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
                    {p.modelsCount} modelos
                  </span>
                </div>
              </div>
            ))}
          </section>

          {/* Tabla de Modelos y Spread */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-[var(--dsn-border)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--dsn-text)]">
                  Catálogo De Modelos LLM y Spread Comercial
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Márgenes de ganancia sobre inferencia Mocter (30% default) y límites de contexto por modelo.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text-secondary)] border-b border-[var(--dsn-border)]">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Modelo</th>
                    <th className="py-3 px-4 font-semibold">Proveedor</th>
                    <th className="py-3 px-4 font-semibold">Ventana Contexto</th>
                    <th className="py-3 px-4 font-semibold">Costo Base USD</th>
                    <th className="py-3 px-4 font-semibold">Spread Comercial</th>
                    <th className="py-3 px-4 font-semibold">Precio Al Inquilino</th>
                    <th className="py-3 px-4 font-semibold">Estado</th>
                    <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)]">
                  {initialData.models.map((m) => (
                    <tr key={m.id} className="hover:bg-[var(--dsn-surface-secondary)]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--dsn-text)]">{m.displayName}</div>
                        <div className="text-[11px] text-[var(--dsn-text-secondary)] font-mono">{m.modelId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-[var(--dsn-accent)] border border-cyan-500/20">
                          {m.providerCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        {(m.contextWindow / 1000).toLocaleString()}k tokens
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                        ${(m.costInputMtokUsdCents / 100).toFixed(3)} / Mtok
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono font-medium text-emerald-400">
                          <Percent className="h-3 w-3" />
                          {m.spreadPercent}%
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] font-medium text-emerald-400">
                        ${(m.retailInputMtokUsdCents / 100).toFixed(3)} / Mtok
                      </td>
                      <td className="py-3 px-4">
                        {m.isActive ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                            Activo
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModel(m);
                            setModelSpread(m.spreadPercent);
                            setModelActive(m.isActive);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-[var(--dsn-border)] px-2 py-1 text-[11px] text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                        >
                          <Edit2 className="h-3 w-3" />
                          <span>Configurar</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Modal de edición de spread de modelo */}
          {editingModel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Configurar Modelo: {editingModel.displayName}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Ajusta el margen comercial (spread) aplicado al saldo de recarga en billetera para este LLM.
                </p>

                <form onSubmit={handleSaveModelSpread} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Spread Comercial Porcentual (%)
                    </label>
                    <div className="flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="200"
                        required
                        value={modelSpread}
                        onChange={(e) => setModelSpread(Number(e.target.value))}
                        className="w-full bg-transparent text-xs text-[var(--dsn-text)] outline-none font-mono"
                      />
                      <span className="text-xs text-[var(--dsn-text-secondary)]">%</span>
                    </div>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                      Costo base: ${(editingModel.costInputMtokUsdCents / 100).toFixed(3)} USD $\rightarrow$ Precio final: ${(
                        (editingModel.costInputMtokUsdCents * (1 + modelSpread / 100)) /
                        100
                      ).toFixed(3)} USD
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="modelActiveCheck"
                      checked={modelActive}
                      onChange={(e) => setModelActive(e.target.checked)}
                      className="rounded border-[var(--dsn-border)] text-[var(--dsn-accent)]"
                    />
                    <label htmlFor="modelActiveCheck" className="text-xs font-medium text-[var(--dsn-text)]">
                      Modelo Activo Para Inferencia
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => setEditingModel(null)}
                      className="rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Guardar Cambios</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 2: BIBLIOTECA DE PROMPTS MAESTROS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "prompts" && (
        <div className="space-y-6">
          {/* Bloques modulares del prompt del bot */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
                  Bloques De Composición Dinámica Del Bot
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                  Estructura modular en capas (identidad, personalidad, medios, orden, cierre) de BOT-002.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {initialData.promptBlocks.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[var(--dsn-accent)]">
                      {b.blockKey}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                        v{b.version}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBlock(b);
                          setBlockEs(b.contentEs);
                          setBlockEn(b.contentEn);
                        }}
                        className="inline-flex items-center gap-1 rounded bg-[var(--dsn-surface)] border border-[var(--dsn-border)] px-2 py-0.5 text-[11px] text-[var(--dsn-text)] hover:border-[var(--dsn-accent)]"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Editar</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--dsn-text)] line-clamp-3 bg-[var(--dsn-surface)] p-2 rounded border border-[var(--dsn-border)] font-mono text-[11px]">
                    {b.contentEs}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Prompts maestros de asistencia con AI (AiAssist) */}
          <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
            <div className="border-b border-[var(--dsn-border)] pb-3 mb-4">
              <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
                Prompts Maestros De Asistencia «Mejorar Con AI»
              </h3>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                Directivas especializadas para cada campo de texto libre editable por los inquilinos.
              </p>
            </div>

            <div className="divide-y divide-[var(--dsn-border)]">
              {initialData.aiAssistPrompts.map((ap) => (
                <div key={ap.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">{ap.fieldLabel}</span>
                      <span className="font-mono text-[10px] text-[var(--dsn-text-secondary)]">({ap.fieldKey})</span>
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400">v{ap.version}</span>
                    </div>
                    <p className="text-xs text-[var(--dsn-text-secondary)] font-mono text-[11px] line-clamp-2">
                      {ap.masterPrompt}
                    </p>
                  </div>
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-400 font-mono shrink-0">
                    Asistido
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Modal de edición de bloque de prompt */}
          {editingBlock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-xl rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xl">
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  Editar Bloque De Prompt: {editingBlock.blockKey}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)] mt-1">
                  Al guardar se incrementa automáticamente la versión y se activa de forma inmutable para todos los bots.
                </p>

                <form onSubmit={handleSavePromptBlock} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Contenido En Español
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={blockEs}
                      onChange={(e) => setBlockEs(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                      Contenido En Inglés (English)
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={blockEn}
                      onChange={(e) => setBlockEn(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] p-3 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--dsn-border)]">
                    <button
                      type="button"
                      onClick={() => setEditingBlock(null)}
                      className="rounded-lg border border-[var(--dsn-border)] px-4 py-2 text-xs text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>Versionar Bloque</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑA 3: PARÁMETROS GLOBALES Y GUARDRAILS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "guardrails" && (
        <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs max-w-2xl">
          <div className="border-b border-[var(--dsn-border)] pb-3 mb-5">
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">
              Límites Operativos y Guardrails De Seguridad
            </h3>
            <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
              Valores por defecto aplicados a los nuevos bots creados por los inquilinos en la SaaS.
            </p>
          </div>

          <form onSubmit={handleSaveDefaults} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Turnos Máximos De Conversación
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={defaultsForm.defaultMaxTurns}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultMaxTurns: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Límite de turnos de diálogo antes de ofrecer forzosamente transferencia con un humano.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Política De Respuesta Por Defecto
              </label>
              <select
                value={defaultsForm.defaultAnswerPolicy}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultAnswerPolicy: e.target.value })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
              >
                <option value="solo_conocimiento">Solo Conocimiento Verificado (Estricta contra alucinaciones)</option>
                <option value="libre">Respuesta Libre Con Contexto Comercial</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Palabras Clave De Transferencia A Asesor Humano (Handoff)
              </label>
              <input
                type="text"
                value={defaultsForm.defaultHandoffTriggers}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultHandoffTriggers: e.target.value })}
                placeholder="asesor, humano, reclamo, queja, agente"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)]"
              />
              <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-1">
                Separadas por comas. El bot pausa automáticamente su intervención si el cliente escribe alguna de ellas.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dsn-text)] mb-1">
                Mensajes Máximos Permitidos Por Contacto
              </label>
              <input
                type="number"
                min="10"
                max="500"
                value={defaultsForm.defaultMaxMessagesPerContact}
                onChange={(e) => setDefaultsForm({ ...defaultsForm, defaultMaxMessagesPerContact: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs text-[var(--dsn-text)] outline-none focus:border-[var(--dsn-accent)] font-mono"
              />
            </div>

            <div className="pt-3 border-t border-[var(--dsn-border)]">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Guardar Parámetros Globales</span>
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

import React from "react";
import { fetchAdminAiGovernanceOverview } from "@mocter/domain";
import { Bot, Cpu, Layers, Sparkles, Percent } from "lucide-react";
import { AiGovernanceView } from "./ai-governance-view";

export const metadata = {
  title: "Gobernanza De IA y Prompts · mocter-admin",
  description: "Control de proveedores LLM, margen de inferencia, bloques de prompts y guardrails.",
};

/**
 * Consola administrativa de Inteligencia Artificial, Proveedores LLM y Prompts Maestros (BOT-001, BOT-002, AI-001).
 *
 * Permite al Platform Owner gestionar los modelos disponibles, fijar el spread comercial
 * de la SaaS (30% default) y versionar los bloques canónicos de prompts.
 */
export default async function AdminAiPage() {
  const overview = await fetchAdminAiGovernanceOverview();

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Encabezado HUD */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Gobernanza De Inteligencia Artificial y Prompts
            </h1>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-mono font-medium text-[var(--dsn-accent)] flex items-center gap-1 border border-cyan-500/20">
              Inferencia Mocter
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Supervisión de proveedores LLM, fijación de spread comercial, biblioteca de prompts maestros y guardrails.
          </p>
        </div>
      </header>

      {/* Métricas rápidas de IA */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Proveedores Activos</span>
            <Cpu className="h-4 w-4 text-[var(--dsn-accent)]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[var(--dsn-text)] font-mono">
            {overview.kpis.totalProviders}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            OpenAI, Anthropic, Gemini, DeepSeek
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Modelos Habilitados</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-400 font-mono">
            {overview.kpis.totalModels}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Catálogo activo de LLMs
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Prompts Maestros</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {overview.kpis.activePrompts}
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Bloques modulares + campos asistidos
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--dsn-text-secondary)]">Spread Promedio</span>
            <Percent className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-cyan-400 font-mono">
            {overview.kpis.defaultSpreadPercent}%
          </p>
          <p className="text-[11px] text-[var(--dsn-text-secondary)] mt-0.5">
            Margen de ganancia comercial
          </p>
        </div>
      </section>

      {/* Vista interactiva con pestañas */}
      <AiGovernanceView initialData={overview} />
    </div>
  );
}

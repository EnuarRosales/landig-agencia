"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DataTable } from "@/components/data-table";
import { validateContrast } from "@/lib/contrast";
import {
  Palette,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sliders,
  Eye,
  Layers,
  Save,
} from "lucide-react";

interface TokenRow {
  [key: string]: unknown;
  token: string;
  layer: string;
  dark: string;
  light: string;
  wcagRatio: string;
}

const DEFAULT_TOKENS = {
  accent: "#14b8a6",
  accentHover: "#0d9488",
  background: "#0a0a0a",
  surface: "#121212",
  text: "#f3f4f6",
  radius: "0.5rem",
};

/**
 * Editor interactivo y playground del Sistema de Diseño DSN-001.
 *
 * Permite modificar los tokens de diseño en caliente, validar contraste WCAG 2.2 AA
 * en tiempo real y persistir los cambios en la sesión de mocter-admin.
 */
export function DesignSystemPlayground() {
  const [accent, setAccent] = useState(DEFAULT_TOKENS.accent);
  const [accentHover, setAccentHover] = useState(DEFAULT_TOKENS.accentHover);
  const [background, setBackground] = useState(DEFAULT_TOKENS.background);
  const [surface, setSurface] = useState(DEFAULT_TOKENS.surface);
  const [textColor, setTextColor] = useState(DEFAULT_TOKENS.text);
  const [radius, setRadius] = useState(DEFAULT_TOKENS.radius);
  const [density, setDensity] = useState<"compact" | "normal" | "comfortable">(
    "normal",
  );
  const [notification, setNotification] = useState<string | null>(null);

  // Cargar tokens guardados al montar el componente
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mocter_custom_design_tokens");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed["--dsn-accent"]) setAccent(parsed["--dsn-accent"]);
        if (parsed["--dsn-accent-hover"])
          setAccentHover(parsed["--dsn-accent-hover"]);
        if (parsed["--dsn-background"])
          setBackground(parsed["--dsn-background"]);
        if (parsed["--dsn-surface"]) setSurface(parsed["--dsn-surface"]);
        if (parsed["--dsn-text"]) setTextColor(parsed["--dsn-text"]);
        if (parsed["--primitive-radius-md"])
          setRadius(parsed["--primitive-radius-md"]);
      }
    } catch {
      // Ignorar lectura
    }
  }, []);

  // Validación de accesibilidad WCAG 2.2 AA en vivo
  const textContrast = useMemo(() => {
    return validateContrast(textColor, background, true);
  }, [textColor, background]);

  const accentContrast = useMemo(() => {
    return validateContrast(accent, background, false);
  }, [accent, background]);

  const surfaceContrast = useMemo(() => {
    return validateContrast(textColor, surface, true);
  }, [textColor, surface]);

  // Aplicar tokens a documentElement en caliente
  const handleApplyTokens = () => {
    const root = document.documentElement;
    const tokens: Record<string, string> = {
      "--dsn-accent": accent,
      "--dsn-accent-hover": accentHover,
      "--dsn-background": background,
      "--dsn-surface": surface,
      "--dsn-text": textColor,
      "--primitive-radius-md": radius,
    };

    Object.entries(tokens).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    try {
      localStorage.setItem(
        "mocter_custom_design_tokens",
        JSON.stringify(tokens),
      );
    } catch {
      // Ignorar almacenamiento
    }

    setNotification(
      "¡Tokens aplicados exitosamente a toda la plataforma mocter-admin!",
    );
    setTimeout(() => setNotification(null), 4000);
  };

  // Restaurar tokens oficiales
  const handleResetDefaults = () => {
    const root = document.documentElement;
    const properties = [
      "--dsn-accent",
      "--dsn-accent-hover",
      "--dsn-background",
      "--dsn-surface",
      "--dsn-text",
      "--primitive-radius-md",
    ];

    properties.forEach((prop) => root.style.removeProperty(prop));

    try {
      localStorage.removeItem("mocter_custom_design_tokens");
    } catch {
      // Ignorar almacenamiento
    }

    setAccent(DEFAULT_TOKENS.accent);
    setAccentHover(DEFAULT_TOKENS.accentHover);
    setBackground(DEFAULT_TOKENS.background);
    setSurface(DEFAULT_TOKENS.surface);
    setTextColor(DEFAULT_TOKENS.text);
    setRadius(DEFAULT_TOKENS.radius);

    setNotification("Se han restaurado los tokens oficiales de Mocter SaaS.");
    setTimeout(() => setNotification(null), 4000);
  };

  const sampleRows: TokenRow[] = [
    {
      token: "--dsn-background",
      layer: "Semántico (Fondo)",
      dark: background,
      light: "#f9f9f9",
      wcagRatio: `${textContrast.ratio}:1`,
    },
    {
      token: "--dsn-surface",
      layer: "Semántico (Superficie)",
      dark: surface,
      light: "#ffffff",
      wcagRatio: `${surfaceContrast.ratio}:1`,
    },
    {
      token: "--dsn-accent",
      layer: "Marca (Acento Principal)",
      dark: accent,
      light: "#0f766e",
      wcagRatio: `${accentContrast.ratio}:1`,
    },
    {
      token: "--dsn-text",
      layer: "Semántico (Texto Principal)",
      dark: textColor,
      light: "#111827",
      wcagRatio: `${textContrast.ratio}:1`,
    },
    {
      token: "--primitive-radius-md",
      layer: "Primitivo (Radio Bordes)",
      dark: radius,
      light: radius,
      wcagRatio: "N/A (Geometría)",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Alerta de Notificación Temporal */}
      {notification && (
        <div
          role="status"
          className="rounded-xl border border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/10 p-3.5 text-xs text-[var(--dsn-text)] backdrop-blur-md animate-in fade-in flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-[11px] underline opacity-70 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Panel 1: Editor Interactivo de Tokens */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[var(--dsn-accent)]/15 p-2 text-[var(--dsn-accent)]">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                Editor De Tokens Y Paleta En Caliente
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                Modificá los valores establecidos de la capa de marca y
                semántica con validación algorítmica WCAG.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-all active:scale-95"
            >
              <RotateCcw className="h-4 w-4 text-[var(--dsn-text-secondary)]" />
              <span>Restaurar Predeterminados</span>
            </button>

            <button
              type="button"
              onClick={handleApplyTokens}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--dsn-accent-hover)] transition-all active:scale-95"
            >
              <Save className="h-4 w-4" />
              <span>Aplicar Al Sistema En Caliente</span>
            </button>
          </div>
        </div>

        {/* Formulario de Selectores de Color y Geometría */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Color Acento */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Color De Acento (Marca: --dsn-accent)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                aria-label="Selector de Color de Acento"
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)]"
                placeholder="#14b8a6"
              />
            </div>
          </div>

          {/* Color Acento Hover */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Color De Acento Hover (--dsn-accent-hover)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentHover}
                onChange={(e) => setAccentHover(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                aria-label="Selector de Color Acento Hover"
              />
              <input
                type="text"
                value={accentHover}
                onChange={(e) => setAccentHover(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)]"
                placeholder="#0d9488"
              />
            </div>
          </div>

          {/* Color Fondo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Color De Fondo Semántico (--dsn-background)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                aria-label="Selector de Color de Fondo"
              />
              <input
                type="text"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)]"
                placeholder="#0a0a0a"
              />
            </div>
          </div>

          {/* Color Superficie */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Color De Superficie (--dsn-surface)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                aria-label="Selector de Color de Superficie"
              />
              <input
                type="text"
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)]"
                placeholder="#121212"
              />
            </div>
          </div>

          {/* Color Texto */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Color De Texto Principal (--dsn-text)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-10 w-12 rounded cursor-pointer border border-[var(--dsn-border)] bg-transparent p-1"
                aria-label="Selector de Color de Texto"
              />
              <input
                type="text"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-xs font-mono text-[var(--dsn-text)]"
                placeholder="#f3f4f6"
              />
            </div>
          </div>

          {/* Radio de Bordes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--dsn-text)]">
              Geometría De Bordes (--primitive-radius-md)
            </label>
            <select
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2.5 text-xs text-[var(--dsn-text)] cursor-pointer"
            >
              <option value="0px">0px · Cuadrado Estricto</option>
              <option value="0.375rem">6px · Suave Predeterminado</option>
              <option value="0.5rem">8px · Estándar Mocter</option>
              <option value="0.75rem">12px · Redondeado Moderno</option>
              <option value="1.25rem">20px · Orgánico / Extendido</option>
            </select>
          </div>
        </div>

        {/* Panel de Contraste Accesible WCAG 2.2 AA */}
        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--dsn-text)]">
              Certificación De Accesibilidad WCAG 2.2 AA En Vivo
            </span>
            <span className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
              Ratios obligatorios: 4.5:1 Texto · 3.0:1 UI
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Contraste Texto / Fondo */}
            <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Texto vs Fondo
                </p>
                <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                  {textContrast.ratio}:1
                </p>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  textContrast.valid
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {textContrast.valid ? "Cumple AA" : "Falla AA"}
              </span>
            </div>

            {/* Contraste Acento / Fondo */}
            <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Acento vs Fondo (UI)
                </p>
                <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                  {accentContrast.ratio}:1
                </p>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  accentContrast.valid
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {accentContrast.valid ? "Cumple UI (3:1)" : "Falla UI"}
              </span>
            </div>

            {/* Contraste Texto / Superficie */}
            <div className="rounded-lg border border-[var(--dsn-border)] p-3 bg-[var(--dsn-surface)] flex items-center justify-between">
              <div>
                <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                  Texto vs Superficie
                </p>
                <p className="text-sm font-bold font-mono text-[var(--dsn-text)]">
                  {surfaceContrast.ratio}:1
                </p>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  surfaceContrast.valid
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {surfaceContrast.valid ? "Cumple AA" : "Falla AA"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Panel 2: Sandbox de Componentes Vivos */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-[var(--dsn-accent)]" />
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              Sandbox Interactivo De Componentes Vivos
            </h2>
          </div>
          <span className="text-xs text-[var(--dsn-text-secondary)]">
            Responde instantáneamente a los tokens seleccionados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Muestra de Botones */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
              Variantes De Botones (Touch Target $\ge$ 44px)
            </h3>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                style={{
                  backgroundColor: accent,
                  borderRadius: radius,
                }}
                className="inline-flex min-h-[44px] items-center gap-2 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-95"
              >
                <span>Acción Principal</span>
              </button>

              <button
                type="button"
                style={{ borderRadius: radius }}
                className="inline-flex min-h-[44px] items-center gap-2 border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-border)]/50 transition-colors"
              >
                <span>Acción Secundaria</span>
              </button>

              {/* Botón Mejorar con AI (AI-001) */}
              <button
                type="button"
                style={{
                  borderColor: `${accent}40`,
                  backgroundColor: `${accent}15`,
                  color: accent,
                  borderRadius: radius,
                }}
                className="inline-flex min-h-[44px] items-center gap-2 border px-4 py-2 text-xs font-semibold transition-all hover:bg-opacity-25 active:scale-95"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Mejorar Con AI</span>
              </button>
            </div>
          </div>

          {/* Muestra de Inputs y Formulario */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--dsn-text-secondary)] uppercase tracking-wider">
              Campos De Formulario Con Focus Ring
            </h3>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--dsn-text)]">
                Nombre Del Comercio O Inquilino
              </label>
              <input
                type="text"
                defaultValue="Comercio Demostración Mocter"
                style={{ borderRadius: radius }}
                className="w-full border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3.5 py-2.5 text-xs text-[var(--dsn-text)] outline-none focus:ring-2"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Panel 3: Tabla Documentada de Tokens en 3 Capas */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--dsn-accent)]" />
            <h2 className="text-sm font-bold text-[var(--dsn-text)]">
              Catálogo Documentado De Tokens En 3 Capas
            </h2>
          </div>
          <span className="text-xs text-[var(--dsn-text-secondary)]">
            Primitivos · Semánticos · Marca
          </span>
        </div>

        <DataTable
          columns={[
            {
              key: "token",
              header: "Token CSS",
              sortable: true,
              filterable: true,
            },
            {
              key: "layer",
              header: "Capa Arquitectónica",
              sortable: true,
              filterable: true,
            },
            { key: "dark", header: "Valor Activo (Oscuro)" },
            { key: "light", header: "Valor Claro (Semántico)" },
            {
              key: "wcagRatio",
              header: "Contraste WCAG 2.2 AA",
              isNumeric: true,
              sortable: true,
            },
          ]}
          rows={sampleRows}
          emptyMessage="Sin tokens registrados"
        />
      </section>
    </div>
  );
}


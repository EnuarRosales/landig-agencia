"use client";

import React, { useState, useMemo } from "react";
import { WhiteLabelService } from "@mocter/domain";

export interface WhiteLabelEditorProps {
  clientId: string;
  planMode: "none" | "paleta" | "completa";
  initialBranding?: {
    brandName?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    palette?: {
      primary?: string;
      primaryForeground?: string;
      accent?: string;
      accentForeground?: string;
    } | null;
    removeMocterBranding?: boolean;
    customDomain?: string | null;
    customFont?: string | null;
  } | null;
  t: {
    title: string;
    subtitle: string;
    planBadge: string;
    noPlanWarning: string;
    layer1Title: string;
    brandNameLabel: string;
    logoUrlLabel: string;
    faviconUrlLabel: string;
    layer2Title: string;
    primaryColorLabel: string;
    primaryTextColorLabel: string;
    accentColorLabel: string;
    contrastRatioLabel: string;
    contrastPassed: string;
    contrastFailed: string;
    layer3Title: string;
    customDomainLabel: string;
    customFontLabel: string;
    removeBrandingLabel: string;
    previewTitle: string;
    previewButtonText: string;
    saveButton: string;
    resetButton: string;
    saving: string;
    successMessage: string;
  };
}

/**
 * Editor interactivo de marca blanca y paleta parametrizable (DSN-001 T-09, T-10, ADM-001 RF-15).
 * Valida contraste WCAG 2.2 AA en vivo y aplica el contrato por capas según el plan.
 */
export function WhiteLabelEditor({
  clientId,
  planMode,
  initialBranding,
  t,
}: WhiteLabelEditorProps) {
  const [brandName, setBrandName] = useState(initialBranding?.brandName || "");
  const [logoUrl, setLogoUrl] = useState(initialBranding?.logoUrl || "");
  const [faviconUrl, setFaviconUrl] = useState(initialBranding?.faviconUrl || "");
  const [primaryColor, setPrimaryColor] = useState(
    initialBranding?.palette?.primary || "#1E3A8A",
  );
  const [primaryTextColor, setPrimaryTextColor] = useState(
    initialBranding?.palette?.primaryForeground || "#FFFFFF",
  );
  const [accentColor, setAccentColor] = useState(
    initialBranding?.palette?.accent || "#0EA5E9",
  );
  const [customDomain, setCustomDomain] = useState(initialBranding?.customDomain || "");
  const [customFont, setCustomFont] = useState(initialBranding?.customFont || "Inter");
  const [removeMocterBranding, setRemoveMocterBranding] = useState(
    initialBranding?.removeMocterBranding || false,
  );

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Validación de contraste accesible en tiempo real (RF-15.4, DSN-001 §9)
  const contrastResult = useMemo(() => {
    try {
      return WhiteLabelService.validateContrast(primaryTextColor, primaryColor, true);
    } catch {
      return { valid: false, ratio: 0, requiredRatio: 4.5, message: "Color hexadecimal inválido" };
    }
  }, [primaryTextColor, primaryColor]);

  const canEditPalette = planMode === "paleta" || planMode === "completa";
  const canEditFullBrand = planMode === "completa";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contrastResult.valid) {
      setIsError(true);
      setStatusMessage(contrastResult.message || t.contrastFailed);
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setIsError(false);

    try {
      // Simulación de guardado en el cliente para el componente visual
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStatusMessage(t.successMessage);
      setIsError(false);
    } catch {
      setIsError(true);
      setStatusMessage("Error al guardar la configuración.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setBrandName("");
    setLogoUrl("");
    setFaviconUrl("");
    setPrimaryColor("#1E3A8A");
    setPrimaryTextColor("#FFFFFF");
    setAccentColor("#0EA5E9");
    setCustomDomain("");
    setCustomFont("Inter");
    setRemoveMocterBranding(false);
    setStatusMessage("Configuración restaurada a valores por defecto de Mocter.");
    setIsError(false);
  };

  if (planMode === "none") {
    return (
      <div className="p-6 rounded-lg border border-white/10 bg-[#090d16] text-txt max-w-2xl mx-auto">
        <h2 className="text-xl font-mono font-bold text-white mb-2">{t.title}</h2>
        <div
          data-testid="no-plan-warning"
          className="p-4 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm font-mono"
        >
          {t.noPlanWarning}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto text-txt bg-bg font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-mono font-bold text-white">{t.title}</h1>
            <span
              data-testid="plan-badge"
              className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded bg-primary/20 text-primary border border-primary/40 uppercase"
            >
              {planMode}
            </span>
          </div>
          <p className="text-sm text-white/60 font-mono mt-1">{t.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="self-start md:self-auto px-3.5 py-2 text-xs font-mono font-medium rounded border border-white/20 bg-white/5 hover:bg-white/10 text-white transition-colors"
        >
          {t.resetButton}
        </button>
      </div>

      {statusMessage && (
        <div
          data-testid="status-message"
          className={`mt-6 p-4 rounded text-xs font-mono border ${
            isError
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <form onSubmit={handleSave} className="mt-8 space-y-8">
        {/* Capa 1: Identidad Básica (Solo plan completa) */}
        <section className={`p-5 rounded-lg border border-white/10 bg-[#090d16] ${!canEditFullBrand ? "opacity-50 pointer-events-none" : ""}`}>
          <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-white mb-4">
            Capa 1 · {t.layer1Title} {!canEditFullBrand && "(Requiere Plan Enterprise)"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.brandNameLabel}</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                disabled={!canEditFullBrand}
                placeholder="Mi Empresa SAS"
                className="w-full px-3 py-2 text-xs font-mono rounded bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.logoUrlLabel}</label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={!canEditFullBrand}
                placeholder="https://empresa.com/logo.svg"
                className="w-full px-3 py-2 text-xs font-mono rounded bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </section>

        {/* Capa 2: Paleta de Colores con Validación AA */}
        <section className="p-5 rounded-lg border border-white/10 bg-[#090d16]">
          <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-white mb-4">
            Capa 2 · {t.layer2Title} (WCAG 2.2 AA)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.primaryColorLabel}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded bg-white/5 border border-white/10 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.primaryTextColorLabel}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryTextColor}
                  onChange={(e) => setPrimaryTextColor(e.target.value)}
                  className="w-10 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryTextColor}
                  onChange={(e) => setPrimaryTextColor(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded bg-white/5 border border-white/10 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.accentColorLabel}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded bg-white/5 border border-white/10 text-white"
                />
              </div>
            </div>
          </div>

          {/* Indicador de Contraste en vivo */}
          <div
            data-testid="contrast-indicator"
            className={`mt-4 p-3 rounded border text-xs font-mono flex items-center justify-between ${
              contrastResult.valid
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            <div>
              <span className="font-bold">{t.contrastRatioLabel}: </span>
              <span>{contrastResult.ratio}:1 (Exigido: 4.5:1)</span>
            </div>
            <span className="font-bold uppercase tracking-wider">
              {contrastResult.valid ? t.contrastPassed : t.contrastFailed}
            </span>
          </div>

          {/* Preview interactivo en vivo */}
          <div className="mt-6 p-4 rounded border border-white/10 bg-[#060911]">
            <span className="text-xs font-mono text-white/40 uppercase block mb-3">{t.previewTitle}</span>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                data-testid="preview-button"
                style={{ backgroundColor: primaryColor, color: primaryTextColor }}
                className="px-5 py-2.5 text-xs font-mono font-bold rounded shadow-md transition-transform active:scale-95"
              >
                {t.previewButtonText}
              </button>
              <span
                style={{ color: accentColor }}
                className="text-xs font-mono font-medium underline"
              >
                Enlace de Acento
              </span>
            </div>
          </div>
        </section>

        {/* Capa 3: Experiencia Propia (Solo plan completa) */}
        <section className={`p-5 rounded-lg border border-white/10 bg-[#090d16] ${!canEditFullBrand ? "opacity-50 pointer-events-none" : ""}`}>
          <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-white mb-4">
            Capa 3 · {t.layer3Title} {!canEditFullBrand && "(Requiere Plan Enterprise)"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.customDomainLabel}</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                disabled={!canEditFullBrand}
                placeholder="portal.miempresa.com"
                className="w-full px-3 py-2 text-xs font-mono rounded bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-white/80 mb-1.5">{t.customFontLabel}</label>
              <select
                value={customFont}
                onChange={(e) => setCustomFont(e.target.value)}
                disabled={!canEditFullBrand}
                className="w-full px-3 py-2 text-xs font-mono rounded bg-[#090d16] border border-white/10 text-white focus:outline-none focus:border-primary"
              >
                <option value="Inter">Inter (Estándar)</option>
                <option value="Space Grotesk">Space Grotesk (HUD)</option>
                <option value="Chakra Petch">Chakra Petch (Cyber)</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="removeMocter"
              checked={removeMocterBranding}
              onChange={(e) => setRemoveMocterBranding(e.target.checked)}
              disabled={!canEditFullBrand}
              className="rounded bg-white/5 border-white/20 text-primary focus:ring-0"
            />
            <label htmlFor="removeMocter" className="text-xs font-mono text-white/80 cursor-pointer">
              {t.removeBrandingLabel}
            </label>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={isSaving || !contrastResult.valid}
            className="px-6 py-2.5 text-xs font-mono font-bold rounded bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-all shadow-md"
          >
            {isSaving ? t.saving : t.saveButton}
          </button>
        </div>
      </form>
    </div>
  );
}

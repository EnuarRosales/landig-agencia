"use client";

import React, { useState } from "react";
import {
  Paintbrush,
  Sparkles,
  Store,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Save,
  Globe,
  Sliders,
  Eye,
  Search,
} from "lucide-react";
import type { AdminBrandingSettingsDto } from "@mocter/domain";

interface AdminBrandingViewProps {
  initialData: AdminBrandingSettingsDto;
}

/**
 * Calcula la luminancia relativa y el ratio de contraste WCAG en el cliente para feedback inmediato.
 */
function getContrastRatio(hex1: string, hex2: string): number {
  try {
    const parse = (hex: string) => {
      const clean = hex.replace("#", "");
      if (clean.length !== 6) return null;
      const r = parseInt(clean.slice(0, 2), 16) / 255;
      const g = parseInt(clean.slice(2, 4), 16) / 255;
      const b = parseInt(clean.slice(4, 6), 16) / 255;
      const sRGB = [r, g, b].map((v) =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
      );
      return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
    };

    const lum1 = parse(hex1);
    const lum2 = parse(hex2);
    if (lum1 === null || lum2 === null) return 4.5;

    const brighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return Math.round(((brighter + 0.05) / (darker + 0.05)) * 100) / 100;
  } catch {
    return 4.5;
  }
}

/**
 * Vista de administración de identidad visual y gobernanza de marca blanca (ADM-001, DSN-001 §7).
 */
export function AdminBrandingView({ initialData }: AdminBrandingViewProps) {
  const [activeTab, setActiveTab] = useState<"platform" | "tenants">("platform");

  // Estado del formulario de plataforma
  const [brandName, setBrandName] = useState(initialData.platformBranding.brandName || "Mocter");
  const [logoUrl, setLogoUrl] = useState(initialData.platformBranding.logoUrl || "");
  const [faviconUrl, setFaviconUrl] = useState(initialData.platformBranding.faviconUrl || "");
  const [customDomain, setCustomDomain] = useState(initialData.platformBranding.customDomain || "mocter.co");
  const [customFont, setCustomFont] = useState(initialData.platformBranding.customFont || "Chakra Petch, Inter, sans-serif");
  const [primaryColor, setPrimaryColor] = useState(initialData.platformBranding.palette.primary || "#2F6BFF");
  const [primaryForeground, setPrimaryForeground] = useState(
    initialData.platformBranding.palette.primaryForeground || "#FFFFFF",
  );
  const [accentColor, setAccentColor] = useState(initialData.platformBranding.palette.accent || "#22D3EE");
  const [accentForeground, setAccentForeground] = useState(
    initialData.platformBranding.palette.accentForeground || "#0F172A",
  );
  const [removeMocterBranding, setRemoveMocterBranding] = useState(
    initialData.platformBranding.removeMocterBranding || false,
  );

  // Lista de comercios e inquilinos
  const [tenants, setTenants] = useState(initialData.tenantsBrandings || []);
  const [searchTenant, setSearchTenant] = useState("");

  // Estado de guardado y feedback
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Ratio de contraste en vivo
  const contrastRatio = getContrastRatio(primaryForeground, primaryColor);
  const isAccessible = contrastRatio >= 4.5;

  const filteredTenants = tenants.filter(
    (t) =>
      t.clientDisplayName.toLowerCase().includes(searchTenant.toLowerCase()) ||
      t.clientSlug.toLowerCase().includes(searchTenant.toLowerCase()) ||
      (t.brandName && t.brandName.toLowerCase().includes(searchTenant.toLowerCase())),
  );

  const handleSavePlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          logoUrl: logoUrl.trim() || null,
          faviconUrl: faviconUrl.trim() || null,
          customDomain: customDomain.trim() || null,
          customFont: customFont.trim() || null,
          primaryColor,
          primaryForeground,
          accentColor,
          accentForeground,
          removeMocterBranding,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Ocurrió un error al guardar la configuración de identidad corporativa.",
        });
      } else {
        setStatusMessage({
          type: "success",
          text: "Configuración de marca corporativa guardada correctamente.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: "error", text: `Error de red: ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  const handleResetTenant = async (clientId: string) => {
    if (!confirm("¿Desea restaurar la identidad visual del comercio a los valores predeterminados de Mocter?")) {
      return;
    }

    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", clientId }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "No se pudo restaurar la marca del comercio.");
      } else {
        setTenants((prev) =>
          prev.map((t) =>
            t.clientId === clientId
              ? {
                  ...t,
                  brandName: null,
                  logoUrl: null,
                  primaryColor: "#2F6BFF",
                  customDomain: null,
                  hasCustomBranding: false,
                }
              : t,
          ),
        );
      }
    } catch (err) {
      alert("Error de conexión al restaurar marca.");
    }
  };

  return (
    <div className="space-y-6">
      {/* HUD de Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--dsn-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
              Identidad De Marca Y Marca Blanca
            </h1>
            <span className="rounded bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] px-2 py-0.5 text-xs font-semibold">
              Gobernanza Corporativa
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Personalice la identidad institucional de la SaaS y supervise la configuración de marca blanca de los inquilinos.
          </p>
        </div>

        {/* Pestañas de Navegación */}
        <div className="inline-flex rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab("platform")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "platform"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Paintbrush className="h-3.5 w-3.5" />
            <span>Marca De La Plataforma</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tenants")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "tenants"
                ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                : "text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            <span>Inquilinos Y Comercios ({tenants.length})</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          role="alert"
          className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${
            statusMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. PESTAÑA: MARCA DE LA PLATAFORMA (SaaS)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "platform" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulario de Configuración */}
          <div className="lg:col-span-7">
            <form onSubmit={handleSavePlatform} className="space-y-5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 md:p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
                <Sliders className="h-4 w-4 text-[var(--dsn-accent)]" />
                <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                  Parámetros De Identidad Institucional
                </h2>
              </div>

              {/* Atributos Generales */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="brandName" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                    Nombre De Marca Institucional
                  </label>
                  <input
                    id="brandName"
                    type="text"
                    required
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    placeholder="Ej. Mocter"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="logoUrl" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      URL Del Logotipo Oficial
                    </label>
                    <input
                      id="logoUrl"
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      placeholder="https://ejemplo.com/logo.png"
                    />
                    <span className="text-[10px] text-[var(--dsn-text-secondary)]">Dejar en blanco para usar el imagotipo vectorial nativo.</span>
                  </div>

                  <div>
                    <label htmlFor="faviconUrl" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      URL Del Favicon
                    </label>
                    <input
                      id="faviconUrl"
                      type="url"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      placeholder="https://ejemplo.com/favicon.ico"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="customDomain" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Dominio Principal De Plataforma
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                      <input
                        id="customDomain"
                        type="text"
                        value={customDomain}
                        onChange={(e) => setCustomDomain(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                        placeholder="mocter.co"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="customFont" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Tipografía Y Familias Tipográficas
                    </label>
                    <input
                      id="customFont"
                      type="text"
                      value={customFont}
                      onChange={(e) => setCustomFont(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      placeholder="Chakra Petch, Inter, sans-serif"
                    />
                  </div>
                </div>
              </div>

              {/* Paleta de Colores */}
              <div className="border-t border-[var(--dsn-border)] pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--dsn-text-secondary)]">
                    Paleta De Colores Corporativa
                  </h3>
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                    isAccessible
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {isAccessible ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    <span>Ratio Contraste: {contrastRatio}:1 {isAccessible ? "(Accesible)" : "(Débil)"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="primaryColor" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Color Primario De Marca
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="primaryColorPicker"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                      />
                      <input
                        id="primaryColor"
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="primaryForeground" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Color De Texto Sobre Primario
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="primaryForegroundPicker"
                        value={primaryForeground}
                        onChange={(e) => setPrimaryForeground(e.target.value)}
                        className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                      />
                      <input
                        id="primaryForeground"
                        type="text"
                        value={primaryForeground}
                        onChange={(e) => setPrimaryForeground(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="accentColor" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Color De Acento Complementario
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="accentColorPicker"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                      />
                      <input
                        id="accentColor"
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="accentForeground" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Color De Texto Sobre Acento
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="accentForegroundPicker"
                        value={accentForeground}
                        onChange={(e) => setAccentForeground(e.target.value)}
                        className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                      />
                      <input
                        id="accentForeground"
                        type="text"
                        value={accentForeground}
                        onChange={(e) => setAccentForeground(e.target.value)}
                        className="flex-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm font-mono text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón de Guardado */}
              <div className="border-t border-[var(--dsn-border)] pt-4 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={saving || !isAccessible}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                >
                  <Save className="h-4 w-4" />
                  <span>{saving ? "Guardando Identidad..." : "Guardar Identidad Institucional"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Previsualización en Vivo */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-[var(--dsn-accent)]" />
                  <h3 className="text-xs font-bold text-[var(--dsn-text)]">
                    Previsualización En Tiempo Real
                  </h3>
                </div>
                <span className="text-[10px] text-[var(--dsn-text-secondary)] font-mono">
                  {primaryColor}
                </span>
              </div>

              {/* Tarjeta Mockup de UI */}
              <div className="space-y-4 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-4">
                {/* Cabecera Mockup */}
                <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
                  <div className="flex items-center gap-2.5">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt={brandName} className="h-7 w-auto object-contain max-w-[100px]" />
                    ) : (
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs shadow-xs"
                        style={{ backgroundColor: primaryColor, color: primaryForeground }}
                      >
                        {brandName.charAt(0)}
                      </div>
                    )}
                    <span className="font-bold text-sm text-[var(--dsn-text)]">{brandName}</span>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-semibold"
                    style={{ backgroundColor: accentColor, color: accentForeground }}
                  >
                    Control Plane
                  </span>
                </div>

                {/* Botones de Muestra */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[var(--dsn-text-secondary)]">Componentes De Acción</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-xs font-semibold shadow-xs transition-opacity hover:opacity-90"
                      style={{ backgroundColor: primaryColor, color: primaryForeground }}
                    >
                      Botón Primario
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text)]"
                    >
                      Botón Secundario
                    </button>
                  </div>
                </div>

                {/* Insignias de Muestra */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[var(--dsn-text-secondary)]">Insignias Y Estados</span>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: `${primaryColor}25`, color: primaryColor }}
                    >
                      Estado Activo
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
                    >
                      Acento Suave
                    </span>
                  </div>
                </div>

                {/* Dominio Mockup */}
                <div className="rounded border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2.5 text-xs text-[var(--dsn-text-secondary)] flex items-center justify-between">
                  <span>Enlace institucional:</span>
                  <span className="font-mono text-[var(--dsn-accent)]">https://{customDomain}</span>
                </div>
              </div>
            </div>

            {/* Tarjeta Informativa de Estándares Accesibles */}
            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 text-xs text-[var(--dsn-text-secondary)] space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-[var(--dsn-text)]">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>Norma De Accesibilidad WCAG 2.2 AA</span>
              </div>
              <p>
                La plataforma exige una relación de contraste mínima de <strong>4.5:1</strong> entre el texto y el color de fondo para garantizar la legibilidad universal en todos los dispositivos y modos de color.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. PESTAÑA: GOBERNANZA DE MARCA BLANCA DE INQUILINOS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "tenants" && (
        <div className="space-y-4 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--dsn-border)] pb-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                Gobernanza De Marca Blanca De Inquilinos
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)] mt-0.5">
                Supervise y gestione la personalización visual de los comercios registrados en la plataforma.
              </p>
            </div>

            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
              <input
                type="text"
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
                placeholder="Buscar por nombre o slug..."
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-1.5 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
              />
            </div>
          </div>

          {filteredTenants.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--dsn-text-secondary)]">
              No se encontraron comercios registrados que coincidan con la búsqueda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[var(--dsn-text-secondary)] uppercase tracking-wider font-semibold">
                  <tr>
                    <th scope="col" className="px-4 py-3">Comercio / Inquilino</th>
                    <th scope="col" className="px-4 py-3">Estado De Marca</th>
                    <th scope="col" className="px-4 py-3">Color Primario</th>
                    <th scope="col" className="px-4 py-3">Dominio Personalizado</th>
                    <th scope="col" className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)]">
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.clientId} className="hover:bg-[var(--dsn-surface-secondary)]/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {tenant.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tenant.logoUrl}
                              alt={tenant.clientDisplayName}
                              className="h-6 w-6 rounded object-contain bg-[var(--dsn-surface-secondary)] p-0.5 border border-[var(--dsn-border)]"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--dsn-surface-secondary)] text-[10px] font-bold text-[var(--dsn-text-secondary)] border border-[var(--dsn-border)]">
                              {tenant.clientDisplayName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-[var(--dsn-text)]">
                              {tenant.clientDisplayName}
                            </div>
                            <div className="text-[10px] font-mono text-[var(--dsn-text-secondary)]">
                              {tenant.clientSlug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {tenant.hasCustomBranding ? (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 text-purple-400 px-2 py-0.5 text-[10px] font-semibold border border-purple-500/20">
                            <Sparkles className="h-3 w-3" />
                            <span>Marca Personalizada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded bg-zinc-500/10 text-zinc-400 px-2 py-0.5 text-[10px] font-semibold border border-zinc-500/20">
                            Estándar Mocter
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-4 w-4 rounded-full border border-white/20 shadow-xs shrink-0"
                            style={{ backgroundColor: tenant.primaryColor }}
                          />
                          <span className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                            {tenant.primaryColor}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">
                        {tenant.customDomain ? (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-[var(--dsn-accent)]">
                            <span>{tenant.customDomain}</span>
                            <ExternalLink className="h-3 w-3" />
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Sin dominio propio</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tenant.hasCustomBranding ? (
                          <button
                            type="button"
                            onClick={() => handleResetTenant(tenant.clientId)}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/10 transition-colors"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Restaurar Valores Predeterminados</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-500">Sin modificaciones</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

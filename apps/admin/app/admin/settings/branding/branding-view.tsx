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
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  ConfirmationModal,
  Input,
  Label,
} from "@mocter/ui";

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

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [tenantToReset, setTenantToReset] = useState<(typeof tenants)[0] | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleOpenResetModal = (tenant: (typeof tenants)[0]) => {
    setTenantToReset(tenant);
    setResetError(null);
    setResetModalOpen(true);
  };

  const handleConfirmResetTenant = async () => {
    if (!tenantToReset) return;
    setResetLoading(true);
    setResetError(null);

    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", clientId: tenantToReset.clientId }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo restaurar la marca del comercio.");
      }

      setTenants((prev) =>
        prev.map((t) =>
          t.clientId === tenantToReset.clientId
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
      setResetModalOpen(false);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Error de conexión al restaurar marca.");
    } finally {
      setResetLoading(false);
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
            <Badge variant="accent">Gobernanza Corporativa</Badge>
          </div>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)] mt-1">
            Personalice la identidad institucional de la SaaS y supervise la configuración de marca blanca de los inquilinos.
          </p>
        </div>

        {/* Pestañas de Navegación */}
        <div className="inline-flex rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1 gap-1">
          <Button
            type="button"
            variant={activeTab === "platform" ? "ai" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("platform")}
            className="text-xs"
          >
            <Paintbrush className="h-3.5 w-3.5" />
            <span>Marca De La Plataforma</span>
          </Button>
          <Button
            type="button"
            variant={activeTab === "tenants" ? "ai" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("tenants")}
            className="text-xs"
          >
            <Store className="h-3.5 w-3.5" />
            <span>Inquilinos Y Comercios ({tenants.length})</span>
          </Button>
        </div>
      </div>

      {statusMessage && (
        <Alert variant={statusMessage.type === "success" ? "success" : "destructive"} role="alert">
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <AlertDescription className="text-sm">{statusMessage.text}</AlertDescription>
        </Alert>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. PESTAÑA: MARCA DE LA PLATAFORMA (SaaS)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "platform" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulario de Configuración */}
          <div className="lg:col-span-7">
            <Card asChild>
              <form onSubmit={handleSavePlatform} className="space-y-5 p-5 md:p-6">
                <div className="flex items-center gap-2 border-b border-[var(--dsn-border)] pb-3">
                  <Sliders className="h-4 w-4 text-[var(--dsn-accent)]" />
                  <h2 className="text-sm font-bold text-[var(--dsn-text)]">
                    Parámetros De Identidad Institucional
                  </h2>
                </div>

                {/* Atributos Generales */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="brandName" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                      Nombre De Marca Institucional
                    </Label>
                    <Input
                      id="brandName"
                      type="text"
                      required
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      className="text-sm"
                      placeholder="Ej. Mocter"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="logoUrl" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        URL Del Logotipo Oficial
                      </Label>
                      <Input
                        id="logoUrl"
                        type="url"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        className="text-sm"
                        placeholder="https://ejemplo.com/logo.png"
                      />
                      <span className="text-[10px] text-[var(--dsn-text-secondary)]">Dejar en blanco para usar el imagotipo vectorial nativo.</span>
                    </div>

                    <div>
                      <Label htmlFor="faviconUrl" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        URL Del Favicon
                      </Label>
                      <Input
                        id="faviconUrl"
                        type="url"
                        value={faviconUrl}
                        onChange={(e) => setFaviconUrl(e.target.value)}
                        className="text-sm"
                        placeholder="https://ejemplo.com/favicon.ico"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customDomain" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Dominio Principal De Plataforma
                      </Label>
                      <div className="relative">
                        <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--dsn-text-secondary)]" />
                        <Input
                          id="customDomain"
                          type="text"
                          value={customDomain}
                          onChange={(e) => setCustomDomain(e.target.value)}
                          className="pl-9 text-sm"
                          placeholder="mocter.co"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="customFont" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Tipografía Y Familias Tipográficas
                      </Label>
                      <Input
                        id="customFont"
                        type="text"
                        value={customFont}
                        onChange={(e) => setCustomFont(e.target.value)}
                        className="text-sm"
                        placeholder="Chakra Petch, Inter, sans-serif"
                      />
                    </div>
                  </div>
                </div>

                {/* Paleta de Colores */}
                <div className="border-t border-[var(--dsn-border)] pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-wider text-[var(--dsn-text-secondary)]">
                      Paleta de Colores Corporativa
                    </h3>
                    <Badge variant={isAccessible ? "success" : "warning"} className="gap-1.5 text-[11px]">
                      {isAccessible ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      <span>Ratio Contraste: {contrastRatio}:1 {isAccessible ? "(Accesible)" : "(Débil)"}</span>
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="primaryColor" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Color Primario De Marca
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="primaryColorPicker"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                        />
                        <Input
                          id="primaryColor"
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="flex-1 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="primaryForeground" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Color De Texto Sobre Primario
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="primaryForegroundPicker"
                          value={primaryForeground}
                          onChange={(e) => setPrimaryForeground(e.target.value)}
                          className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                        />
                        <Input
                          id="primaryForeground"
                          type="text"
                          value={primaryForeground}
                          onChange={(e) => setPrimaryForeground(e.target.value)}
                          className="flex-1 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="accentColor" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Color De Acento Complementario
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="accentColorPicker"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                        />
                        <Input
                          id="accentColor"
                          type="text"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="flex-1 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="accentForeground" className="block text-xs font-semibold text-[var(--dsn-text-secondary)] mb-1">
                        Color De Texto Sobre Acento
                      </Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          id="accentForegroundPicker"
                          value={accentForeground}
                          onChange={(e) => setAccentForeground(e.target.value)}
                          className="h-9 w-10 cursor-pointer rounded border border-[var(--dsn-border)] bg-transparent p-0.5"
                        />
                        <Input
                          id="accentForeground"
                          type="text"
                          value={accentForeground}
                          onChange={(e) => setAccentForeground(e.target.value)}
                          className="flex-1 text-sm font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botón de Guardado */}
                <div className="border-t border-[var(--dsn-border)] pt-4 flex items-center justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={saving || !isAccessible}
                    loading={saving}
                    loadingText="Guardando Identidad..."
                    className="min-h-[44px] text-sm"
                  >
                    <Save className="h-4 w-4" />
                    <span>Guardar Identidad Institucional</span>
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Previsualización en Vivo */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5">
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
                    <Button
                      type="button"
                      size="sm"
                      className="h-auto min-h-0 px-3 py-1.5 text-xs"
                      style={{ backgroundColor: primaryColor, color: primaryForeground }}
                    >
                      Botón Primario
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-auto min-h-0 px-3 py-1.5 text-xs"
                    >
                      Botón Secundario
                    </Button>
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
            </Card>

            {/* Tarjeta Informativa de Estándares Accesibles */}
            <Card className="p-4 text-xs text-[var(--dsn-text-secondary)] space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-[var(--dsn-text)]">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>Norma De Accesibilidad WCAG 2.2 AA</span>
              </div>
              <p>
                La plataforma exige una relación de contraste mínima de <strong>4.5:1</strong> entre el texto y el color de fondo para garantizar la legibilidad universal en todos los dispositivos y modos de color.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. PESTAÑA: GOBERNANZA DE MARCA BLANCA DE INQUILINOS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "tenants" && (
        <Card className="space-y-4 p-5">
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
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--dsn-text-secondary)]" />
              <Input
                type="text"
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
                placeholder="Buscar por nombre o slug..."
                className="pl-9 text-xs"
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
                <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 text-[var(--dsn-text-secondary)] tracking-wider font-semibold">
                  <tr>
                    <th scope="col" className="px-4 py-3">Comercio / Inquilino</th>
                    <th scope="col" className="px-4 py-3">Estado de Marca</th>
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
                          <Badge variant="purple" className="gap-1 text-[10px]">
                            <Sparkles className="h-3 w-3" />
                            <span>Marca Personalizada</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Estándar Mocter
                          </Badge>
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
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenResetModal(tenant)}
                            className="h-auto min-h-0 px-2.5 py-1 text-[11px] text-amber-400 hover:bg-amber-500/10"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Restaurar Valores Predeterminados</span>
                          </Button>
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
        </Card>
      )}

      {/* Modal de Confirmación de Restauración de Marca (Regla 4.17) */}
      <ConfirmationModal
        isOpen={resetModalOpen}
        onClose={() => {
          setResetModalOpen(false);
          setResetError(null);
        }}
        onConfirm={handleConfirmResetTenant}
        title="Restauración de Marca Visual"
        subtitle="Reversión a los valores predeterminados de Mocter."
        variant="warning"
        icon={<RotateCcw className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        details={
          tenantToReset
            ? [
                {
                  label: "Comercio / Inquilino",
                  value: tenantToReset.clientDisplayName || tenantToReset.clientId,
                },
                {
                  label: "Identificador Slug",
                  value: tenantToReset.clientSlug,
                  mono: true,
                },
                {
                  label: "Dominio Personalizado",
                  value: tenantToReset.customDomain || "Sin dominio propio",
                },
              ]
            : []
        }
        warningTitle="Reversión a Identidad Canónica Mocter"
        warningMessage={
          <p>
            Esta acción restablecerá el logo corporativo, favicon, paleta personalizada y tipografía del comercio a los valores oficiales de la plataforma Mocter.
          </p>
        }
        confirmText="Restaurar Valores Predeterminados"
        confirmLoadingText="Restaurando Marca..."
        loading={resetLoading}
        error={resetError}
      />
    </div>
  );
}

"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  Check,
  Globe,
  ImagePlus,
  Loader2,
  Lock,
  Paintbrush,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Store,
  Upload,
} from "lucide-react";
import type {
  BrandingPaletteTokens,
  WhiteLabelCapabilityMode,
} from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface WorkspaceBrandingDto {
  brandName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  palette?: BrandingPaletteTokens | null;
  removeMocterBranding?: boolean;
  customDomain?: string | null;
  customFont?: string | null;
}

export interface WorkspaceBrandingViewProps {
  locale: AdminLocale;
  isOwner: boolean;
  tenantName: string;
  tenantSlug: string;
  initialMode: WhiteLabelCapabilityMode;
  initialBranding: WorkspaceBrandingDto | null;
  initialLogoUrl?: string | null;
  allowedFonts: string[];
  cnameTargetHost: string;
}

const DEFAULT_PALETTE: Required<
  Pick<
    BrandingPaletteTokens,
    | "primary"
    | "primaryForeground"
    | "accent"
    | "accentForeground"
    | "background"
    | "foreground"
    | "card"
    | "cardForeground"
  >
> = {
  primary: "#0F766E",
  primaryForeground: "#FFFFFF",
  accent: "#10B981",
  accentForeground: "#042F2E",
  background: "#0B1120",
  foreground: "#F8FAFC",
  card: "#111827",
  cardForeground: "#F1F5F9",
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function parseHexToRgb(hex: string): [number, number, number] | null {
  if (!HEX_COLOR_RE.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function getRelativeLuminance(rgb: [number, number, number]): number {
  const linear = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Calcula el ratio de contraste WCAG 2.2 AA en tiempo real entre primer plano y fondo.
 */
export function calculateWcagContrastRatio(fgHex: string, bgHex: string): number {
  const fgRgb = parseHexToRgb(fgHex);
  const bgRgb = parseHexToRgb(bgHex);
  if (!fgRgb || !bgRgb) return 0;
  const l1 = getRelativeLuminance(fgRgb);
  const l2 = getRelativeLuminance(bgRgb);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return Number(((bright + 0.05) / (dark + 0.05)).toFixed(2));
}

function ColorTokenField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
}) {
  const pickerValue = HEX_COLOR_RE.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-[var(--dsn-text)]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (color)`}
          value={pickerValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={7}
          placeholder="#0F766E"
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 font-mono text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}

function ContrastBadge({
  ratio,
  passLabel,
  failLabel,
}: {
  ratio: number;
  passLabel: string;
  failLabel: string;
}) {
  const valid = ratio >= 4.5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-mono ${
        valid
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-rose-500/40 bg-rose-500/10 text-rose-400"
      }`}
    >
      <span>{valid ? passLabel : failLabel}</span>
      <span>· {ratio.toFixed(2)}:1</span>
    </span>
  );
}

/**
 * Vista interactiva de Identidad y Marca Blanca para el comercio (`/workspace/branding`).
 */
export function WorkspaceBrandingView({
  locale,
  isOwner,
  tenantName,
  tenantSlug,
  initialMode,
  initialBranding,
  initialLogoUrl = null,
  allowedFonts,
  cnameTargetHost,
}: WorkspaceBrandingViewProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale).workspace;

  const initialPalette = {
    primary: initialBranding?.palette?.primary || DEFAULT_PALETTE.primary,
    primaryForeground:
      initialBranding?.palette?.primaryForeground || DEFAULT_PALETTE.primaryForeground,
    accent: initialBranding?.palette?.accent || DEFAULT_PALETTE.accent,
    accentForeground:
      initialBranding?.palette?.accentForeground || DEFAULT_PALETTE.accentForeground,
    background: initialBranding?.palette?.background || DEFAULT_PALETTE.background,
    foreground: initialBranding?.palette?.foreground || DEFAULT_PALETTE.foreground,
    card: initialBranding?.palette?.card || DEFAULT_PALETTE.card,
    cardForeground: initialBranding?.palette?.cardForeground || DEFAULT_PALETTE.cardForeground,
  };

  const [palette, setPalette] = useState(initialPalette);
  const [brandName, setBrandName] = useState(initialBranding?.brandName ?? "");
  const [logoUrl, setLogoUrl] = useState(initialBranding?.logoUrl || initialLogoUrl || "");
  const [faviconUrl, setFaviconUrl] = useState(initialBranding?.faviconUrl || "");
  const [customFont, setCustomFont] = useState(
    initialBranding?.customFont || allowedFonts[0] || "Inter",
  );
  const [customDomain, setCustomDomain] = useState(initialBranding?.customDomain ?? "");
  const [removeMocterBranding, setRemoveMocterBranding] = useState(
    Boolean(initialBranding?.removeMocterBranding),
  );

  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"logo" | "favicon" | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copiedCname, setCopiedCname] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  const primaryContrast = useMemo(
    () => calculateWcagContrastRatio(palette.primaryForeground, palette.primary),
    [palette.primaryForeground, palette.primary],
  );
  const accentContrast = useMemo(
    () => calculateWcagContrastRatio(palette.accentForeground, palette.accent),
    [palette.accentForeground, palette.accent],
  );
  const surfaceContrast = useMemo(
    () => calculateWcagContrastRatio(palette.foreground, palette.background),
    [palette.foreground, palette.background],
  );
  const cardContrast = useMemo(
    () => calculateWcagContrastRatio(palette.cardForeground, palette.card),
    [palette.cardForeground, palette.card],
  );

  const allContrastsValid =
    primaryContrast >= 4.5 &&
    accentContrast >= 4.5 &&
    surfaceContrast >= 4.5 &&
    cardContrast >= 4.5;

  const canEditPalette = isOwner && initialMode !== "none";
  const canEditFull = isOwner && initialMode === "completa";

  if (initialMode === "none") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <header className="flex flex-col gap-2 pb-4 border-b border-[var(--dsn-border)]">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5 text-[var(--dsn-accent)]" />
            <h1 className="text-xl font-bold text-[var(--dsn-text)]">{dict.brandingTitle}</h1>
          </div>
          <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.brandingSubtitle}</p>
        </header>

        <section
          data-testid="branding-mode-none-card"
          className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 md:p-10 text-center max-w-2xl mx-auto shadow-xs space-y-5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mx-auto border border-amber-500/20">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--dsn-text)]">
              {dict.brandingModeNoneTitle}
            </h2>
            <p className="text-sm text-[var(--dsn-text-secondary)] leading-relaxed">
              {dict.brandingModeNoneDesc}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/workspace/profile"
              className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-4 py-2.5 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors"
            >
              <Store className="h-4 w-4 text-[var(--dsn-accent)]" />
              <span>{dict.brandingModeNoneProfileCta}</span>
            </Link>
            <Link
              href="/workspace/billing"
              className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2.5 text-xs font-semibold text-[var(--dsn-accent-fg)] hover:opacity-90 transition-opacity"
            >
              <Sparkles className="h-4 w-4" />
              <span>{dict.brandingModeNoneUpgradeCta}</span>
            </Link>
          </div>
        </section>
      </div>
    );
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditPalette || !allContrastsValid) return;

    setSaving(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const payload =
        initialMode === "completa"
          ? {
              brandName: brandName.trim() || null,
              logoUrl: logoUrl.trim() || null,
              faviconUrl: faviconUrl.trim() || null,
              palette,
              customFont: customFont || null,
              customDomain: customDomain.trim() || null,
              removeMocterBranding,
            }
          : {
              palette,
            };

      const res = await fetch("/api/tenant/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedbackError(
          json?.detail || json?.error || "No fue posible guardar la configuración de marca.",
        );
        return;
      }

      setFeedbackSuccess(dict.brandingSaveSuccess);
      router.refresh();
    } catch {
      setFeedbackError("Error de red al guardar la configuración de marca blanca.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssetUpload(kind: "logo" | "favicon", file: File | undefined) {
    if (!file || !canEditFull) return;

    setUploadingKind(kind);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("file", file);

      const res = await fetch("/api/tenant/branding/asset", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedbackError(
          json?.detail || json?.error || "No fue posible cargar el archivo visual.",
        );
        return;
      }

      if (kind === "logo" && json?.data?.url) {
        setLogoUrl(json.data.url);
      } else if (kind === "favicon" && json?.data?.url) {
        setFaviconUrl(json.data.url);
      }

      setFeedbackSuccess(dict.brandingAssetUploadedSuccess);
      router.refresh();
    } catch {
      setFeedbackError("Error de red al subir el activo visual.");
    } finally {
      setUploadingKind(null);
      if (kind === "logo" && logoInputRef.current) logoInputRef.current.value = "";
      if (kind === "favicon" && faviconInputRef.current) faviconInputRef.current.value = "";
    }
  }

  async function handleConfirmReset() {
    setResetting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await fetch("/api/tenant/branding", {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedbackError(
          json?.detail || json?.error || "No fue posible restaurar la configuración por defecto.",
        );
        return;
      }

      setPalette(DEFAULT_PALETTE);
      setBrandName("");
      setLogoUrl(initialLogoUrl || "");
      setFaviconUrl("");
      setCustomDomain("");
      setCustomFont(allowedFonts[0] || "Inter");
      setRemoveMocterBranding(false);
      setResetModalOpen(false);
      setFeedbackSuccess(dict.brandingResetSuccess);
      router.refresh();
    } catch {
      setFeedbackError("Error de red al restaurar la configuración visual.");
    } finally {
      setResetting(false);
    }
  }

  const copyCnameHost = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cnameTargetHost);
      setCopiedCname(true);
      setTimeout(() => setCopiedCname(false), 2000);
    }
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-col gap-3 pb-4 border-b border-[var(--dsn-border)] md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Paintbrush className="h-5 w-5 text-[var(--dsn-accent)]" />
            <h1 className="text-xl font-bold text-[var(--dsn-text)]">{dict.brandingTitle}</h1>
            <span className="rounded-full border border-[var(--dsn-accent)]/30 bg-[var(--dsn-accent)]/15 px-2.5 py-0.5 text-[11px] font-medium text-[var(--dsn-accent)]">
              {initialMode === "completa" ? dict.brandingModeFullBadge : dict.brandingModePaletteBadge}
            </span>
          </div>
          <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.brandingSubtitle}</p>
        </div>

        {canEditPalette && (
          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            <span>{dict.brandingResetCta}</span>
          </button>
        )}
      </header>

      {!isOwner && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
          <p>{dict.brandingOwnerOnlyNotice}</p>
        </div>
      )}

      {feedbackError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-400" />
          <p>{feedbackError}</p>
        </div>
      )}

      {feedbackSuccess && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-300"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <p>{feedbackSuccess}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form onSubmit={handleSaveBranding} className="space-y-6 lg:col-span-7">
          {/* Sección 1: Paleta de Colores y Contraste Accesible */}
          <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 space-y-5 shadow-xs">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.brandingSectionPaletteTitle}
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {dict.brandingSectionPaletteSubtitle}
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorTokenField
                  id="branding-primary"
                  label={dict.brandingPrimaryColorLabel}
                  value={palette.primary}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, primary: v }))}
                />
                <ColorTokenField
                  id="branding-primary-fg"
                  label={dict.brandingPrimaryFgLabel}
                  value={palette.primaryForeground}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, primaryForeground: v }))}
                />
              </div>
              <ContrastBadge
                ratio={primaryContrast}
                passLabel={dict.brandingContrastPass}
                failLabel={dict.brandingContrastFail}
              />
            </div>

            <div className="space-y-4 pt-2 border-t border-[var(--dsn-border)]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorTokenField
                  id="branding-accent"
                  label={dict.brandingAccentColorLabel}
                  value={palette.accent}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, accent: v }))}
                />
                <ColorTokenField
                  id="branding-accent-fg"
                  label={dict.brandingAccentFgLabel}
                  value={palette.accentForeground}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, accentForeground: v }))}
                />
              </div>
              <ContrastBadge
                ratio={accentContrast}
                passLabel={dict.brandingContrastPass}
                failLabel={dict.brandingContrastFail}
              />
            </div>

            <div className="space-y-4 pt-2 border-t border-[var(--dsn-border)]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorTokenField
                  id="branding-bg"
                  label={dict.brandingBackgroundColorLabel}
                  value={palette.background}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, background: v }))}
                />
                <ColorTokenField
                  id="branding-fg"
                  label={dict.brandingForegroundColorLabel}
                  value={palette.foreground}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, foreground: v }))}
                />
              </div>
              <ContrastBadge
                ratio={surfaceContrast}
                passLabel={dict.brandingContrastPass}
                failLabel={dict.brandingContrastFail}
              />
            </div>

            <div className="space-y-4 pt-2 border-t border-[var(--dsn-border)]">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ColorTokenField
                  id="branding-card"
                  label={dict.brandingCardColorLabel}
                  value={palette.card}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, card: v }))}
                />
                <ColorTokenField
                  id="branding-card-fg"
                  label={dict.brandingCardFgLabel}
                  value={palette.cardForeground}
                  disabled={!canEditPalette}
                  onChange={(v) => setPalette((p) => ({ ...p, cardForeground: v }))}
                />
              </div>
              <ContrastBadge
                ratio={cardContrast}
                passLabel={dict.brandingContrastPass}
                failLabel={dict.brandingContrastFail}
              />
            </div>
          </section>

          {/* Sección 2: Activos y Marca Blanca Completa */}
          <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 space-y-5 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[var(--dsn-text)]">
                  {dict.brandingSectionAssetsTitle}
                </h2>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {dict.brandingSectionAssetsSubtitle}
                </p>
              </div>
              {initialMode !== "completa" && (
                <Link
                  href="/workspace/billing"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/15 shrink-0"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{dict.brandingModeNoneUpgradeCta}</span>
                </Link>
              )}
            </div>

            {initialMode !== "completa" ? (
              <p className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/60 p-4 text-xs text-[var(--dsn-text-secondary)]">
                {dict.brandingEnterpriseLockedHint}
              </p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="branding-brand-name"
                      className="block text-xs font-medium text-[var(--dsn-text)]"
                    >
                      {dict.brandingBrandNameLabel}
                    </label>
                    <input
                      id="branding-brand-name"
                      type="text"
                      maxLength={120}
                      disabled={!canEditFull}
                      value={brandName}
                      placeholder={dict.brandingBrandNamePlaceholder}
                      onChange={(e) => setBrandName(e.target.value)}
                      className="h-11 w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="branding-custom-font"
                      className="block text-xs font-medium text-[var(--dsn-text)]"
                    >
                      {dict.brandingFontLabel}
                    </label>
                    <select
                      id="branding-custom-font"
                      disabled={!canEditFull}
                      value={customFont}
                      onChange={(e) => setCustomFont(e.target.value)}
                      className="h-11 w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                    >
                      {allowedFonts.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Upload Logo y Favicon */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">
                        {dict.brandingLogoLabel}
                      </span>
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt={brandName || tenantName}
                          className="h-8 w-8 rounded-md object-contain border border-[var(--dsn-border)] bg-[var(--dsn-surface)]"
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      {dict.brandingLogoHint}
                    </p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      aria-label={dict.brandingLogoUploadCta}
                      onChange={(e) => void handleAssetUpload("logo", e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={!canEditFull || uploadingKind !== null}
                      onClick={() => logoInputRef.current?.click()}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
                    >
                      {uploadingKind === "logo" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4 text-[var(--dsn-accent)]" />
                      )}
                      <span>
                        {uploadingKind === "logo"
                          ? dict.brandingLogoUploading
                          : dict.brandingLogoUploadCta}
                      </span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--dsn-text)]">
                        {dict.brandingFaviconLabel}
                      </span>
                      {faviconUrl && (
                        <img
                          src={faviconUrl}
                          alt="Favicon"
                          className="h-7 w-7 rounded object-contain border border-[var(--dsn-border)] bg-[var(--dsn-surface)]"
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      {dict.brandingFaviconHint}
                    </p>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/x-icon,.ico,image/svg+xml"
                      className="hidden"
                      aria-label={dict.brandingFaviconUploadCta}
                      onChange={(e) => void handleAssetUpload("favicon", e.target.files?.[0])}
                    />
                    <button
                      type="button"
                      disabled={!canEditFull || uploadingKind !== null}
                      onClick={() => faviconInputRef.current?.click()}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
                    >
                      {uploadingKind === "favicon" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 text-[var(--dsn-accent)]" />
                      )}
                      <span>
                        {uploadingKind === "favicon"
                          ? dict.brandingFaviconUploading
                          : dict.brandingFaviconUploadCta}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Dominio Personalizado + Instrucción CNAME */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="branding-custom-domain"
                      className="block text-xs font-medium text-[var(--dsn-text)]"
                    >
                      {dict.brandingCustomDomainLabel}
                    </label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dsn-text-secondary)]" />
                      <input
                        id="branding-custom-domain"
                        type="text"
                        maxLength={255}
                        disabled={!canEditFull}
                        value={customDomain}
                        placeholder={dict.brandingCustomDomainPlaceholder}
                        onChange={(e) => setCustomDomain(e.target.value)}
                        className="h-11 w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 font-mono text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      {dict.brandingCustomDomainHint}
                    </p>
                  </div>

                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5 space-y-2 text-xs">
                    <p className="font-semibold text-cyan-300">{dict.brandingCnameTitle}</p>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      {dict.brandingCnameDesc}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 font-mono text-[11px]">
                      <span className="text-[var(--dsn-text)] break-all">
                        {(customDomain.trim() || dict.brandingCustomDomainPlaceholder) +
                          "  CNAME  " +
                          cnameTargetHost}
                      </span>
                      <button
                        type="button"
                        onClick={copyCnameHost}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--dsn-accent)] hover:bg-[var(--dsn-surface-secondary)]"
                      >
                        {copiedCname ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{cnameTargetHost}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Toggle Ocultar Marca Mocter */}
                <label className="flex items-start gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEditFull}
                    checked={removeMocterBranding}
                    onChange={(e) => setRemoveMocterBranding(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--dsn-accent)]"
                  />
                  <div className="space-y-0.5">
                    <span className="block text-xs font-semibold text-[var(--dsn-text)]">
                      {dict.brandingRemoveMocterLabel}
                    </span>
                    <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                      {dict.brandingRemoveMocterHint}
                    </span>
                  </div>
                </label>
              </div>
            )}
          </section>

          {canEditPalette && (
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
              <button
                type="submit"
                disabled={saving || !allContrastsValid}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-5 py-2.5 text-xs font-semibold text-[var(--dsn-accent-fg)] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{saving ? dict.brandingSaving : dict.brandingSaveCta}</span>
              </button>
            </div>
          )}
        </form>

        {/* Columna Derecha: Vista Previa en Vivo con Paleta Completa */}
        <aside className="space-y-4 lg:col-span-5">
          <div className="sticky top-6 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 space-y-4 shadow-xs">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.brandingPreviewTitle}
              </h2>
              <p className="text-xs text-[var(--dsn-text-secondary)]">
                {dict.brandingPreviewSubtitle}
              </p>
            </div>

            <div
              data-testid="branding-live-preview"
              style={{
                backgroundColor: palette.background,
                color: palette.foreground,
                fontFamily: initialMode === "completa" ? customFont : undefined,
              }}
              className="rounded-xl border border-[var(--dsn-border)] p-4 space-y-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={brandName || tenantName}
                      className="h-8 w-8 rounded-lg object-contain bg-white/5 border border-white/10 shrink-0"
                    />
                  ) : (
                    <div
                      style={{
                        backgroundColor: palette.primary,
                        color: palette.primaryForeground,
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    >
                      <Store className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">
                      {brandName.trim() || tenantName}
                    </p>
                    <p className="text-[11px] font-mono opacity-75 truncate">
                      {customDomain.trim() || `${tenantSlug}.mocter.co`}
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    backgroundColor: palette.accent,
                    color: palette.accentForeground,
                  }}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0"
                >
                  {dict.brandingPreviewSampleBadge}
                </span>
              </div>

              <div
                style={{
                  backgroundColor: palette.card,
                  color: palette.cardForeground,
                }}
                className="rounded-xl p-4 space-y-3 border border-white/10"
              >
                <p className="text-sm font-semibold">{dict.brandingPreviewSampleTitle}</p>
                <p className="text-xs opacity-80 leading-relaxed">
                  {dict.brandingPreviewSampleDesc}
                </p>
                <button
                  type="button"
                  style={{
                    backgroundColor: palette.primary,
                    color: palette.primaryForeground,
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold shadow-xs"
                >
                  {dict.brandingPreviewSampleCta}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmationModal
        isOpen={resetModalOpen}
        onClose={() => {
          if (!resetting) setResetModalOpen(false);
        }}
        onConfirm={handleConfirmReset}
        title={dict.brandingResetModalTitle}
        subtitle={dict.brandingResetModalSubtitle}
        variant="warning"
        loading={resetting}
        details={[
          { label: dict.brandingBrandNameLabel, value: brandName.trim() || tenantName },
          { label: dict.brandingPrimaryColorLabel, value: palette.primary, mono: true },
          ...(customDomain.trim()
            ? [{ label: dict.brandingCustomDomainLabel, value: customDomain.trim(), mono: true }]
            : []),
        ]}
        warningMessage={dict.brandingResetModalWarning}
        confirmText={dict.brandingResetConfirmCta}
        cancelText={dict.profilePaymentsCancelCta}
      />
    </div>
  );
}

"use client";

import React, { useMemo, useRef } from "react";
import { ArrowRight, ImagePlus, Loader2, Store } from "lucide-react";
import { getCountryAddressProfile, listCountryOptions } from "@mocter/domain/geo";
import { PhoneE164Input } from "@/components/phone-e164-input";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface StepBusinessProps {
  locale: AdminLocale;
  displayName: string;
  slug: string;
  isSlugReadOnly: boolean;
  commercialEmail: string;
  websiteUrl: string;
  phone: string;
  countryCode?: string;
  currency: string;
  timezone: string;
  logoPreviewUrl: string | null;
  uploadingLogo: boolean;
  loading: boolean;
  onDisplayNameChange: (val: string) => void;
  onSlugChange: (val: string) => void;
  onCommercialEmailChange: (val: string) => void;
  onWebsiteUrlChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onCountryCodeChange?: (val: string) => void;
  onLocaleChange: (loc: AdminLocale) => void;
  onCurrencyChange: (val: string) => void;
  onTimezoneChange: (val: string) => void;
  onLogoFileSelect: (file: File) => void;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Paso 1 del onboarding: Identidad del negocio, datos de contacto, idioma reactivo y logotipo opcional.
 */
export function StepBusiness({
  locale,
  displayName,
  slug,
  isSlugReadOnly,
  commercialEmail,
  websiteUrl,
  phone,
  countryCode = "CO",
  currency,
  timezone,
  logoPreviewUrl,
  uploadingLogo,
  loading,
  onDisplayNameChange,
  onSlugChange,
  onCommercialEmailChange,
  onWebsiteUrlChange,
  onPhoneChange,
  onCountryCodeChange,
  onLocaleChange,
  onCurrencyChange,
  onTimezoneChange,
  onLogoFileSelect,
  onSubmit,
}: StepBusinessProps) {
  const dict = getAdminDictionary(locale).onboarding;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const countryOptions = useMemo(() => listCountryOptions(locale), [locale]);

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 sm:p-6 shadow-xs space-y-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)]">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--dsn-text)]">{dict.step1Title}</h2>
          <p className="mt-1 text-xs sm:text-sm text-[var(--dsn-text-secondary)]">
            {dict.step1Subtitle}
          </p>
        </div>
      </div>

      {/* Logotipo Comercial Opcional */}
      <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          {logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreviewUrl}
              alt={displayName || dict.step1LogoLabel}
              className="h-14 w-14 rounded-xl border border-[var(--dsn-border)] bg-white object-contain p-1 shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.step1LogoLabel}</p>
            <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.step1LogoHint}</p>
          </div>
        </div>
        <div>
          <button
            type="button"
            disabled={uploadingLogo || loading}
            onClick={() => logoInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors disabled:opacity-50"
          >
            {uploadingLogo ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4 text-[var(--dsn-accent)]" />
            )}
            <span>{logoPreviewUrl ? dict.step1LogoChangeCta : dict.step1LogoSelectCta}</span>
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) onLogoFileSelect(selected);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="onb-display-name"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1DisplayNameLabel}
          </label>
          <input
            id="onb-display-name"
            type="text"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Ej. Café de Origen La Montaña"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="onb-slug"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1SlugLabel}
          </label>
          <input
            id="onb-slug"
            type="text"
            required
            readOnly={isSlugReadOnly}
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder="ej. cafe-la-montana"
            className={`w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] px-3.5 py-2.5 font-mono text-sm focus:border-[var(--dsn-accent)] focus:outline-hidden ${
              isSlugReadOnly
                ? "bg-[var(--dsn-surface-secondary)]/50 text-[var(--dsn-text-secondary)] cursor-not-allowed"
                : "bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text)]"
            }`}
          />
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.step1SlugHint}</p>
        </div>

        <div>
          <label
            htmlFor="onb-commercial-email"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1CommercialEmailLabel}
          </label>
          <input
            id="onb-commercial-email"
            type="email"
            value={commercialEmail}
            onChange={(e) => onCommercialEmailChange(e.target.value)}
            placeholder="ventas@mitienda.com"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div className="sm:col-span-2">
          <PhoneE164Input
            id="onb-phone"
            label={dict.step1PhoneLabel}
            value={phone}
            defaultCountryCode={countryCode}
            locale={locale}
            onChange={(val) => onPhoneChange(val)}
          />
        </div>

        <div>
          <label
            htmlFor="onb-country-code"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {locale === "en" ? "Operating Country" : "País de Operación"}
          </label>
          <select
            id="onb-country-code"
            value={countryCode}
            onChange={(e) => {
              const next = e.target.value;
              onCountryCodeChange?.(next);
              const prof = getCountryAddressProfile(next);
              if (prof.defaultCurrency) onCurrencyChange(prof.defaultCurrency);
              if (prof.defaultTimezone) onTimezoneChange(prof.defaultTimezone);
            }}
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            {countryOptions.map((opt) => (
              <option key={opt.countryCode} value={opt.countryCode} className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
                {opt.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="onb-website"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1WebsiteUrlLabel}
          </label>
          <input
            id="onb-website"
            type="text"
            value={websiteUrl}
            onChange={(e) => onWebsiteUrlChange(e.target.value)}
            placeholder="https://mitienda.com"
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          />
        </div>

        <div>
          <label
            htmlFor="onb-locale"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1LocaleLabel}
          </label>
          <select
            id="onb-locale"
            value={locale}
            onChange={(e) => onLocaleChange(e.target.value === "en" ? "en" : "es")}
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            <option value="es" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              Español
            </option>
            <option value="en" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              English
            </option>
          </select>
        </div>

        <div>
          <label
            htmlFor="onb-currency"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1CurrencyLabel}
          </label>
          <select
            id="onb-currency"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            <option value="COP" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              COP — Peso Colombiano
            </option>
            <option value="USD" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              USD — US Dollar
            </option>
            <option value="MXN" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              MXN — Peso Mexicano
            </option>
            <option value="ARS" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              ARS — Peso Argentino
            </option>
            <option value="CLP" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              CLP — Peso Chileno
            </option>
            <option value="PEN" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              PEN — Sol Peruano
            </option>
            <option value="EUR" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              EUR — Euro
            </option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="onb-timezone"
            className="mb-1.5 block text-sm font-semibold text-[var(--dsn-text)]"
          >
            {dict.step1TimezoneLabel}
          </label>
          <select
            id="onb-timezone"
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2.5 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-hidden"
          >
            <option value="America/Bogota" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              America/Bogota (UTC-5)
            </option>
            <option value="America/Mexico_City" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              America/Mexico_City (UTC-6)
            </option>
            <option value="America/New_York" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              America/New_York (UTC-5)
            </option>
            <option value="America/Buenos_Aires" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              America/Buenos_Aires (UTC-3)
            </option>
            <option value="Europe/Madrid" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
              Europe/Madrid (UTC+1)
            </option>
          </select>
        </div>
      </div>

      <div className="flex justify-end border-t border-[var(--dsn-border)] pt-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[46px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[var(--dsn-accent)] px-6 py-2.5 text-sm font-bold text-[var(--dsn-accent-fg)] shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{dict.savingLabel}</span>
            </>
          ) : (
            <>
              <span>{dict.step1SubmitCta}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

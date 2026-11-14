"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Globe,
  Share2,
  CreditCard,
  Upload,
  Trash2,
  Plus,
  Pencil,
  ShieldAlert,
  Lock,
  Info,
  Store,
  X,
} from "lucide-react";
import type {
  TenantPaymentChannelCode,
  TenantPaymentChannelDto,
  TenantProfileDto,
} from "@mocter/domain";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface ProfileViewProps {
  initialProfile: TenantProfileDto | null;
  initialChannels: TenantPaymentChannelDto[];
  readOnly?: boolean;
  locale?: AdminLocale;
}

interface ChannelFormState {
  id: string | null;
  channelCode: TenantPaymentChannelCode;
  displayName: string;
  accountIdentifier: string;
  accountHolderName: string;
  instructions: string;
  isActive: boolean;
  sortOrder: number;
}

const CHANNEL_LABELS_ES: Record<TenantPaymentChannelCode, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia: "Bancolombia",
  bre_b: "Bre-B (Llave Bancaria)",
  pse: "PSE",
  card_link: "Link De Pago Con Tarjeta",
  cash_on_delivery: "Pago Contra Entrega",
  efecty: "Efecty / Corresponsal",
  bank_transfer: "Transferencia Bancaria",
  other: "Otro Medio De Pago",
};

const CHANNEL_LABELS_EN: Record<TenantPaymentChannelCode, string> = {
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia: "Bancolombia",
  bre_b: "Bre-B (Bank Key)",
  pse: "PSE",
  card_link: "Card Payment Link",
  cash_on_delivery: "Cash On Delivery",
  efecty: "Efecty / Cash Agent",
  bank_transfer: "Bank Transfer",
  other: "Other Payment Method",
};

const PAYMENT_CHANNEL_CODES = Object.keys(
  CHANNEL_LABELS_ES,
) as TenantPaymentChannelCode[];

function getChannelCodeLabel(code: TenantPaymentChannelCode, locale: AdminLocale): string {
  return locale === "en" ? CHANNEL_LABELS_EN[code] : CHANNEL_LABELS_ES[code];
}

function emptyChannelForm(nextSortOrder: number): ChannelFormState {
  return {
    id: null,
    channelCode: "nequi",
    displayName: "Nequi",
    accountIdentifier: "",
    accountHolderName: "",
    instructions: "",
    isActive: true,
    sortOrder: nextSortOrder,
  };
}

/**
 * Vista de configuración del Perfil Del Negocio, identidad visual, idioma y canales de pago del comercio.
 *
 * - Diseñada Mobile First con tokens `--dsn-*`.
 * - Etiquetas de formulario estrictamente en Title Case (sin clases `uppercase`).
 * - Soporta modo solo lectura cuando el operador tiene rol `tenant_agent`.
 * - Usa `ConfirmationModal` para acciones destructivas (eliminación de logotipo y canales de pago).
 */
export function ProfileView({
  initialProfile,
  initialChannels,
  readOnly = false,
  locale: initialLocale = "es",
}: ProfileViewProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<TenantProfileDto | null>(initialProfile);
  const [channels, setChannels] = useState<TenantPaymentChannelDto[]>(initialChannels);
  const activeLocale: AdminLocale = profile?.locale ?? initialLocale;
  const dict = getAdminDictionary(activeLocale).workspace;

  // Estado editable del formulario de perfil
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? "");
  const [commercialEmail, setCommercialEmail] = useState(initialProfile?.commercialEmail ?? "");
  const [contactEmail, setContactEmail] = useState(initialProfile?.contactEmail ?? "");
  const [phone, setPhone] = useState(initialProfile?.phone ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialProfile?.websiteUrl ?? "");
  const [taxId, setTaxId] = useState(initialProfile?.taxId ?? "");
  const [industry, setIndustry] = useState(initialProfile?.industry ?? "");

  const [localeValue, setLocaleValue] = useState<"es" | "en">(initialProfile?.locale ?? "es");
  const [currency, setCurrency] = useState(initialProfile?.currency ?? "COP");
  const [timezone, setTimezone] = useState(initialProfile?.timezone ?? "America/Bogota");
  const [country, setCountry] = useState(initialProfile?.country ?? "");
  const [stateRegion, setStateRegion] = useState(initialProfile?.state ?? "");
  const [city, setCity] = useState(initialProfile?.city ?? "");
  const [addressLine, setAddressLine] = useState(initialProfile?.addressLine ?? "");
  const [postalCode, setPostalCode] = useState(initialProfile?.postalCode ?? "");

  const [instagram, setInstagram] = useState(initialProfile?.socialLinks?.instagram ?? "");
  const [facebook, setFacebook] = useState(initialProfile?.socialLinks?.facebook ?? "");
  const [tiktok, setTiktok] = useState(initialProfile?.socialLinks?.tiktok ?? "");
  const [whatsapp, setWhatsapp] = useState(initialProfile?.socialLinks?.whatsapp ?? "");
  const [youtube, setYoutube] = useState(initialProfile?.socialLinks?.youtube ?? "");

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  // Estado del logotipo
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [removeLogoModalOpen, setRemoveLogoModalOpen] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Estado de canales de pago
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<ChannelFormState>(() =>
    emptyChannelForm(initialChannels.length),
  );
  const [savingChannel, setSavingChannel] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelFeedback, setChannelFeedback] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TenantPaymentChannelDto | null>(null);
  const [deletingChannel, setDeletingChannel] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [conflictUsedChannel, setConflictUsedChannel] = useState<TenantPaymentChannelDto | null>(null);

  if (!profile) {
    return (
      <div className="w-full p-4 md:px-8 md:py-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center shadow-xs">
          <Building2 className="mb-3 h-10 w-10 text-[var(--dsn-text-secondary)]/40" />
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.profileTitle}</p>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.billingNoInfoDesc}</p>
        </div>
      </div>
    );
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    setSavingProfile(true);
    setProfileError(null);
    setProfileFeedback(null);

    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          commercialEmail: commercialEmail.trim() || null,
          contactEmail,
          phone: phone.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          taxId: taxId.trim() || null,
          industry: industry.trim() || null,
          locale: localeValue,
          currency,
          timezone,
          country: country.trim() || null,
          state: stateRegion.trim() || null,
          city: city.trim() || null,
          addressLine: addressLine.trim() || null,
          postalCode: postalCode.trim() || null,
          socialLinks: {
            instagram: instagram.trim() || undefined,
            facebook: facebook.trim() || undefined,
            tiktok: tiktok.trim() || undefined,
            whatsapp: whatsapp.trim() || undefined,
            youtube: youtube.trim() || undefined,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setProfileError(
          json.detail || json.title || "No fue posible guardar los cambios del perfil.",
        );
        return;
      }

      const updated = json.data as TenantProfileDto;
      setProfile(updated);
      setDisplayName(updated.displayName);
      setCommercialEmail(updated.commercialEmail ?? "");
      setContactEmail(updated.contactEmail);
      setLocaleValue(updated.locale);
      setProfileFeedback(dict.profileSaveSuccess);
      router.refresh();
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Error de conexión al guardar el perfil.",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (readOnly) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingLogo(true);
    setLogoError(null);
    setProfileFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/tenant/profile/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setLogoError(
          json.detail || json.title || "No fue posible subir el logotipo comercial.",
        );
        return;
      }

      const payload = json.data as { logoMediaId: string; logoResolvedUrl: string };
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              logoMediaId: payload.logoMediaId,
              logoResolvedUrl: payload.logoResolvedUrl,
            }
          : prev,
      );
      setProfileFeedback(dict.profileLogoUpdatedSuccess);
      router.refresh();
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Error de conexión al cargar el logotipo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleConfirmRemoveLogo() {
    if (readOnly) return;
    setRemovingLogo(true);
    setLogoError(null);

    try {
      const res = await fetch("/api/tenant/profile/logo", {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setLogoError(json.detail || json.title || "No fue posible retirar el logotipo.");
        return;
      }

      setProfile((prev) =>
        prev ? { ...prev, logoMediaId: null, logoResolvedUrl: null } : prev,
      );
      setRemoveLogoModalOpen(false);
      setProfileFeedback(dict.profileLogoRemovedSuccess);
      router.refresh();
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Error de conexión al retirar el logotipo.",
      );
    } finally {
      setRemovingLogo(false);
    }
  }

  function openCreateChannelModal() {
    if (readOnly) return;
    setChannelError(null);
    setChannelForm(emptyChannelForm(channels.length));
    setChannelModalOpen(true);
  }

  function openEditChannelModal(channel: TenantPaymentChannelDto) {
    if (readOnly) return;
    setChannelError(null);
    setChannelForm({
      id: channel.id,
      channelCode: channel.channelCode,
      displayName: channel.displayName,
      accountIdentifier: channel.accountIdentifier ?? "",
      accountHolderName: channel.accountHolderName ?? "",
      instructions: channel.instructions ?? "",
      isActive: channel.isActive,
      sortOrder: channel.sortOrder,
    });
    setChannelModalOpen(true);
  }

  async function handleSaveChannel(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;

    setSavingChannel(true);
    setChannelError(null);
    setChannelFeedback(null);

    const isEditing = Boolean(channelForm.id);
    const url = isEditing
      ? `/api/tenant/payment-channels/${channelForm.id}`
      : "/api/tenant/payment-channels";

    try {
      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelCode: channelForm.channelCode,
          displayName: channelForm.displayName,
          accountIdentifier: channelForm.accountIdentifier.trim() || null,
          accountHolderName: channelForm.accountHolderName.trim() || null,
          instructions: channelForm.instructions.trim() || null,
          isActive: channelForm.isActive,
          sortOrder: channelForm.sortOrder,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setChannelError(
          json.detail || json.title || "No fue posible guardar el canal de pago.",
        );
        return;
      }

      const saved = json.data as TenantPaymentChannelDto;
      setChannels((prev) => {
        if (isEditing) {
          return prev.map((c) => (c.id === saved.id ? saved : c));
        }
        return [...prev, saved].sort((a, b) => a.sortOrder - b.sortOrder);
      });
      setChannelModalOpen(false);
    } catch (err) {
      setChannelError(
        err instanceof Error ? err.message : "Error de conexión al guardar el canal.",
      );
    } finally {
      setSavingChannel(false);
    }
  }

  async function handleToggleChannelActive(channel: TenantPaymentChannelDto) {
    if (readOnly) return;
    setChannelError(null);
    setChannelFeedback(null);

    try {
      const res = await fetch(`/api/tenant/payment-channels/${channel.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !channel.isActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setChannelError(
          json.detail || json.title || "No fue posible actualizar el estado del canal.",
        );
        return;
      }
      const updated = json.data as TenantPaymentChannelDto;
      setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setConflictUsedChannel((prev) => (prev?.id === updated.id ? null : prev));
    } catch (err) {
      setChannelError(
        err instanceof Error ? err.message : "Error de conexión al cambiar estado del canal.",
      );
    }
  }

  async function handleConfirmDeleteChannel() {
    if (!deleteTarget || readOnly) return;
    setDeletingChannel(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/tenant/payment-channels/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json.code === "CHANNEL_USED_IN_ORDERS") {
        setConflictUsedChannel(deleteTarget);
        setDeleteTarget(null);
        return;
      }

      if (!res.ok || !json.ok) {
        setDeleteError(
          json.detail || json.title || "No fue posible eliminar el canal de pago.",
        );
        return;
      }

      const deletedId = deleteTarget.id;
      setChannels((prev) => prev.filter((c) => c.id !== deletedId));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Error de conexión al eliminar el canal.",
      );
    } finally {
      setDeletingChannel(false);
    }
  }

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6 animate-in fade-in duration-300">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dsn-accent)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[var(--dsn-accent)]">
            <Building2 className="h-3.5 w-3.5" />
            <span>{dict.profileBadge}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.profileTitle}
          </h1>
          <p className="text-sm text-[var(--dsn-text-secondary)]">{dict.profileSubtitle}</p>
        </div>
      </header>

      {/* Banner de solo lectura para tenant_agent */}
      {readOnly && (
        <div
          data-testid="profile-readonly-banner"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-medium">{dict.profileReadOnlyNotice}</p>
        </div>
      )}

      {/* Alertas globales */}
      {profileFeedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{profileFeedback}</span>
        </div>
      )}

      {profileError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{profileError}</span>
        </div>
      )}

      {/* Formulario principal de Perfil, Localización y Redes */}
      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Sección 1: Identidad Visual Y Datos Generales */}
        <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-5">
          <div className="border-b border-[var(--dsn-border)] pb-3">
            <h2 className="text-base font-bold text-[var(--dsn-text)]">
              {dict.profileSectionIdentityTitle}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
              {dict.profileSectionIdentitySubtitle}
            </p>
          </div>

          {/* Logotipo Comercial */}
          <div className="flex flex-col gap-4 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {profile.logoResolvedUrl ? (
                <img
                  src={profile.logoResolvedUrl}
                  alt={profile.displayName}
                  className="h-16 w-16 rounded-xl border border-[var(--dsn-border)] object-cover bg-[var(--dsn-surface)] shrink-0"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]">
                  <Store className="h-7 w-7" />
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[var(--dsn-text)]">
                  {dict.profileLogoLabel}
                </p>
                <p className="text-[11px] text-[var(--dsn-text-secondary)] max-w-md">
                  {dict.profileLogoHint}
                </p>
                {logoError && (
                  <p className="text-[11px] font-medium text-rose-500">{logoError}</p>
                )}
              </div>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploadingLogo ? dict.profileLogoUploading : dict.profileLogoUploadCta}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadingLogo}
                    onChange={handleLogoUpload}
                    className="sr-only"
                    aria-label={dict.profileLogoUploadCta}
                  />
                </label>

                {profile.logoMediaId && (
                  <button
                    type="button"
                    disabled={removingLogo || uploadingLogo}
                    onClick={() => setRemoveLogoModalOpen(true)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--dsn-error)]/30 bg-[var(--dsn-error)]/10 px-3 py-2 text-xs font-semibold text-[var(--dsn-error)] hover:bg-[var(--dsn-error)]/20 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{dict.profileLogoRemoveCta}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="profile-display-name"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileDisplayNameLabel}
              </label>
              <input
                id="profile-display-name"
                type="text"
                required
                disabled={readOnly}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-slug"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileSlugLabel}
              </label>
              <div className="flex items-center rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-sm text-[var(--dsn-text-secondary)]">
                <span className="font-mono text-xs select-all">mocter.co/{profile.slug}</span>
                <input
                  id="profile-slug"
                  type="text"
                  readOnly
                  disabled
                  value={profile.slug}
                  className="sr-only"
                  aria-readonly="true"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                {dict.profileSlugHelp}
              </p>
            </div>

            <div>
              <label
                htmlFor="profile-commercial-email"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileCommercialEmailLabel}
              </label>
              <input
                id="profile-commercial-email"
                type="email"
                disabled={readOnly}
                value={commercialEmail}
                onChange={(e) => setCommercialEmail(e.target.value)}
                placeholder="ventas@tutienda.com"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-contact-email"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileContactEmailLabel}
              </label>
              <input
                id="profile-contact-email"
                type="email"
                required
                disabled={readOnly}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-phone"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profilePhoneLabel}
              </label>
              <input
                id="profile-phone"
                type="text"
                disabled={readOnly}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+57 300 000 0000"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-website"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileWebsiteLabel}
              </label>
              <input
                id="profile-website"
                type="url"
                disabled={readOnly}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://tutienda.com"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-tax-id"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileTaxIdLabel}
              </label>
              <input
                id="profile-tax-id"
                type="text"
                disabled={readOnly}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="900123456-1"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-industry"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileIndustryLabel}
              </label>
              <input
                id="profile-industry"
                type="text"
                disabled={readOnly}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>
        </section>

        {/* Sección 2: Localización E Idioma */}
        <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-5">
          <div className="flex items-start gap-2.5 border-b border-[var(--dsn-border)] pb-3">
            <Globe className="mt-0.5 h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.profileSectionLocaleTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                {dict.profileSectionLocaleSubtitle}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="profile-locale"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileLocaleLabel}
              </label>
              <select
                id="profile-locale"
                disabled={readOnly}
                value={localeValue}
                onChange={(e) => setLocaleValue(e.target.value === "en" ? "en" : "es")}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              >
                <option value="es" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
                  {dict.profileLocaleEs}
                </option>
                <option value="en" className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]">
                  {dict.profileLocaleEn}
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="profile-currency"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileCurrencyLabel}
              </label>
              <select
                id="profile-currency"
                disabled={readOnly}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
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
              </select>
            </div>

            <div>
              <label
                htmlFor="profile-timezone"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileTimezoneLabel}
              </label>
              <input
                id="profile-timezone"
                type="text"
                disabled={readOnly}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-country"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileCountryLabel}
              </label>
              <input
                id="profile-country"
                type="text"
                disabled={readOnly}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="CO"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-state"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileStateLabel}
              </label>
              <input
                id="profile-state"
                type="text"
                disabled={readOnly}
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-city"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileCityLabel}
              </label>
              <input
                id="profile-city"
                type="text"
                disabled={readOnly}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="profile-address"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileAddressLabel}
              </label>
              <input
                id="profile-address"
                type="text"
                disabled={readOnly}
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-postal-code"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profilePostalCodeLabel}
              </label>
              <input
                id="profile-postal-code"
                type="text"
                disabled={readOnly}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>
        </section>

        {/* Sección 3: Redes Sociales */}
        <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-5">
          <div className="flex items-start gap-2.5 border-b border-[var(--dsn-border)] pb-3">
            <Share2 className="mt-0.5 h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.profileSectionSocialTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                {dict.profileSectionSocialSubtitle}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="profile-instagram"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileInstagramLabel}
              </label>
              <input
                id="profile-instagram"
                type="text"
                disabled={readOnly}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="https://instagram.com/tucomercio"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-facebook"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileFacebookLabel}
              </label>
              <input
                id="profile-facebook"
                type="text"
                disabled={readOnly}
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/tucomercio"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-tiktok"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileTiktokLabel}
              </label>
              <input
                id="profile-tiktok"
                type="text"
                disabled={readOnly}
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="https://tiktok.com/@tucomercio"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-whatsapp"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileWhatsappLabel}
              </label>
              <input
                id="profile-whatsapp"
                type="text"
                disabled={readOnly}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+57 300 000 0000"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="profile-youtube"
                className="block text-xs font-semibold text-[var(--dsn-text)] mb-1.5"
              >
                {dict.profileYoutubeLabel}
              </label>
              <input
                id="profile-youtube"
                type="text"
                disabled={readOnly}
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="https://youtube.com/@tucomercio"
                className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          {!readOnly && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-[var(--dsn-accent-fg)] shadow-xs transition-colors hover:bg-[var(--dsn-accent-hover)] disabled:opacity-50 cursor-pointer"
              >
                {savingProfile ? dict.profileSaving : dict.profileSaveChanges}
              </button>
            </div>
          )}
        </section>
      </form>

      {/* Sección 4: Canales De Pago Del Comercio */}
      <section className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-xs space-y-5">
        <div className="flex flex-col gap-3 border-b border-[var(--dsn-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <CreditCard className="mt-0.5 h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.profileSectionPaymentsTitle}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                {dict.profileSectionPaymentsSubtitle}
              </p>
            </div>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={openCreateChannelModal}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-[var(--dsn-accent-fg)] shadow-xs transition-colors hover:bg-[var(--dsn-accent-hover)] cursor-pointer self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{dict.profilePaymentsAddCta}</span>
            </button>
          )}
        </div>

        {/* Aviso informativo y de seguridad */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3.5 py-2.5 text-xs text-[var(--dsn-text-secondary)]">
            <Info className="mt-0.5 h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <p>{dict.profilePaymentsDisclaimer}</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{dict.profilePaymentsSecurityWarning}</p>
          </div>
        </div>

        {channelError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{channelError}</span>
          </div>
        )}

        {channelFeedback && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{channelFeedback}</span>
          </div>
        )}

        {/* Banner por conflicto 409 de canal utilizado en pedidos históricos */}
        {conflictUsedChannel && (
          <div
            data-testid="channel-used-conflict-banner"
            className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">{conflictUsedChannel.displayName}</p>
                <p>{dict.profilePaymentsUsedConflictNotice}</p>
              </div>
            </div>
            {!readOnly && conflictUsedChannel.isActive && (
              <button
                type="button"
                onClick={() => handleToggleChannelActive(conflictUsedChannel)}
                className="shrink-0 rounded-lg bg-[var(--dsn-warning)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-accent-fg)] hover:opacity-90 transition-opacity cursor-pointer"
              >
                {dict.profilePaymentsDeactivateCta}
              </button>
            )}
          </div>
        )}

        {/* Lista / Tabla de canales */}
        {channels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--dsn-border)] p-8 text-center">
            <CreditCard className="mx-auto mb-2.5 h-8 w-8 text-[var(--dsn-text-secondary)]/40" />
            <p className="text-sm font-semibold text-[var(--dsn-text)]">
              {dict.profilePaymentsEmptyTitle}
            </p>
            <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] max-w-md mx-auto">
              {dict.profilePaymentsEmptyDesc}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <article
                key={channel.id}
                data-testid={`payment-channel-row-${channel.id}`}
                className="flex flex-col gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-background)]/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[var(--dsn-text)]">
                      {channel.displayName}
                    </span>
                    <span className="rounded-full bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--dsn-text-secondary)]">
                      {getChannelCodeLabel(channel.channelCode, activeLocale)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        channel.isActive
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-500/15 text-[var(--dsn-text-secondary)]"
                      }`}
                    >
                      {channel.isActive
                        ? dict.profilePaymentsActiveLabel
                        : dict.profilePaymentsInactiveLabel}
                    </span>
                  </div>

                  {(channel.accountIdentifier || channel.accountHolderName) && (
                    <p className="text-xs text-[var(--dsn-text-secondary)] font-mono">
                      {[channel.accountIdentifier, channel.accountHolderName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                  {channel.instructions && (
                    <p className="text-xs text-[var(--dsn-text-secondary)]">
                      {channel.instructions}
                    </p>
                  )}
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={channel.isActive}
                      aria-label={`${channel.displayName} ${channel.isActive ? dict.profilePaymentsActiveLabel : dict.profilePaymentsInactiveLabel}`}
                      onClick={() => handleToggleChannelActive(channel)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        channel.isActive
                          ? "border-[var(--dsn-success)]/30 bg-[var(--dsn-success)]/10 text-[var(--dsn-success)]"
                          : "border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                      }`}
                    >
                      {channel.isActive
                        ? dict.profilePaymentsActiveLabel
                        : dict.profilePaymentsInactiveLabel}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditChannelModal(channel)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-text)] hover:border-[var(--dsn-accent)] cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>{dict.profilePaymentsEditCta}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(channel);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-error)]/30 bg-[var(--dsn-error)]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--dsn-error)] hover:bg-[var(--dsn-error)]/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{dict.profilePaymentsDeleteCta}</span>
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal de creación / edición de canal de pago */}
      {channelModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] pb-3">
              <h3
                id="channel-modal-title"
                className="text-base font-bold text-[var(--dsn-text)]"
              >
                {channelForm.id
                  ? dict.profilePaymentsModalEditTitle
                  : dict.profilePaymentsModalCreateTitle}
              </h3>
              <button
                type="button"
                onClick={() => setChannelModalOpen(false)}
                aria-label={dict.profilePaymentsCancelCta}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {channelError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300"
              >
                {channelError}
              </div>
            )}

            <form onSubmit={handleSaveChannel} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="channel-code"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    {dict.profilePaymentsFieldCodeLabel}
                  </label>
                  <select
                    id="channel-code"
                    value={channelForm.channelCode}
                    onChange={(e) => {
                      const nextCode = e.target.value as TenantPaymentChannelCode;
                      setChannelForm((prev) => {
                        const prevDefault = getChannelCodeLabel(prev.channelCode, activeLocale);
                        const shouldSyncDisplayName =
                          !prev.id &&
                          (prev.displayName.trim() === "" ||
                            prev.displayName === prevDefault);
                        return {
                          ...prev,
                          channelCode: nextCode,
                          displayName: shouldSyncDisplayName
                            ? getChannelCodeLabel(nextCode, activeLocale)
                            : prev.displayName,
                        };
                      });
                    }}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-sm text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
                  >
                    {PAYMENT_CHANNEL_CODES.map((code) => (
                      <option
                        key={code}
                        value={code}
                        className="bg-[var(--dsn-surface)] text-[var(--dsn-text)]"
                      >
                        {getChannelCodeLabel(code, activeLocale)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="channel-display-name"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    {dict.profilePaymentsFieldNameLabel}
                  </label>
                  <input
                    id="channel-display-name"
                    type="text"
                    required
                    value={channelForm.displayName}
                    onChange={(e) =>
                      setChannelForm((prev) => ({ ...prev, displayName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="channel-identifier"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    {dict.profilePaymentsFieldIdentifierLabel}
                  </label>
                  <input
                    id="channel-identifier"
                    type="text"
                    value={channelForm.accountIdentifier}
                    onChange={(e) =>
                      setChannelForm((prev) => ({
                        ...prev,
                        accountIdentifier: e.target.value,
                      }))
                    }
                    placeholder="300 000 0000"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="channel-holder"
                    className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                  >
                    {dict.profilePaymentsFieldHolderLabel}
                  </label>
                  <input
                    id="channel-holder"
                    type="text"
                    value={channelForm.accountHolderName}
                    onChange={(e) =>
                      setChannelForm((prev) => ({
                        ...prev,
                        accountHolderName: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="channel-instructions"
                  className="block text-xs font-semibold text-[var(--dsn-text)] mb-1"
                >
                  {dict.profilePaymentsFieldInstructionsLabel}
                </label>
                <textarea
                  id="channel-instructions"
                  rows={3}
                  value={channelForm.instructions}
                  onChange={(e) =>
                    setChannelForm((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-background)] px-3 py-2 text-sm text-[var(--dsn-text)]"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelForm.isActive}
                  onChange={(e) =>
                    setChannelForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[var(--dsn-border)]"
                />
                <span>{dict.profilePaymentsFieldActiveLabel}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChannelModalOpen(false)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)] transition-colors cursor-pointer"
                >
                  {dict.profilePaymentsCancelCta}
                </button>
                <button
                  type="submit"
                  disabled={savingChannel}
                  className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-[var(--dsn-accent-fg)] shadow-xs transition-colors hover:bg-[var(--dsn-accent-hover)] cursor-pointer disabled:opacity-50"
                >
                  {savingChannel ? dict.profileSaving : dict.profilePaymentsSaveCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación para retirar logotipo comercial */}
      <ConfirmationModal
        isOpen={removeLogoModalOpen}
        onClose={() => setRemoveLogoModalOpen(false)}
        onConfirm={handleConfirmRemoveLogo}
        title={dict.profileLogoRemoveTitle}
        subtitle={dict.profileLogoRemoveSubtitle}
        variant="warning"
        details={[
          { label: dict.profileDisplayNameLabel, value: profile.displayName },
          { label: dict.profileSlugLabel, value: `mocter.co/${profile.slug}`, mono: true },
        ]}
        warningMessage={dict.profileLogoRemoveWarning}
        confirmText={dict.profileLogoRemoveCta}
        cancelText={dict.profilePaymentsCancelCta}
        loading={removingLogo}
        error={logoError}
      />

      {/* Modal de confirmación para eliminar canal de pago */}
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteChannel}
        title={dict.profilePaymentsDeleteTitle}
        subtitle={dict.profilePaymentsDeleteSubtitle}
        variant="danger"
        details={
          deleteTarget
            ? [
                { label: dict.profilePaymentsFieldNameLabel, value: deleteTarget.displayName },
                {
                  label: dict.profilePaymentsFieldCodeLabel,
                  value: getChannelCodeLabel(deleteTarget.channelCode, activeLocale),
                },
                ...(deleteTarget.accountIdentifier
                  ? [
                      {
                        label: dict.profilePaymentsFieldIdentifierLabel,
                        value: deleteTarget.accountIdentifier,
                        mono: true,
                      },
                    ]
                  : []),
              ]
            : undefined
        }
        warningMessage={dict.profilePaymentsDeleteWarning}
        confirmText={dict.profilePaymentsDeleteCta}
        cancelText={dict.profilePaymentsCancelCta}
        loading={deletingChannel}
        error={deleteError}
      />
    </div>
  );
}

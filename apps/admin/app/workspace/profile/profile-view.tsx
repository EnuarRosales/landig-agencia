"use client";

import React, { useMemo, useState } from "react";
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
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { FormSaveBar } from "@/components/ui/form-save-bar";
import { GeoAddressFields } from "@/components/geo-address-fields";
import { PhoneE164Input } from "@/components/phone-e164-input";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

export interface ProfileViewProps {
  initialProfile: TenantProfileDto | null;
  initialChannels: TenantPaymentChannelDto[];
  readOnly?: boolean;
  locale?: AdminLocale;
}

interface ProfileFormSnapshot {
  displayName: string;
  commercialEmail: string;
  contactEmail: string;
  phone: string;
  websiteUrl: string;
  taxId: string;
  industry: string;
  localeValue: "es" | "en";
  currency: string;
  timezone: string;
  countryCode: string;
  country: string;
  subdivisionCode: string;
  stateRegion: string;
  city: string;
  addressLine: string;
  addressComplement: string;
  postalCode: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  whatsapp: string;
  youtube: string;
}

function serializeProfileSections(s: ProfileFormSnapshot) {
  return {
    business: JSON.stringify({
      displayName: s.displayName,
      commercialEmail: s.commercialEmail,
      contactEmail: s.contactEmail,
      phone: s.phone,
      websiteUrl: s.websiteUrl,
      taxId: s.taxId,
      industry: s.industry,
    }),
    location: JSON.stringify({
      localeValue: s.localeValue,
      currency: s.currency,
      timezone: s.timezone,
      countryCode: s.countryCode,
      country: s.country,
      subdivisionCode: s.subdivisionCode,
      stateRegion: s.stateRegion,
      city: s.city,
      addressLine: s.addressLine,
      addressComplement: s.addressComplement,
      postalCode: s.postalCode,
    }),
    social: JSON.stringify({
      instagram: s.instagram,
      facebook: s.facebook,
      tiktok: s.tiktok,
      whatsapp: s.whatsapp,
      youtube: s.youtube,
    }),
  };
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
  card_link: "Link de Pago con Tarjeta",
  cash_on_delivery: "Pago contra Entrega",
  efecty: "Efecty / Corresponsal",
  bank_transfer: "Transferencia Bancaria",
  other: "Otro Medio de Pago",
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
  const [countryCode, setCountryCode] = useState(initialProfile?.countryCode ?? "CO");
  const [country, setCountry] = useState(initialProfile?.country ?? "");
  const [subdivisionCode, setSubdivisionCode] = useState(initialProfile?.subdivisionCode ?? "");
  const [stateRegion, setStateRegion] = useState(initialProfile?.state ?? "");
  const [city, setCity] = useState(initialProfile?.city ?? "");
  const [addressLine, setAddressLine] = useState(initialProfile?.addressLine ?? "");
  const [addressComplement, setAddressComplement] = useState(
    initialProfile?.addressComplement ?? "",
  );
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

  const currentSnapshot = useMemo<ProfileFormSnapshot>(
    () => ({
      displayName,
      commercialEmail,
      contactEmail,
      phone,
      websiteUrl,
      taxId,
      industry,
      localeValue,
      currency,
      timezone,
      countryCode,
      country,
      subdivisionCode,
      stateRegion,
      city,
      addressLine,
      addressComplement,
      postalCode,
      instagram,
      facebook,
      tiktok,
      whatsapp,
      youtube,
    }),
    [
      displayName,
      commercialEmail,
      contactEmail,
      phone,
      websiteUrl,
      taxId,
      industry,
      localeValue,
      currency,
      timezone,
      countryCode,
      country,
      subdivisionCode,
      stateRegion,
      city,
      addressLine,
      addressComplement,
      postalCode,
      instagram,
      facebook,
      tiktok,
      whatsapp,
      youtube,
    ],
  );

  const [savedSnapshot, setSavedSnapshot] = useState<ProfileFormSnapshot>(() => currentSnapshot);

  const currentSections = useMemo(
    () => serializeProfileSections(currentSnapshot),
    [currentSnapshot],
  );
  const savedSections = useMemo(
    () => serializeProfileSections(savedSnapshot),
    [savedSnapshot],
  );

  const dirtySectionsCount =
    (currentSections.business !== savedSections.business ? 1 : 0) +
    (currentSections.location !== savedSections.location ? 1 : 0) +
    (currentSections.social !== savedSections.social ? 1 : 0);
  const isDirty = !readOnly && Boolean(profile) && dirtySectionsCount > 0;

  function handleDiscardProfileChanges() {
    setDisplayName(savedSnapshot.displayName);
    setCommercialEmail(savedSnapshot.commercialEmail);
    setContactEmail(savedSnapshot.contactEmail);
    setPhone(savedSnapshot.phone);
    setWebsiteUrl(savedSnapshot.websiteUrl);
    setTaxId(savedSnapshot.taxId);
    setIndustry(savedSnapshot.industry);
    setLocaleValue(savedSnapshot.localeValue);
    setCurrency(savedSnapshot.currency);
    setTimezone(savedSnapshot.timezone);
    setCountryCode(savedSnapshot.countryCode);
    setCountry(savedSnapshot.country);
    setSubdivisionCode(savedSnapshot.subdivisionCode);
    setStateRegion(savedSnapshot.stateRegion);
    setCity(savedSnapshot.city);
    setAddressLine(savedSnapshot.addressLine);
    setAddressComplement(savedSnapshot.addressComplement);
    setPostalCode(savedSnapshot.postalCode);
    setInstagram(savedSnapshot.instagram);
    setFacebook(savedSnapshot.facebook);
    setTiktok(savedSnapshot.tiktok);
    setWhatsapp(savedSnapshot.whatsapp);
    setYoutube(savedSnapshot.youtube);
    setProfileError(null);
    setProfileFeedback(null);
  }

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

  async function handleSaveProfile(e?: React.FormEvent) {
    e?.preventDefault();
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
          countryCode: countryCode.trim() || null,
          country: country.trim() || null,
          subdivisionCode: subdivisionCode.trim() || null,
          state: stateRegion.trim() || null,
          city: city.trim() || null,
          addressLine: addressLine.trim() || null,
          addressComplement: addressComplement.trim() || null,
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
      setSavedSnapshot({
        ...currentSnapshot,
        displayName: updated.displayName,
        commercialEmail: updated.commercialEmail ?? "",
        contactEmail: updated.contactEmail,
        localeValue: updated.locale,
      });
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
          <Badge variant="accent" className="gap-1.5 text-[11px] font-medium">
            <Building2 className="h-3.5 w-3.5" />
            <span>{dict.profileBadge}</span>
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--dsn-text)]">
            {dict.profileTitle}
          </h1>
          <p className="text-sm text-[var(--dsn-text-secondary)]">{dict.profileSubtitle}</p>
        </div>

        {!readOnly && (
          <Button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={savingProfile}
            loading={savingProfile}
            loadingText={dict.profileSaving}
            className="shrink-0"
          >
            {dict.profileSaveChanges}
          </Button>
        )}
      </header>

      {/* Banner de solo lectura para tenant_agent */}
      {readOnly && (
        <Alert data-testid="profile-readonly-banner" variant="warning">
          <Lock className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{dict.profileReadOnlyNotice}</AlertDescription>
        </Alert>
      )}

      {/* Alertas globales */}
      {profileFeedback && (
        <Alert role="status" variant="success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{profileFeedback}</AlertDescription>
        </Alert>
      )}

      {profileError && (
        <Alert role="alert" variant="error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{profileError}</AlertDescription>
        </Alert>
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
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={removingLogo || uploadingLogo}
                    onClick={() => setRemoveLogoModalOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{dict.profileLogoRemoveCta}</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="profile-display-name" className="mb-1.5 block text-xs font-semibold">
                {dict.profileDisplayNameLabel}
              </Label>
              <Input
                id="profile-display-name"
                type="text"
                required
                disabled={readOnly}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="profile-slug" className="mb-1.5 block text-xs font-semibold">
                {dict.profileSlugLabel}
              </Label>
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
              <Label
                htmlFor="profile-commercial-email"
                className="mb-1.5 block text-xs font-semibold"
              >
                {dict.profileCommercialEmailLabel}
              </Label>
              <Input
                id="profile-commercial-email"
                type="email"
                disabled={readOnly}
                value={commercialEmail}
                onChange={(e) => setCommercialEmail(e.target.value)}
                placeholder="ventas@tutienda.com"
              />
            </div>

            <div>
              <Label htmlFor="profile-contact-email" className="mb-1.5 block text-xs font-semibold">
                {dict.profileContactEmailLabel}
              </Label>
              <Input
                id="profile-contact-email"
                type="email"
                required
                disabled={readOnly}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            <div>
              <PhoneE164Input
                id="profile-phone"
                label={dict.profilePhoneLabel}
                value={phone}
                defaultCountryCode={countryCode}
                disabled={readOnly}
                locale={activeLocale}
                onChange={(nextVal) => setPhone(nextVal)}
              />
            </div>

            <div>
              <Label htmlFor="profile-website" className="mb-1.5 block text-xs font-semibold">
                {dict.profileWebsiteLabel}
              </Label>
              <Input
                id="profile-website"
                type="url"
                disabled={readOnly}
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://tutienda.com"
              />
            </div>

            <div>
              <Label htmlFor="profile-tax-id" className="mb-1.5 block text-xs font-semibold">
                {dict.profileTaxIdLabel}
              </Label>
              <Input
                id="profile-tax-id"
                type="text"
                disabled={readOnly}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="900123456-1"
              />
            </div>

            <div>
              <Label htmlFor="profile-industry" className="mb-1.5 block text-xs font-semibold">
                {dict.profileIndustryLabel}
              </Label>
              <Input
                id="profile-industry"
                type="text"
                disabled={readOnly}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
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
              <Label htmlFor="profile-locale" className="mb-1.5 block text-xs font-semibold">
                {dict.profileLocaleLabel}
              </Label>
              <Select
                id="profile-locale"
                disabled={readOnly}
                value={localeValue}
                onChange={(e) => setLocaleValue(e.target.value === "en" ? "en" : "es")}
              >
                <option value="es">{dict.profileLocaleEs}</option>
                <option value="en">{dict.profileLocaleEn}</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="profile-currency" className="mb-1.5 block text-xs font-semibold">
                {dict.profileCurrencyLabel}
              </Label>
              <Select
                id="profile-currency"
                disabled={readOnly}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="COP">COP — Peso Colombiano</option>
                <option value="USD">USD — US Dollar</option>
                <option value="MXN">MXN — Peso Mexicano</option>
                <option value="ARS">ARS — Peso Argentino</option>
                <option value="CLP">CLP — Peso Chileno</option>
                <option value="PEN">PEN — Sol Peruano</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="profile-timezone" className="mb-1.5 block text-xs font-semibold">
                {dict.profileTimezoneLabel}
              </Label>
              <Input
                id="profile-timezone"
                type="text"
                disabled={readOnly}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>

          <GeoAddressFields
            idPrefix="profile"
            locale={activeLocale}
            disabled={readOnly}
            showNeighborhood={false}
            showAddressLine
            showComplement
            showPostalCode
            values={{
              countryCode,
              country,
              subdivisionCode,
              state: stateRegion,
              city,
              addressLine,
              addressComplement,
              postalCode,
            }}
            onChange={(patch) => {
              if (patch.countryCode !== undefined) setCountryCode(patch.countryCode);
              if (patch.country !== undefined) setCountry(patch.country);
              if (patch.subdivisionCode !== undefined) setSubdivisionCode(patch.subdivisionCode);
              if (patch.state !== undefined) setStateRegion(patch.state);
              if (patch.city !== undefined) setCity(patch.city);
              if (patch.addressLine !== undefined) setAddressLine(patch.addressLine);
              if (patch.addressComplement !== undefined)
                setAddressComplement(patch.addressComplement);
              if (patch.postalCode !== undefined) setPostalCode(patch.postalCode);
            }}
          />
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

        {!readOnly && (
          <FormSaveBar
            isDirty={isDirty}
            dirtySectionsCount={dirtySectionsCount}
            sectionName={dict.profileTitle}
            onSave={() => void handleSaveProfile()}
            onDiscard={handleDiscardProfileChanges}
            locale={activeLocale}
            saving={savingProfile}
            submitType="button"
          />
        )}
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
            <Button
              type="button"
              onClick={openCreateChannelModal}
              className="self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{dict.profilePaymentsAddCta}</span>
            </Button>
          )}
        </div>

        {/* Aviso informativo y de seguridad */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3.5 py-2.5 text-xs text-[var(--dsn-text-secondary)]">
            <Info className="mt-0.5 h-4 w-4 text-[var(--dsn-accent)] shrink-0" />
            <p>{dict.profilePaymentsDisclaimer}</p>
          </div>
          <Alert variant="warning" className="px-3.5 py-2.5 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <AlertDescription>{dict.profilePaymentsSecurityWarning}</AlertDescription>
          </Alert>
        </div>

        {channelError && (
          <Alert role="alert" variant="error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <AlertDescription className="font-medium">{channelError}</AlertDescription>
          </Alert>
        )}

        {channelFeedback && (
          <Alert role="status" variant="success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <AlertDescription className="font-medium">{channelFeedback}</AlertDescription>
          </Alert>
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
              <Button
                type="button"
                variant="warning"
                size="sm"
                onClick={() => handleToggleChannelActive(conflictUsedChannel)}
                className="shrink-0"
              >
                {dict.profilePaymentsDeactivateCta}
              </Button>
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
      <Dialog
        open={channelModalOpen}
        onOpenChange={(open) => {
          if (!open && !savingChannel) setChannelModalOpen(false);
        }}
      >
        <DialogContent
          className="w-full max-w-lg rounded-2xl p-5"
          closeAriaLabel={dict.profilePaymentsCancelCta}
          aria-labelledby="channel-modal-title"
          disableEscapeKeyDown={savingChannel}
          disableInteractOutside={savingChannel}
        >
          <DialogHeader className="border-b border-[var(--dsn-border)] pb-3 pr-8">
            <DialogTitle id="channel-modal-title" className="text-base font-bold text-[var(--dsn-text)]">
              {channelForm.id
                ? dict.profilePaymentsModalEditTitle
                : dict.profilePaymentsModalCreateTitle}
            </DialogTitle>
          </DialogHeader>

          {channelError && (
            <Alert role="alert" variant="error">
              <AlertDescription>{channelError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSaveChannel} className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="channel-code" className="mb-1 block text-xs font-semibold">
                  {dict.profilePaymentsFieldCodeLabel}
                </Label>
                <Select
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
                >
                  {PAYMENT_CHANNEL_CODES.map((code) => (
                    <option key={code} value={code}>
                      {getChannelCodeLabel(code, activeLocale)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="channel-display-name" className="mb-1 block text-xs font-semibold">
                  {dict.profilePaymentsFieldNameLabel}
                </Label>
                <Input
                  id="channel-display-name"
                  type="text"
                  required
                  value={channelForm.displayName}
                  onChange={(e) =>
                    setChannelForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="channel-identifier" className="mb-1 block text-xs font-semibold">
                  {dict.profilePaymentsFieldIdentifierLabel}
                </Label>
                <Input
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
                />
              </div>

              <div>
                <Label htmlFor="channel-holder" className="mb-1 block text-xs font-semibold">
                  {dict.profilePaymentsFieldHolderLabel}
                </Label>
                <Input
                  id="channel-holder"
                  type="text"
                  value={channelForm.accountHolderName}
                  onChange={(e) =>
                    setChannelForm((prev) => ({
                      ...prev,
                      accountHolderName: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="channel-instructions" className="mb-1 block text-xs font-semibold">
                {dict.profilePaymentsFieldInstructionsLabel}
              </Label>
              <Textarea
                id="channel-instructions"
                rows={3}
                value={channelForm.instructions}
                onChange={(e) =>
                  setChannelForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
              <Checkbox
                checked={channelForm.isActive}
                onCheckedChange={(checked) =>
                  setChannelForm((prev) => ({ ...prev, isActive: checked === true }))
                }
              />
              <span>{dict.profilePaymentsFieldActiveLabel}</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setChannelModalOpen(false)}
              >
                {dict.profilePaymentsCancelCta}
              </Button>
              <Button
                type="submit"
                disabled={savingChannel}
                loading={savingChannel}
                loadingText={dict.profileSaving}
              >
                {dict.profilePaymentsSaveCta}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

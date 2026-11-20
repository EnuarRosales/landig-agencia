"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  User,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { GeoAddressFields } from "@/components/geo-address-fields";
import { PhoneE164Input } from "@/components/phone-e164-input";
import {
  CRM_CHANNELS,
  CRM_CONSENT_CHANNELS,
  CRM_DOCUMENT_TYPES,
  CRM_STAGES,
  computeClientWhatsappWindow,
  formatChannelLabel,
  formatClientWhatsappRemaining,
  formatCurrencyCents,
  formatShortDateTime,
  formatSourceLabel,
  formatStageLabel,
  type ContactAddressView,
  type CrmContactDetailView,
  type CrmContactListItemView,
} from "./contacts-helpers";

type DetailTab = "general" | "addresses" | "ratings" | "attention";

interface ContactDetailModalProps {
  contactId: string | null;
  isOpen: boolean;
  locale: AdminLocale;
  onClose: () => void;
  onContactUpdated: (updated: CrmContactListItemView) => void;
}

/**
 * Modal integral de 4 pestañas para editar datos, libreta de direcciones, calificaciones y consentimientos (`AGENTS.md §4.19`).
 */
export function ContactDetailModal({
  contactId,
  isOpen,
  locale,
  onClose,
  onContactUpdated,
}: ContactDetailModalProps) {
  const dict = getAdminDictionary(locale);
  const w = dict.workspace;

  const [activeTab, setActiveTab] = useState<DetailTab>("general");
  const [detail, setDetail] = useState<CrmContactDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Tab 1 · Datos Generales
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phoneMobile, setPhoneMobile] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [phoneLandline, setPhoneLandline] = useState("");
  const [email, setEmail] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [preferredChannel, setPreferredChannel] = useState("");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Tab 2 · Direcciones
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState("Casa");
  const [addrCountryCode, setAddrCountryCode] = useState("CO");
  const [addrCountry, setAddrCountry] = useState("Colombia");
  const [addrSubdivisionCode, setAddrSubdivisionCode] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrLine, setAddrLine] = useState("");
  const [addrNeighborhood, setAddrNeighborhood] = useState("");
  const [addrComplement, setAddrComplement] = useState("");
  const [addrPostalCode, setAddrPostalCode] = useState("");
  const [addrNotes, setAddrNotes] = useState("");
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<ContactAddressView | null>(null);
  const [deletingAddress, setDeletingAddress] = useState(false);

  // Tab 3 · Calificación
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState("");
  const [savingRating, setSavingRating] = useState(false);

  // Tab 4 · Etapa & Consentimientos
  const [nextStage, setNextStage] = useState<string>("new");
  const [stageNotes, setStageNotes] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [consentPurpose, setConsentPurpose] = useState<"data_treatment" | "commercial_comms">(
    "data_treatment",
  );
  const [consentChannel, setConsentChannel] = useState<string>("manual");
  const [consentEvidenceRef, setConsentEvidenceRef] = useState("");
  const [savingConsent, setSavingConsent] = useState(false);

  const syncFormFromDetail = useCallback((data: CrmContactDetailView) => {
    setDetail(data);
    setFullName(data.fullName || "");
    setCompanyName(data.companyName || "");
    setPhoneMobile(data.phoneMobile || "");
    setPhoneSecondary(data.phoneSecondary || "");
    setPhoneLandline(data.phoneLandline || "");
    setEmail(data.email || "");
    setDocumentType(data.documentType || "");
    setDocumentNumber(data.documentNumber || "");
    setBirthDate(data.birthDate || "");
    setPreferredChannel(data.preferredChannel || "");
    setLanguage(data.language === "en" ? "en" : "es");
    setTagsText((data.tags ?? []).join(", "));
    setNotes(data.notes || "");
    setRatingStars(data.currentRatingStars ?? 5);
    setNextStage(data.stage || "new");
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setBannerError(null);
      const res = await workspaceFetch<CrmContactDetailView>(
        `/api/tenant/contacts/${encodeURIComponent(id)}`,
        { method: "GET" },
      );
      setLoading(false);
      if (!res.ok || !res.data) {
        setBannerError(res.error || "No pudimos cargar la ficha del contacto.");
        return;
      }
      syncFormFromDetail(res.data);
    },
    [syncFormFromDetail],
  );

  useEffect(() => {
    if (!isOpen || !contactId) return;
    let cancelled = false;

    void (async () => {
      const res = await workspaceFetch<CrmContactDetailView>(
        `/api/tenant/contacts/${encodeURIComponent(contactId)}`,
        { method: "GET" },
      );
      if (cancelled) return;
      if (!res.ok || !res.data) {
        setBannerError(res.error || "No pudimos cargar la ficha del contacto.");
        return;
      }
      syncFormFromDetail(res.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, contactId, syncFormFromDetail]);

  if (!isOpen || !contactId) return null;

  const waWindow = detail
    ? (detail.whatsappWindow ?? computeClientWhatsappWindow(detail.lastWhatsappInboundAt))
    : null;

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;

    setSavingGeneral(true);
    setBannerError(null);
    const tags = tagsText
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const res = await workspaceFetch<CrmContactListItemView>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          fullName: fullName.trim(),
          companyName: companyName.trim() || null,
          phoneMobile: phoneMobile.trim() || null,
          phoneSecondary: phoneSecondary.trim() || null,
          phoneLandline: phoneLandline.trim() || null,
          email: email.trim() || null,
          documentType: documentType || null,
          documentNumber: documentNumber.trim() || null,
          birthDate: birthDate.trim() || null,
          preferredChannel: preferredChannel || null,
          language,
          tags,
          notes: notes.trim() || null,
        }),
      },
    );
    setSavingGeneral(false);

    if (!res.ok || !res.data) {
      setBannerError(res.error || "No se pudieron guardar los cambios del contacto.");
      return;
    }

    onContactUpdated(res.data);
    onClose();
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingAddress(true);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await workspaceFetch<ContactAddressView>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/addresses`,
      {
        method: "POST",
        body: JSON.stringify({
          label: addrLabel.trim(),
          countryCode: addrCountryCode.trim() || "CO",
          country: addrCountry.trim() || "Colombia",
          subdivisionCode: addrSubdivisionCode.trim() || null,
          state: addrState.trim() || null,
          city: addrCity.trim(),
          addressLine: addrLine.trim(),
          neighborhood: addrNeighborhood.trim() || null,
          addressComplement: addrComplement.trim() || null,
          postalCode: addrPostalCode.trim() || null,
          referenceNotes: addrNotes.trim() || null,
          isDefault: addrIsDefault,
        }),
      },
    );
    setSavingAddress(false);

    if (!res.ok) {
      setBannerError(res.error || "No se pudo guardar la dirección.");
      return;
    }

    setShowAddAddress(false);
    setAddrCity("");
    setAddrLine("");
    setAddrSubdivisionCode("");
    setAddrState("");
    setAddrNeighborhood("");
    setAddrComplement("");
    setAddrPostalCode("");
    setAddrNotes("");
    setAddrIsDefault(false);
    await loadDetail(detail.id);
    setBannerSuccess(locale === "en" ? "Address saved." : "Dirección agregada correctamente.");
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    if (!detail) return;
    setBannerError(null);
    const res = await workspaceFetch<ContactAddressView>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/addresses/${encodeURIComponent(addressId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      },
    );
    if (!res.ok) {
      setBannerError(res.error || "No se pudo establecer la dirección predeterminada.");
      return;
    }
    await loadDetail(detail.id);
    const refreshed = await workspaceFetch<CrmContactDetailView>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}`,
      { method: "GET" },
    );
    if (refreshed.ok && refreshed.data) {
      onContactUpdated(refreshed.data);
    }
  };

  const handleConfirmDeleteAddress = async () => {
    if (!detail || !addressToDelete) return;
    setDeletingAddress(true);
    setBannerError(null);
    const res = await workspaceFetch<{ deleted: boolean }>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/addresses/${encodeURIComponent(addressToDelete.id)}`,
      { method: "DELETE" },
    );
    setDeletingAddress(false);
    if (!res.ok) {
      setBannerError(res.error || "No se pudo eliminar la dirección.");
      return;
    }
    setAddressToDelete(null);
    await loadDetail(detail.id);
  };

  const handleSaveRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingRating(true);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await workspaceFetch<{ rating: unknown; contact: CrmContactListItemView }>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/ratings`,
      {
        method: "POST",
        body: JSON.stringify({
          stars: ratingStars,
          comment: ratingComment.trim() || null,
        }),
      },
    );
    setSavingRating(false);

    if (!res.ok || !res.data) {
      setBannerError(res.error || "No se pudo registrar la calificación.");
      return;
    }

    setRatingComment("");
    onContactUpdated(res.data.contact);
    await loadDetail(detail.id);
    setBannerSuccess(locale === "en" ? "Rating recorded." : "Calificación registrada.");
  };

  const handleUpdateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingStage(true);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await workspaceFetch<CrmContactListItemView>(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/stage`,
      {
        method: "PATCH",
        body: JSON.stringify({
          stage: nextStage,
          notes: stageNotes.trim() || null,
        }),
      },
    );
    setSavingStage(false);

    if (!res.ok || !res.data) {
      setBannerError(res.error || "No se pudo actualizar la etapa.");
      return;
    }

    setStageNotes("");
    onContactUpdated(res.data);
    await loadDetail(detail.id);
    setBannerSuccess(locale === "en" ? "Pipeline stage updated." : "Etapa actualizada.");
  };

  const handleGrantConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingConsent(true);
    setBannerError(null);
    setBannerSuccess(null);

    const res = await workspaceFetch(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/consents`,
      {
        method: "POST",
        body: JSON.stringify({
          purpose: consentPurpose,
          channel: consentChannel,
          evidenceRef: consentEvidenceRef.trim() || null,
        }),
      },
    );
    setSavingConsent(false);

    if (!res.ok) {
      setBannerError(res.error || "No se pudo registrar el consentimiento.");
      return;
    }

    setConsentEvidenceRef("");
    await loadDetail(detail.id);
    setBannerSuccess(locale === "en" ? "Consent recorded." : "Consentimiento registrado.");
  };

  const handleRevokeConsent = async (consentId: string) => {
    if (!detail) return;
    setBannerError(null);
    setBannerSuccess(null);
    const res = await workspaceFetch(
      `/api/tenant/contacts/${encodeURIComponent(detail.id)}/consents/${encodeURIComponent(consentId)}/revoke`,
      { method: "PATCH" },
    );
    if (!res.ok) {
      setBannerError(res.error || "No se pudo revocar el consentimiento.");
      return;
    }
    await loadDetail(detail.id);
    setBannerSuccess(locale === "en" ? "Consent revoked." : "Consentimiento revocado.");
  };

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: w.crmTabGeneral, icon: <User className="h-3.5 w-3.5" /> },
    { id: "addresses", label: w.crmTabAddresses, icon: <MapPin className="h-3.5 w-3.5" /> },
    { id: "ratings", label: w.crmTabRatings, icon: <Star className="h-3.5 w-3.5" /> },
    { id: "attention", label: w.crmTabAttention, icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0"
          closeAriaLabel={w.crmCancelCta}
          aria-label={w.crmDetailModalTitle}
        >
          {/* Header */}
          <DialogHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-[var(--dsn-border)] px-5 py-4 pr-12">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-base font-bold text-[var(--dsn-text)]">
                  {detail?.fullName || w.crmDetailModalTitle}
                </DialogTitle>
                {detail && (
                  <Badge variant="outline">{formatSourceLabel(detail.source, locale)}</Badge>
                )}
                {waWindow && (
                  <Badge
                    variant={
                      waWindow.status === "active"
                        ? "success"
                        : waWindow.status === "expired"
                          ? "warning"
                          : "outline"
                    }
                  >
                    {waWindow.status === "active"
                      ? `${w.crmWhatsappActiveBadge} · ${formatClientWhatsappRemaining(waWindow.remainingSeconds)}`
                      : waWindow.status === "expired"
                        ? w.crmWhatsappExpiredBadge
                        : w.crmWhatsappNoneBadge}
                  </Badge>
                )}
              </div>
              {detail?.companyName && (
                <p className="mt-0.5 text-xs text-[var(--dsn-text-secondary)]">
                  {detail.companyName}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/workspace/conversations"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <MessageSquare className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                <span>{w.crmOpenConversationsCta}</span>
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Link>
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as DetailTab)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {/* Tab Navigation */}
            <nav
              aria-label={w.crmDetailModalTitle}
              className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-4 py-2"
            >
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="min-h-[36px] gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-[var(--dsn-accent)] data-[state=active]:text-white data-[state=active]:shadow-xs"
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </nav>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {bannerError && (
                <Alert variant="error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <AlertDescription>{bannerError}</AlertDescription>
                </Alert>
              )}
              {bannerSuccess && (
                <Alert variant="success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <AlertDescription>{bannerSuccess}</AlertDescription>
                </Alert>
              )}

              {loading || !detail ? (
                <div className="py-12 text-center text-xs text-[var(--dsn-text-secondary)]">
                  {locale === "en" ? "Loading profile..." : "Cargando ficha del contacto..."}
                </div>
              ) : (
                <>
                  {/* TAB 1: Datos Generales */}
                  {activeTab === "general" && (
                    <form onSubmit={handleSaveGeneral} className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldFullName} *
                          </Label>
                          <Input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldCompanyName}
                          </Label>
                          <Input
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="text-xs"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <PhoneE164Input
                            id="detail-contact-phone-mobile"
                            label={w.crmFieldPhoneMobile}
                            value={phoneMobile}
                            defaultCountryCode={addrCountryCode}
                            locale={locale}
                            onChange={(next) => setPhoneMobile(next)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <PhoneE164Input
                            id="detail-contact-phone-secondary"
                            label={w.crmFieldPhoneSecondary}
                            value={phoneSecondary}
                            defaultCountryCode={addrCountryCode}
                            locale={locale}
                            onChange={(next) => setPhoneSecondary(next)}
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldEmail}
                          </Label>
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldPhoneLandline}
                          </Label>
                          <Input
                            type="tel"
                            value={phoneLandline}
                            onChange={(e) => setPhoneLandline(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldDocumentType}
                          </Label>
                          <Select
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value)}
                            className="text-xs"
                          >
                            <option value="">—</option>
                            {CRM_DOCUMENT_TYPES.map((dt) => (
                              <option key={dt} value={dt}>
                                {dt}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldDocumentNumber}
                          </Label>
                          <Input
                            type="text"
                            value={documentNumber}
                            onChange={(e) => setDocumentNumber(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldBirthDate}
                          </Label>
                          <Input
                            type="date"
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldPreferredChannel}
                          </Label>
                          <Select
                            value={preferredChannel}
                            onChange={(e) => setPreferredChannel(e.target.value)}
                            className="text-xs"
                          >
                            <option value="">—</option>
                            {CRM_CHANNELS.map((ch) => (
                              <option key={ch} value={ch}>
                                {formatChannelLabel(ch, locale)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldLanguage}
                          </Label>
                          <Select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "es")}
                            className="text-xs"
                          >
                            <option value="es">Español</option>
                            <option value="en">English</option>
                          </Select>
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmFieldTags}
                          </Label>
                          <Input
                            type="text"
                            value={tagsText}
                            onChange={(e) => setTagsText(e.target.value)}
                            placeholder="VIP, Mayorista"
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="mb-1 block text-xs font-semibold">{w.crmFieldNotes}</Label>
                        <Textarea
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="text-xs"
                        />
                      </div>

                      <div className="flex justify-end gap-2 border-t border-[var(--dsn-border)] pt-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                          {w.crmCancelCta}
                        </Button>
                        <Button
                          type="submit"
                          disabled={savingGeneral}
                          loading={savingGeneral}
                          loadingText={w.crmSavingCta}
                        >
                          {w.crmSaveChangesCta}
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* TAB 2: Direcciones de Envío */}
                  {activeTab === "addresses" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-[var(--dsn-text)]">
                          {w.crmTabAddresses} ({detail.addresses.length})
                        </h4>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowAddAddress((v) => !v)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{w.crmAddressAddCta}</span>
                        </Button>
                      </div>

                      {showAddAddress && (
                        <form
                          onSubmit={handleCreateAddress}
                          className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4"
                        >
                          <div className="space-y-3">
                            <div>
                              <Label className="mb-1 block text-xs font-semibold">
                                {w.crmAddressLabel} *
                              </Label>
                              <Input
                                type="text"
                                required
                                value={addrLabel}
                                onChange={(e) => setAddrLabel(e.target.value)}
                                className="text-xs"
                              />
                            </div>
                            <GeoAddressFields
                              idPrefix="detail-contact-addr"
                              locale={locale}
                              showReferenceNotes
                              requiredFields={{
                                country: true,
                                city: true,
                                addressLine: true,
                              }}
                              values={{
                                countryCode: addrCountryCode,
                                country: addrCountry,
                                subdivisionCode: addrSubdivisionCode,
                                state: addrState,
                                city: addrCity,
                                neighborhood: addrNeighborhood,
                                addressLine: addrLine,
                                addressComplement: addrComplement,
                                postalCode: addrPostalCode,
                                referenceNotes: addrNotes,
                              }}
                              onChange={(patch) => {
                                if (patch.countryCode !== undefined)
                                  setAddrCountryCode(patch.countryCode);
                                if (patch.country !== undefined) setAddrCountry(patch.country);
                                if (patch.subdivisionCode !== undefined)
                                  setAddrSubdivisionCode(patch.subdivisionCode);
                                if (patch.state !== undefined) setAddrState(patch.state);
                                if (patch.city !== undefined) setAddrCity(patch.city);
                                if (patch.neighborhood !== undefined)
                                  setAddrNeighborhood(patch.neighborhood);
                                if (patch.addressLine !== undefined) setAddrLine(patch.addressLine);
                                if (patch.addressComplement !== undefined)
                                  setAddrComplement(patch.addressComplement);
                                if (patch.postalCode !== undefined)
                                  setAddrPostalCode(patch.postalCode);
                                if (patch.referenceNotes !== undefined)
                                  setAddrNotes(patch.referenceNotes);
                              }}
                            />
                          </div>
                          <label className="inline-flex items-center gap-2 text-xs text-[var(--dsn-text)]">
                            <Checkbox
                              checked={addrIsDefault}
                              onCheckedChange={(checked) => setAddrIsDefault(checked === true)}
                            />
                            <span>{w.crmAddressDefaultTag}</span>
                          </label>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAddAddress(false)}
                            >
                              {w.crmCancelCta}
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={savingAddress}
                              loading={savingAddress}
                              loadingText={w.crmSavingCta}
                            >
                              {w.crmAddressAddCta}
                            </Button>
                          </div>
                        </form>
                      )}

                      {detail.addresses.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--dsn-border)] p-6 text-center text-xs text-[var(--dsn-text-secondary)]">
                          {w.crmAddressEmpty}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {detail.addresses.map((addr) => (
                            <article
                              key={addr.id}
                              className="space-y-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/25 p-4"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[var(--dsn-text)]">
                                  {addr.label}
                                </span>
                                {addr.isDefault && (
                                  <Badge variant="success">{w.crmAddressDefaultTag}</Badge>
                                )}
                              </div>
                              <p className="text-xs text-[var(--dsn-text)]">{addr.addressLine}</p>
                              <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                                {[addr.neighborhood, addr.city, addr.state, addr.country]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {addr.referenceNotes && (
                                <p className="text-[11px] italic text-[var(--dsn-text-secondary)]">
                                  {addr.referenceNotes}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--dsn-border)]/60 pt-2">
                                {!addr.isDefault && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleSetDefaultAddress(addr.id)}
                                    className="h-7 min-h-0 px-2.5 text-[11px]"
                                  >
                                    {w.crmAddressSetDefaultCta}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setAddressToDelete(addr)}
                                  className="h-7 min-h-0 px-2.5 text-[11px]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>{w.crmDeleteContactCta}</span>
                                </Button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: Calificación e Historial */}
                  {activeTab === "ratings" && (
                    <div className="space-y-5">
                      <form
                        onSubmit={handleSaveRating}
                        className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4"
                      >
                        <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                          {w.crmRatingTitle}
                        </h4>
                        <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${value} ${w.crmFilterRatingStarsUnit}`}
                              onClick={() => setRatingStars(value)}
                              className="h-8 w-8"
                            >
                              <Star
                                className={`h-5 w-5 ${
                                  value <= ratingStars
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-[var(--dsn-text-secondary)]"
                                }`}
                              />
                            </Button>
                          ))}
                          <span className="ml-2 font-mono text-xs text-[var(--dsn-text-secondary)]">
                            {ratingStars}/5
                          </span>
                        </div>
                        <div>
                          <Label className="mb-1 block text-xs font-semibold">
                            {w.crmRatingCommentLabel}
                          </Label>
                          <Textarea
                            rows={2}
                            value={ratingComment}
                            onChange={(e) => setRatingComment(e.target.value)}
                            className="text-xs"
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={savingRating}
                            loading={savingRating}
                            loadingText={w.crmSavingCta}
                          >
                            {w.crmRatingSubmitCta}
                          </Button>
                        </div>
                      </form>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <section className="space-y-2.5 rounded-xl border border-[var(--dsn-border)] p-4">
                          <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                            {w.crmRatingHistoryTitle}
                          </h4>
                          {detail.ratingsHistory.length === 0 ? (
                            <p className="text-xs text-[var(--dsn-text-secondary)]">
                              {w.crmRatingEmpty}
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {detail.ratingsHistory.map((item) => (
                                <li
                                  key={item.id}
                                  className="rounded-lg border border-[var(--dsn-border)]/70 bg-[var(--dsn-surface-secondary)]/20 p-2.5 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono font-semibold text-amber-400">
                                      {"★".repeat(item.stars)} ({item.stars}/5)
                                    </span>
                                    <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                                      {formatShortDateTime(item.createdAt, locale)}
                                    </span>
                                  </div>
                                  {item.comment && (
                                    <p className="mt-1 text-[var(--dsn-text)]">{item.comment}</p>
                                  )}
                                  <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                                    {item.ratedByName}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>

                        <section className="space-y-2.5 rounded-xl border border-[var(--dsn-border)] p-4">
                          <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                            {w.crmRecentOrdersTitle}
                          </h4>
                          {detail.recentOrders.length === 0 ? (
                            <p className="text-xs text-[var(--dsn-text-secondary)]">
                              {w.crmRecentOrdersEmpty}
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {detail.recentOrders.map((order) => (
                                <li
                                  key={order.id}
                                  className="flex items-center justify-between rounded-lg border border-[var(--dsn-border)]/70 bg-[var(--dsn-surface-secondary)]/20 p-2.5 text-xs"
                                >
                                  <div>
                                    <p className="font-mono font-semibold text-[var(--dsn-text)]">
                                      {order.orderNumber}
                                    </p>
                                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                                      {formatShortDateTime(order.createdAt, locale)}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-mono font-semibold text-[var(--dsn-text)]">
                                      {formatCurrencyCents(order.totalCents, order.currency, locale)}
                                    </p>
                                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                                      {order.status}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: Atención y Consentimiento */}
                  {activeTab === "attention" && (
                    <div className="space-y-5">
                      <form
                        onSubmit={handleUpdateStage}
                        className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                            {w.crmFieldStage}
                          </h4>
                          {detail.convertedToCustomerAt && (
                            <Badge variant="success">
                              {w.crmConversionTag} ·{" "}
                              {formatShortDateTime(detail.convertedToCustomerAt, locale)}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <Label className="mb-1 block text-xs font-semibold">
                              {w.crmFieldStage}
                            </Label>
                            <Select
                              value={nextStage}
                              onChange={(e) => setNextStage(e.target.value)}
                              className="text-xs"
                            >
                              {CRM_STAGES.map((st) => (
                                <option key={st} value={st}>
                                  {formatStageLabel(st, locale)}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs font-semibold">
                              {w.crmFieldNotes}
                            </Label>
                            <Input
                              type="text"
                              value={stageNotes}
                              onChange={(e) => setStageNotes(e.target.value)}
                              className="text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={savingStage}
                            loading={savingStage}
                            loadingText={w.crmSavingCta}
                          >
                            {w.crmStageHistoryCta}
                          </Button>
                        </div>
                      </form>

                      <section className="space-y-4 rounded-xl border border-[var(--dsn-border)] p-4">
                        <h4 className="text-xs font-semibold text-[var(--dsn-text)]">
                          {w.crmConsentTitle}
                        </h4>

                        {detail.consents.length === 0 ? (
                          <p className="text-xs text-[var(--dsn-text-secondary)]">
                            {w.crmConsentEmpty}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {detail.consents.map((consent) => {
                              const isGranted = consent.status === "granted";
                              return (
                                <div
                                  key={consent.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dsn-border)]/70 bg-[var(--dsn-surface-secondary)]/20 p-3 text-xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-[var(--dsn-text)]">
                                        {consent.purpose === "data_treatment"
                                          ? w.crmConsentPurposeTreatment
                                          : w.crmConsentPurposeCommercial}
                                      </span>
                                      <Badge variant={isGranted ? "success" : "destructive"}>
                                        {isGranted
                                          ? w.crmConsentGrantedBadge
                                          : w.crmConsentRevokedBadge}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                                      {consent.channel}
                                      {consent.evidenceRef ? ` · ${consent.evidenceRef}` : ""} · v
                                      {consent.policyVersion}
                                    </p>
                                  </div>
                                  {isGranted && (
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => void handleRevokeConsent(consent.id)}
                                      className="h-7 min-h-0 px-3 text-[11px]"
                                    >
                                      {w.crmConsentRevokeCta}
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <form
                          onSubmit={handleGrantConsent}
                          className="grid grid-cols-1 gap-3 border-t border-[var(--dsn-border)] pt-3 md:grid-cols-3"
                        >
                          <div>
                            <Label className="mb-1 block text-xs font-semibold">
                              {w.crmConsentPurposeTreatment}
                            </Label>
                            <Select
                              value={consentPurpose}
                              onChange={(e) =>
                                setConsentPurpose(
                                  e.target.value === "commercial_comms"
                                    ? "commercial_comms"
                                    : "data_treatment",
                                )
                              }
                              className="text-xs"
                            >
                              <option value="data_treatment">{w.crmConsentPurposeTreatment}</option>
                              <option value="commercial_comms">{w.crmConsentPurposeCommercial}</option>
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs font-semibold">
                              {w.crmConsentChannelLabel}
                            </Label>
                            <Select
                              value={consentChannel}
                              onChange={(e) => setConsentChannel(e.target.value)}
                              className="text-xs"
                            >
                              {CRM_CONSENT_CHANNELS.map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block text-xs font-semibold">
                              {w.crmConsentEvidenceLabel}
                            </Label>
                            <Input
                              type="text"
                              value={consentEvidenceRef}
                              onChange={(e) => setConsentEvidenceRef(e.target.value)}
                              className="text-xs"
                            />
                          </div>
                          <div className="flex justify-end md:col-span-3">
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={savingConsent}
                              loading={savingConsent}
                              loadingText={w.crmSavingCta}
                            >
                              {w.crmConsentGrantCta}
                            </Button>
                          </div>
                        </form>
                      </section>
                    </div>
                  )}
                </>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={Boolean(addressToDelete)}
        onClose={() => setAddressToDelete(null)}
        onConfirm={handleConfirmDeleteAddress}
        title={w.crmAddressDeleteTitle}
        variant="danger"
        warningTitle={w.crmAddressDeleteTitle}
        warningMessage={w.crmAddressDeleteWarning}
        details={
          addressToDelete
            ? [
                { label: w.crmAddressLabel, value: addressToDelete.label },
                { label: w.crmAddressCity, value: addressToDelete.city },
                { label: w.crmAddressLine, value: addressToDelete.addressLine },
              ]
            : []
        }
        confirmText={w.crmDeleteConfirmCta}
        cancelText={w.crmCancelCta}
        loading={deletingAddress}
      />
    </>
  );
}

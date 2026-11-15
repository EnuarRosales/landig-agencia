"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  MessageSquare,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { ContactDetailModal } from "./contact-detail-modal";
import {
  CRM_CHANNELS,
  CRM_DOCUMENT_TYPES,
  CRM_SOURCES,
  CRM_STAGES,
  computeClientWhatsappWindow,
  formatChannelLabel,
  formatClientWhatsappRemaining,
  formatShortDateTime,
  formatSourceLabel,
  formatStageLabel,
  resolveInitialContactList,
  type CrmContactListItemView,
  type CrmContactListResultView,
} from "./contacts-helpers";

interface ContactsViewProps {
  initialList?: CrmContactListResultView | null;
  initialContacts?: CrmContactListItemView[];
  canDelete?: boolean;
  locale?: AdminLocale;
}

/**
 * Vista principal omnicanal del directorio CRM de contactos y prospección (`/workspace/contacts`).
 */
export function ContactsView({
  initialList = null,
  initialContacts,
  canDelete = false,
  locale = "es",
}: ContactsViewProps) {
  const dict = getAdminDictionary(locale);
  const w = dict.workspace;

  const [listData, setListData] = useState<CrmContactListResultView>(() =>
    resolveInitialContactList(initialList, initialContacts),
  );
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Filtros y ordenamiento (prioridad WhatsApp por defecto)
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState("all");
  const [minRatingFilter, setMinRatingFilter] = useState("");
  const [sortBy, setSortBy] = useState("whatsapp_priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Modal de creación multi-fuente
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [source, setSource] = useState<string>("manual");
  const [preferredChannel, setPreferredChannel] = useState<string>("whatsapp_cloud");
  const [stage, setStage] = useState<string>("new");
  const [email, setEmail] = useState("");
  const [phoneMobile, setPhoneMobile] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [documentType, setDocumentType] = useState<string>("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const [includeInitialAddress, setIncludeInitialAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState("Casa");
  const [addrCountry, setAddrCountry] = useState("Colombia");
  const [addrState, setAddrState] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrLine, setAddrLine] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Ficha detalle y borrado seguro
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrmContactListItemView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const fetchContacts = async (overrides?: {
    nextPage?: number;
    nextQuery?: string;
    nextStage?: string;
    nextSource?: string;
    nextWindow?: string;
    nextMinRating?: string;
    nextSortBy?: string;
    nextSortDir?: "asc" | "desc";
  }) => {
    const targetPage = overrides?.nextPage ?? page;
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("limit", String(listData.pagination.limit || 20));
    params.set("sortBy", overrides?.nextSortBy ?? sortBy);
    params.set("sortDir", overrides?.nextSortDir ?? sortDir);

    const q = (overrides?.nextQuery ?? query).trim();
    if (q) params.set("query", q);
    const st = overrides?.nextStage ?? stageFilter;
    if (st && st !== "all") params.set("stage", st);
    const src = overrides?.nextSource ?? sourceFilter;
    if (src && src !== "all") params.set("source", src);
    const win = overrides?.nextWindow ?? windowFilter;
    if (win && win !== "all") params.set("whatsappWindow", win);
    const mr = overrides?.nextMinRating ?? minRatingFilter;
    if (mr) params.set("minRating", mr);

    setLoadingList(true);
    setListError(null);
    const res = await workspaceFetch<CrmContactListResultView>(
      `/api/tenant/contacts?${params.toString()}`,
      { method: "GET" },
    );
    setLoadingList(false);

    if (!res.ok || !res.data) {
      setListError(res.error || "No pudimos cargar el listado de contactos.");
      return;
    }

    setListData(res.data);
  };

  const resetCreateForm = () => {
    setFullName("");
    setCompanyName("");
    setSource("manual");
    setPreferredChannel("whatsapp_cloud");
    setStage("new");
    setEmail("");
    setPhoneMobile("");
    setPhoneSecondary("");
    setDocumentType("");
    setDocumentNumber("");
    setBirthDate("");
    setNotes("");
    setIncludeInitialAddress(false);
    setAddrLabel("Casa");
    setAddrCountry("Colombia");
    setAddrState("");
    setAddrCity("");
    setAddrLine("");
    setFormError(null);
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setFormError("El nombre completo es obligatorio.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await workspaceFetch<CrmContactListItemView>("/api/tenant/contacts", {
        method: "POST",
        body: JSON.stringify({
          fullName: fullName.trim(),
          companyName: companyName.trim() || null,
          source,
          preferredChannel: preferredChannel || null,
          stage,
          email: email.trim() || null,
          phoneMobile: phoneMobile.trim() || null,
          phoneSecondary: phoneSecondary.trim() || null,
          documentType: documentType || null,
          documentNumber: documentNumber.trim() || null,
          birthDate: birthDate.trim() || null,
          notes: notes.trim() || null,
          initialAddress: includeInitialAddress
            ? {
                label: addrLabel.trim() || "Casa",
                country: addrCountry.trim() || "Colombia",
                state: addrState.trim() || null,
                city: addrCity.trim(),
                addressLine: addrLine.trim(),
                isDefault: true,
              }
            : null,
        }),
      });

      if (!res.ok || !res.data) {
        setFormError(res.error || "Error al registrar el contacto.");
        return;
      }

      setListData((prev) => ({
        ...prev,
        items: [res.data!, ...prev.items],
        pagination: { ...prev.pagination, total: prev.pagination.total + 1 },
        quota: { ...prev.quota, used: prev.quota.used + 1 },
      }));
      setCreateOpen(false);
      resetCreateForm();
    } catch {
      setFormError("Error inesperado al conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteContact = async () => {
    if (!deleteTarget || !canDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await workspaceFetch<{ id: string }>(
      `/api/tenant/contacts/${encodeURIComponent(deleteTarget.id)}`,
      { method: "DELETE" },
    );
    setDeleting(false);

    if (!res.ok) {
      setDeleteError(res.error || "No se pudo eliminar el contacto.");
      return;
    }

    setListData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== deleteTarget.id),
      pagination: { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) },
      quota: { ...prev.quota, used: Math.max(0, prev.quota.used - 1) },
    }));
    setDeleteTarget(null);
  };

  const handleContactUpdated = (updated: CrmContactListItemView) => {
    setListData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    }));
  };

  const renderWindowBadge = (contact: CrmContactListItemView) => {
    const win =
      contact.lastWhatsappInboundAt !== undefined
        ? computeClientWhatsappWindow(contact.lastWhatsappInboundAt, nowMs)
        : (contact.whatsappWindow ?? { status: "none", expiresAt: null, remainingSeconds: 0 });

    if (win.status === "active") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
          {w.crmWhatsappActiveBadge} · {formatClientWhatsappRemaining(win.remainingSeconds)}
        </span>
      );
    }
    if (win.status === "expired") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
          {w.crmWhatsappExpiredBadge}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--dsn-text-secondary)]">
        {w.crmWhatsappNoneBadge}
      </span>
    );
  };

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      {/* Cabecera */}
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--dsn-border)] pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)] md:text-2xl">
              {w.crmTitle}
            </h1>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-400">
              {w.crmBadge}
            </span>
            <span className="rounded-full border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2.5 py-0.5 font-mono text-xs text-[var(--dsn-text-secondary)]">
              {w.crmQuotaLabel}: {listData.quota.used} /{" "}
              {listData.quota.mode === "LIMITED" && listData.quota.limit !== null
                ? listData.quota.limit
                : w.crmQuotaUnlimited}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)] md:text-sm">
            {w.crmSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/workspace/conversations"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
          >
            <MessageSquare className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>{w.crmOpenConversationsCta}</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>

          <button
            type="button"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span>{w.crmNewContactCta}</span>
          </button>
        </div>
      </header>

      {/* Filtros y Prioridad WhatsApp */}
      <section className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dsn-text-secondary)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                setPage(1);
                void fetchContacts({ nextPage: 1, nextQuery: next });
              }}
              placeholder={w.crmSearchPlaceholder}
              className="min-h-[40px] w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 pl-9 pr-3 text-xs text-[var(--dsn-text)]"
            />
          </div>

          <select
            aria-label={w.crmFilterAllStages}
            value={stageFilter}
            onChange={(e) => {
              const next = e.target.value;
              setStageFilter(next);
              setPage(1);
              void fetchContacts({ nextPage: 1, nextStage: next });
            }}
            className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 text-xs text-[var(--dsn-text)]"
          >
            <option value="all">{w.crmFilterAllStages}</option>
            {CRM_STAGES.map((st) => (
              <option key={st} value={st}>
                {formatStageLabel(st, locale)}
              </option>
            ))}
          </select>

          <select
            aria-label={w.crmFilterAllSources}
            value={sourceFilter}
            onChange={(e) => {
              const next = e.target.value;
              setSourceFilter(next);
              setPage(1);
              void fetchContacts({ nextPage: 1, nextSource: next });
            }}
            className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 text-xs text-[var(--dsn-text)]"
          >
            <option value="all">{w.crmFilterAllSources}</option>
            {CRM_SOURCES.map((src) => (
              <option key={src} value={src}>
                {formatSourceLabel(src, locale)}
              </option>
            ))}
          </select>

          <select
            aria-label={w.crmFilterAllWindows}
            value={windowFilter}
            onChange={(e) => {
              const next = e.target.value;
              setWindowFilter(next);
              setPage(1);
              void fetchContacts({ nextPage: 1, nextWindow: next });
            }}
            className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 text-xs text-[var(--dsn-text)]"
          >
            <option value="all">{w.crmFilterAllWindows}</option>
            <option value="active">{w.crmFilterWindowActive}</option>
            <option value="expired">{w.crmFilterWindowExpired}</option>
            <option value="none">{w.crmFilterWindowNone}</option>
          </select>

          <select
            aria-label={w.crmFilterAllRatings}
            value={minRatingFilter}
            onChange={(e) => {
              const next = e.target.value;
              setMinRatingFilter(next);
              setPage(1);
              void fetchContacts({ nextPage: 1, nextMinRating: next });
            }}
            className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 text-xs text-[var(--dsn-text)]"
          >
            <option value="">{w.crmFilterAllRatings}</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={String(stars)}>
                {w.crmFilterRatingMinPrefix} {stars} {w.crmFilterRatingStarsUnit}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="font-mono text-[var(--dsn-text-secondary)]">
            {listData.pagination.total}{" "}
            {listData.pagination.total === 1 ? "contacto" : "contactos"}
          </span>

          <div className="flex items-center gap-2">
            <select
              aria-label={w.crmSortWhatsappPriority}
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value;
                setSortBy(next);
                void fetchContacts({ nextSortBy: next });
              }}
              className="min-h-[34px] rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 text-xs text-[var(--dsn-text)]"
            >
              <option value="whatsapp_priority">{w.crmSortWhatsappPriority}</option>
              <option value="last_inbound">{w.crmSortLastSeen}</option>
              <option value="rating">{w.crmSortRating}</option>
              <option value="created_at">{w.crmSortCreatedAt}</option>
              <option value="full_name">{w.crmSortFullName}</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const nextDir = sortDir === "desc" ? "asc" : "desc";
                setSortDir(nextDir);
                void fetchContacts({ nextSortDir: nextDir });
              }}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 text-xs font-medium text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{sortDir === "desc" ? "DESC" : "ASC"}</span>
            </button>
          </div>
        </div>
      </section>

      {listError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {/* Listado Mobile First + Tabla Escritorio */}
      <section className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-xs">
        {loadingList ? (
          <div className="p-10 text-center text-xs text-[var(--dsn-text-secondary)]">
            {locale === "en" ? "Loading contacts..." : "Actualizando directorio de contactos..."}
          </div>
        ) : listData.items.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-[var(--dsn-text-secondary)]/50" />
            <h3 className="text-sm font-semibold text-[var(--dsn-text)]">{w.crmEmptyTitle}</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--dsn-text-secondary)]">
              {w.crmEmptyDesc}
            </p>
          </div>
        ) : (
          <>
            {/* Tarjetas Mobile First (< md) */}
            <div className="grid grid-cols-1 gap-3 p-4 md:hidden" data-testid="contacts-mobile-cards">
              {listData.items.map((c) => (
                <article
                  key={c.id}
                  className="space-y-2.5 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--dsn-text)]">{c.fullName}</h3>
                      {c.companyName && (
                        <p className="text-xs text-[var(--dsn-text-secondary)]">{c.companyName}</p>
                      )}
                    </div>
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                      {formatStageLabel(c.stage, locale)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {renderWindowBadge(c)}
                    <span className="rounded-full border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2 py-0.5 text-[11px] text-[var(--dsn-text-secondary)]">
                      {formatSourceLabel(c.source, locale)}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-[var(--dsn-text-secondary)]">
                    <p className="font-mono">{c.phoneMobile || "—"}</p>
                    <p>{c.email || "—"}</p>
                    {c.defaultAddressSummary && (
                      <p>
                        {c.defaultAddressSummary.city}, {c.defaultAddressSummary.country}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--dsn-border)]/70 pt-2.5">
                    <span className="font-mono text-xs text-amber-400">
                      {c.currentRatingStars ? `★ ${c.currentRatingStars}/5` : "—"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedContactId(c.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1 text-xs font-semibold text-[var(--dsn-text)]"
                      >
                        <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                        <span>{w.crmViewDetailCta}</span>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Tabla Escritorio (>= md) */}
            <div className="hidden overflow-x-auto md:block" data-testid="contacts-desktop-table">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{w.crmColContact}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColChannelSource}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColWhatsappWindow}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColStage}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColRating}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColCity}</th>
                    <th className="px-4 py-3 font-semibold">{w.crmColLastSeen}</th>
                    <th className="px-4 py-3 text-right font-semibold">{w.crmColActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--dsn-border)] text-[var(--dsn-text)]">
                  {listData.items.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-[var(--dsn-surface-secondary)]/20">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--dsn-text)]">{c.fullName}</p>
                        {c.companyName && (
                          <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                            {c.companyName}
                          </p>
                        )}
                        <p className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                          {c.phoneMobile || c.email || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--dsn-text)]">
                          {formatSourceLabel(c.source, locale)}
                        </span>
                        {c.preferredChannel && (
                          <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                            {w.crmPreferredLabel}: {formatChannelLabel(c.preferredChannel, locale)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">{renderWindowBadge(c)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                          {formatStageLabel(c.stage, locale)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {c.currentRatingStars ? (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Star className="h-3.5 w-3.5 fill-amber-400" />
                            <span>{c.currentRatingStars}/5</span>
                          </span>
                        ) : (
                          <span className="text-[var(--dsn-text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">
                        {c.defaultAddressSummary ? c.defaultAddressSummary.city : "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--dsn-text-secondary)]">
                        {formatShortDateTime(c.lastSeenAt, locale)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedContactId(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                          >
                            <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                            <span>{w.crmViewDetailCta}</span>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              aria-label={`${w.crmDeleteContactCta} ${c.fullName}`}
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(c);
                              }}
                              className="inline-flex items-center rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Paginación */}
        {listData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--dsn-border)] px-4 py-3 text-xs text-[var(--dsn-text-secondary)]">
            <span className="font-mono tabular-nums">
              {w.crmPaginationPage} {listData.pagination.page} {w.crmPaginationOf}{" "}
              {listData.pagination.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={listData.pagination.page <= 1}
                onClick={() => {
                  const next = Math.max(1, listData.pagination.page - 1);
                  setPage(next);
                  void fetchContacts({ nextPage: next });
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{w.crmPaginationPrev}</span>
              </button>
              <button
                type="button"
                disabled={listData.pagination.page >= listData.pagination.totalPages}
                onClick={() => {
                  const next = Math.min(listData.pagination.totalPages, listData.pagination.page + 1);
                  setPage(next);
                  void fetchContacts({ nextPage: next });
                }}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--dsn-border)] px-3 py-1 disabled:opacity-40"
              >
                <span>{w.crmPaginationNext}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modal de Creación Multi-Fuente */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={w.crmCreateModalTitle}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--dsn-border)] px-6 py-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[var(--dsn-accent)]" />
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {w.crmCreateModalTitle}
                </h3>
              </div>
              <button
                type="button"
                aria-label={w.crmCancelCta}
                onClick={() => setCreateOpen(false)}
                className="text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="flex-1 space-y-4 overflow-y-auto p-6">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldFullName} *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldCompanyName}
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldSource}
                  </label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  >
                    {CRM_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {formatSourceLabel(src, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldPreferredChannel}
                  </label>
                  <select
                    value={preferredChannel}
                    onChange={(e) => setPreferredChannel(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  >
                    {CRM_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {formatChannelLabel(ch, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldPhoneMobile}
                  </label>
                  <input
                    type="tel"
                    value={phoneMobile}
                    onChange={(e) => setPhoneMobile(e.target.value)}
                    placeholder="+573001234567"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 font-mono text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldEmail}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@ejemplo.com"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldPhoneSecondary}
                  </label>
                  <input
                    type="tel"
                    value={phoneSecondary}
                    onChange={(e) => setPhoneSecondary(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 font-mono text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldStage}
                  </label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  >
                    {CRM_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {formatStageLabel(st, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldDocumentType}
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                  >
                    <option value="">—</option>
                    {CRM_DOCUMENT_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldDocumentNumber}
                  </label>
                  <input
                    type="text"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="10203040"
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 font-mono text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                    {w.crmFieldBirthDate}
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 font-mono text-xs text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                  {w.crmFieldNotes}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 px-3 py-2 text-xs text-[var(--dsn-text)]"
                />
              </div>

              <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3 space-y-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
                  <input
                    type="checkbox"
                    checked={includeInitialAddress}
                    onChange={(e) => setIncludeInitialAddress(e.target.checked)}
                  />
                  <span>{w.crmIncludeInitialAddress}</span>
                </label>

                {includeInitialAddress && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                        {w.crmAddressLabel} *
                      </label>
                      <input
                        type="text"
                        required={includeInitialAddress}
                        value={addrLabel}
                        onChange={(e) => setAddrLabel(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                        {w.crmAddressCountry} *
                      </label>
                      <input
                        type="text"
                        required={includeInitialAddress}
                        value={addrCountry}
                        onChange={(e) => setAddrCountry(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                        {w.crmAddressState}
                      </label>
                      <input
                        type="text"
                        value={addrState}
                        onChange={(e) => setAddrState(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                        {w.crmAddressCity} *
                      </label>
                      <input
                        type="text"
                        required={includeInitialAddress}
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[var(--dsn-text)]">
                        {w.crmAddressLine} *
                      </label>
                      <input
                        type="text"
                        required={includeInitialAddress}
                        value={addrLine}
                        onChange={(e) => setAddrLine(e.target.value)}
                        className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--dsn-border)] pt-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="min-h-[40px] rounded-lg border border-[var(--dsn-border)] px-3.5 py-2 text-xs font-semibold text-[var(--dsn-text)] hover:bg-[var(--dsn-surface-secondary)]"
                >
                  {w.crmCancelCta}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? w.crmSavingCta : w.crmSaveCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Ficha Detallada 4 Pestañas */}
      <ContactDetailModal
        key={selectedContactId ?? "closed"}
        contactId={selectedContactId}
        isOpen={Boolean(selectedContactId)}
        locale={locale}
        onClose={() => setSelectedContactId(null)}
        onContactUpdated={handleContactUpdated}
      />

      {/* Modal de Confirmación para Borrado Seguro */}
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDeleteContact}
        title={w.crmDeleteTitle}
        subtitle={w.crmDeleteSubtitle}
        variant="danger"
        warningTitle={w.crmDeleteTitle}
        warningMessage={w.crmDeleteWarning}
        details={
          deleteTarget
            ? [
                { label: w.crmFieldFullName, value: deleteTarget.fullName },
                { label: w.crmFieldPhoneMobile, value: deleteTarget.phoneMobile || "—", mono: true },
                { label: w.crmFieldSource, value: formatSourceLabel(deleteTarget.source, locale) },
              ]
            : []
        }
        confirmText={w.crmDeleteConfirmCta}
        cancelText={w.crmCancelCta}
        loading={deleting}
        error={deleteError}
      />
    </div>
  );
}

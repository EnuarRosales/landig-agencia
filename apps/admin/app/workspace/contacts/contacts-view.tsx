"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownUp,
  ExternalLink,
  Eye,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { workspaceFetch } from "@/lib/workspace-client";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { GeoAddressFields } from "@/components/geo-address-fields";
import { PhoneE164Input } from "@/components/phone-e164-input";
import {
  WorkspaceDataTable,
  type WorkspaceTableColumn,
} from "@/components/ui/workspace-data-table";
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
  const [limit, setLimit] = useState<number>(initialList?.pagination?.limit || 20);

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
  const [addrCountryCode, setAddrCountryCode] = useState("CO");
  const [addrCountry, setAddrCountry] = useState("Colombia");
  const [addrSubdivisionCode, setAddrSubdivisionCode] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrNeighborhood, setAddrNeighborhood] = useState("");
  const [addrLine, setAddrLine] = useState("");
  const [addrComplement, setAddrComplement] = useState("");
  const [addrPostalCode, setAddrPostalCode] = useState("");
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
    nextLimit?: number;
    nextQuery?: string;
    nextStage?: string;
    nextSource?: string;
    nextWindow?: string;
    nextMinRating?: string;
    nextSortBy?: string;
    nextSortDir?: "asc" | "desc";
  }) => {
    const targetPage = overrides?.nextPage ?? page;
    const targetLimit = overrides?.nextLimit ?? limit;
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("limit", String(targetLimit));
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
    setAddrCountryCode("CO");
    setAddrCountry("Colombia");
    setAddrSubdivisionCode("");
    setAddrState("");
    setAddrCity("");
    setAddrNeighborhood("");
    setAddrLine("");
    setAddrComplement("");
    setAddrPostalCode("");
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
                countryCode: addrCountryCode.trim() || "CO",
                country: addrCountry.trim() || "Colombia",
                subdivisionCode: addrSubdivisionCode.trim() || null,
                state: addrState.trim() || null,
                city: addrCity.trim(),
                neighborhood: addrNeighborhood.trim() || null,
                addressLine: addrLine.trim(),
                addressComplement: addrComplement.trim() || null,
                postalCode: addrPostalCode.trim() || null,
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
        <Badge variant="success">
          {w.crmWhatsappActiveBadge} · {formatClientWhatsappRemaining(win.remainingSeconds)}
        </Badge>
      );
    }
    if (win.status === "expired") {
      return <Badge variant="warning">{w.crmWhatsappExpiredBadge}</Badge>;
    }
    return <Badge variant="outline">{w.crmWhatsappNoneBadge}</Badge>;
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
            <Badge variant="success" className="font-mono text-xs font-medium">
              {w.crmBadge}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs font-normal">
              {w.crmQuotaLabel}: {listData.quota.used} /{" "}
              {listData.quota.mode === "LIMITED" && listData.quota.limit !== null
                ? listData.quota.limit
                : w.crmQuotaUnlimited}
            </Badge>
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

          <Button
            type="button"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>{w.crmNewContactCta}</span>
          </Button>
        </div>
      </header>

      {/* Listado Estandarizado CRM Omnicanal */}
      <WorkspaceDataTable<CrmContactListItemView>
        testId="contacts-desktop-table"
        locale={locale}
        data={listData.items}
        getRowKey={(c) => c.id}
        page={listData.pagination.page}
        pageSize={limit}
        totalItems={listData.pagination.total}
        onPageChange={(next) => {
          setPage(next);
          void fetchContacts({ nextPage: next });
        }}
        onPageSizeChange={(nextLimit) => {
          setLimit(nextLimit);
          setPage(1);
          void fetchContacts({ nextLimit, nextPage: 1 });
        }}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(nextCol, nextDir) => {
          setSortBy(nextCol);
          setSortDir(nextDir);
          setPage(1);
          void fetchContacts({ nextSortBy: nextCol, nextSortDir: nextDir, nextPage: 1 });
        }}
        searchQuery={query}
        onSearchChange={(next) => {
          setQuery(next);
          setPage(1);
          void fetchContacts({ nextPage: 1, nextQuery: next });
        }}
        searchPlaceholder={w.crmSearchPlaceholder}
        activeFiltersCount={
          (stageFilter !== "all" ? 1 : 0) +
          (sourceFilter !== "all" ? 1 : 0) +
          (windowFilter !== "all" ? 1 : 0) +
          (minRatingFilter ? 1 : 0)
        }
        onResetFilters={() => {
          setQuery("");
          setStageFilter("all");
          setSourceFilter("all");
          setWindowFilter("all");
          setMinRatingFilter("");
          setSortBy("whatsapp_priority");
          setSortDir("desc");
          setPage(1);
          void fetchContacts({
            nextQuery: "",
            nextStage: "all",
            nextSource: "all",
            nextWindow: "all",
            nextMinRating: "",
            nextSortBy: "whatsapp_priority",
            nextSortDir: "desc",
            nextPage: 1,
          });
        }}
        loading={loadingList}
        error={listError}
        onRetry={() => void fetchContacts()}
        filterSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={w.crmFilterAllStages}
              value={stageFilter}
              onChange={(e) => {
                const next = e.target.value;
                setStageFilter(next);
                setPage(1);
                void fetchContacts({ nextPage: 1, nextStage: next });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="all">{w.crmFilterAllStages}</option>
              {CRM_STAGES.map((st) => (
                <option key={st} value={st}>
                  {formatStageLabel(st, locale)}
                </option>
              ))}
            </Select>

            <Select
              aria-label={w.crmFilterAllSources}
              value={sourceFilter}
              onChange={(e) => {
                const next = e.target.value;
                setSourceFilter(next);
                setPage(1);
                void fetchContacts({ nextPage: 1, nextSource: next });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="all">{w.crmFilterAllSources}</option>
              {CRM_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {formatSourceLabel(src, locale)}
                </option>
              ))}
            </Select>

            <Select
              aria-label={w.crmFilterAllWindows}
              value={windowFilter}
              onChange={(e) => {
                const next = e.target.value;
                setWindowFilter(next);
                setPage(1);
                void fetchContacts({ nextPage: 1, nextWindow: next });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="all">{w.crmFilterAllWindows}</option>
              <option value="active">{w.crmFilterWindowActive}</option>
              <option value="expired">{w.crmFilterWindowExpired}</option>
              <option value="none">{w.crmFilterWindowNone}</option>
            </Select>

            <Select
              aria-label={w.crmFilterAllRatings}
              value={minRatingFilter}
              onChange={(e) => {
                const next = e.target.value;
                setMinRatingFilter(next);
                setPage(1);
                void fetchContacts({ nextPage: 1, nextMinRating: next });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="">{w.crmFilterAllRatings}</option>
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={String(stars)}>
                  {w.crmFilterRatingMinPrefix} {stars} {w.crmFilterRatingStarsUnit}
                </option>
              ))}
            </Select>

            <Select
              aria-label={w.crmSortWhatsappPriority}
              value={sortBy}
              onChange={(e) => {
                const next = e.target.value;
                setSortBy(next);
                void fetchContacts({ nextSortBy: next });
              }}
              className="w-auto min-h-[40px] text-xs"
            >
              <option value="whatsapp_priority">{w.crmSortWhatsappPriority}</option>
              <option value="last_inbound">{w.crmSortLastSeen}</option>
              <option value="rating">{w.crmSortRating}</option>
              <option value="created_at">{w.crmSortCreatedAt}</option>
              <option value="full_name">{w.crmSortFullName}</option>
            </Select>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const nextDir = sortDir === "desc" ? "asc" : "desc";
                setSortDir(nextDir);
                void fetchContacts({ nextSortDir: nextDir });
              }}
              className="text-xs font-medium"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
              <span>{sortDir === "desc" ? "DESC" : "ASC"}</span>
            </Button>
          </div>
        }
        emptyState={{
          icon: <Users className="mx-auto h-10 w-10 text-[var(--dsn-text-secondary)]/50" />,
          title: w.crmEmptyTitle,
          description: w.crmEmptyDesc,
        }}
        renderMobileCard={(c) => (
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
              <Badge variant="accent">{formatStageLabel(c.stage, locale)}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {renderWindowBadge(c)}
              <Badge variant="outline">{formatSourceLabel(c.source, locale)}</Badge>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedContactId(c.id)}
                  className="min-h-[36px]"
                >
                  <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                  <span>{w.crmViewDetailCta}</span>
                </Button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget(c)}
                    className="min-h-[36px] px-2.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </article>
        )}
        columns={
          [
            {
              key: "full_name",
              header: w.crmColContact,
              sortable: true,
              renderCell: (c) => (
                <div>
                  <p className="font-semibold text-[var(--dsn-text)]">{c.fullName}</p>
                  {c.companyName && (
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">{c.companyName}</p>
                  )}
                  <p className="font-mono text-[11px] text-[var(--dsn-text-secondary)]">
                    {c.phoneMobile || c.email || "—"}
                  </p>
                </div>
              ),
            },
            {
              key: "source",
              header: w.crmColChannelSource,
              renderCell: (c) => (
                <div>
                  <Badge variant="outline">{formatSourceLabel(c.source, locale)}</Badge>
                  {c.preferredChannel && (
                    <p className="mt-1 text-[11px] text-[var(--dsn-text-secondary)]">
                      {w.crmPreferredLabel}: {formatChannelLabel(c.preferredChannel, locale)}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: "whatsapp_priority",
              header: w.crmColWhatsappWindow,
              sortable: true,
              renderCell: (c) => renderWindowBadge(c),
            },
            {
              key: "stage",
              header: w.crmColStage,
              renderCell: (c) => (
                <Badge variant="accent">{formatStageLabel(c.stage, locale)}</Badge>
              ),
            },
            {
              key: "rating",
              header: w.crmColRating,
              sortable: true,
              isNumeric: true,
              renderCell: (c) =>
                c.currentRatingStars ? (
                  <span className="inline-flex items-center gap-1 font-mono text-amber-400">
                    <Star className="h-3.5 w-3.5 fill-amber-400" />
                    <span>{c.currentRatingStars}/5</span>
                  </span>
                ) : (
                  <span className="text-[var(--dsn-text-secondary)]">—</span>
                ),
            },
            {
              key: "city",
              header: w.crmColCity,
              renderCell: (c) => (
                <span className="text-[var(--dsn-text-secondary)]">
                  {c.defaultAddressSummary ? c.defaultAddressSummary.city : "—"}
                </span>
              ),
            },
            {
              key: "last_inbound",
              header: w.crmColLastSeen,
              sortable: true,
              renderCell: (c) => (
                <span className="text-[var(--dsn-text-secondary)]">
                  {formatShortDateTime(c.lastSeenAt, locale)}
                </span>
              ),
            },
            {
              key: "actions",
              header: w.crmColActions,
              align: "right",
              renderCell: (c) => (
                <div className="inline-flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedContactId(c.id)}
                    className="h-8 min-h-0 px-2.5 text-[11px]"
                  >
                    <Eye className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                    <span>{w.crmViewDetailCta}</span>
                  </Button>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label={`${w.crmDeleteContactCta} ${c.fullName}`}
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(c);
                      }}
                      className="h-8 w-8 min-h-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ),
            },
          ] satisfies WorkspaceTableColumn<CrmContactListItemView>[]
        }
      />

      {/* Modal de Creación Multi-Fuente */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
          closeAriaLabel={w.crmCancelCta}
          aria-label={w.crmCreateModalTitle}
        >
          <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-[var(--dsn-border)] px-6 py-4 pr-12">
            <Users className="h-5 w-5 text-[var(--dsn-accent)]" />
            <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
              {w.crmCreateModalTitle}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateContact} className="flex-1 space-y-4 overflow-y-auto p-6">
            {formError && (
              <Alert variant="error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldFullName} *</Label>
                <Input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldCompanyName}</Label>
                <Input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldSource}</Label>
                <Select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="text-xs"
                >
                  {CRM_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {formatSourceLabel(src, locale)}
                    </option>
                  ))}
                </Select>
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
                  {CRM_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {formatChannelLabel(ch, locale)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2">
                <PhoneE164Input
                  id="create-contact-phone-mobile"
                  label={w.crmFieldPhoneMobile}
                  value={phoneMobile}
                  defaultCountryCode={addrCountryCode}
                  locale={locale}
                  onChange={(next) => setPhoneMobile(next)}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldEmail}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="juan@ejemplo.com"
                  className="text-xs"
                />
              </div>
              <div className="md:col-span-2">
                <PhoneE164Input
                  id="create-contact-phone-secondary"
                  label={w.crmFieldPhoneSecondary}
                  value={phoneSecondary}
                  defaultCountryCode={addrCountryCode}
                  locale={locale}
                  onChange={(next) => setPhoneSecondary(next)}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldStage}</Label>
                <Select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
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
                  placeholder="10203040"
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs font-semibold">{w.crmFieldBirthDate}</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs font-semibold">{w.crmFieldNotes}</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/20 p-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--dsn-text)]">
                <Checkbox
                  checked={includeInitialAddress}
                  onCheckedChange={(checked) => setIncludeInitialAddress(checked === true)}
                />
                <span>{w.crmIncludeInitialAddress}</span>
              </label>

              {includeInitialAddress && (
                <div className="space-y-3">
                  <div>
                    <Label className="mb-1 block text-xs font-semibold">
                      {w.crmAddressLabel} *
                    </Label>
                    <Input
                      type="text"
                      required={includeInitialAddress}
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <GeoAddressFields
                    idPrefix="create-contact-addr"
                    locale={locale}
                    requiredFields={{
                      country: includeInitialAddress,
                      city: includeInitialAddress,
                      addressLine: includeInitialAddress,
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
                    }}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-[var(--dsn-border)] pt-3">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                {w.crmCancelCta}
              </Button>
              <Button
                type="submit"
                disabled={saving}
                loading={saving}
                loadingText={w.crmSavingCta}
              >
                {w.crmSaveCta}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

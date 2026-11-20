"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type {
  AdoptionPlanEligibilityDto,
  CommunityFeedCatalogPage,
  CommunityFeedItemDto,
  PlanQuotaViolationDto,
  TenantCommunityDetailDto,
} from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatCommunityMoney, readApiError } from "./_types";

function formatBytesUi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function describePlanViolation(v: PlanQuotaViolationDto, locale: AdminLocale): string {
  const isEn = locale === "en";
  if (v.dimension === "products") {
    return isEn
      ? `Catalog Products (products): using ${v.currentUsed} of ${v.limitValue}, requires +${v.requiredDelta}.`
      : `Productos en Catálogo (products): usas ${v.currentUsed} de ${v.limitValue} permitido(s), requiere +${v.requiredDelta}.`;
  }
  if (v.dimension === "storage_bytes") {
    return isEn
      ? `Storage Space (storage_bytes): using ${formatBytesUi(v.currentUsed)} of ${formatBytesUi(v.limitValue)}, requires +${formatBytesUi(v.requiredDelta)}.`
      : `Almacenamiento Disponible (storage_bytes): usas ${formatBytesUi(v.currentUsed)} de ${formatBytesUi(v.limitValue)}, requiere +${formatBytesUi(v.requiredDelta)}.`;
  }
  const labelsEs: Record<string, string> = {
    images_per_product: "Imágenes por Producto",
    videos_per_product: "Videos por Producto",
    audios_per_product: "Audios por Producto",
    pdfs_per_product: "PDFs por Producto",
  };
  const labelsEn: Record<string, string> = {
    images_per_product: "Images per Product",
    videos_per_product: "Videos per Product",
    audios_per_product: "Audios per Product",
    pdfs_per_product: "PDFs per Product",
  };
  const label = isEn
    ? labelsEn[v.dimension] ?? v.dimension
    : labelsEs[v.dimension] ?? v.dimension;
  return isEn
    ? `${label} (${v.dimension}): product requires ${v.requiredDelta}, plan maximum is ${v.limitValue}.`
    : `${label} (${v.dimension}): el producto requiere ${v.requiredDelta} y tu plan permite máximo ${v.limitValue}.`;
}

interface CommunityFeedTabProps {
  communities: TenantCommunityDetailDto[];
  locale: AdminLocale;
  isOwner: boolean;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onAdoptedRedirectToClones: () => void;
  onDataMutated: () => Promise<void>;
}

/**
 * Pestaña 1 · Catálogo Compartido multi-comunidad con filtros, márgenes estimados y clonación atómica (`SPEC-15`).
 */
export function CommunityFeedTab({
  communities,
  locale,
  isOwner,
  onSuccessToast,
  onErrorToast,
  onAdoptedRedirectToClones,
  onDataMutated,
}: CommunityFeedTabProps) {
  const dict = getAdminDictionary(locale).community;

  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [compFilter, setCompFilter] = useState<"all" | "simple" | "combo">("all");
  const [onlyNotAdopted, setOnlyNotAdopted] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "popular" | "name" | "suggestedPrice">("recent");
  const [page, setPage] = useState(1);

  const [catalog, setCatalog] = useState<CommunityFeedCatalogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Modal de Clonación (se cierra automáticamente al completar)
  const [adoptTarget, setAdoptTarget] = useState<CommunityFeedItemDto | null>(null);
  const [salePriceInput, setSalePriceInput] = useState("");
  const [costPriceInput, setCostPriceInput] = useState("");
  const [initialStockInput, setInitialStockInput] = useState("10");
  const [initialStatus, setInitialStatus] = useState<"active" | "draft">("active");
  const [includeMediaMode, setIncludeMediaMode] = useState<"all_compatible" | "cover_only" | "none">(
    "all_compatible",
  );
  const [retainLink, setRetainLink] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [adoptModalError, setAdoptModalError] = useState<string | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<{
    key: string;
    data: AdoptionPlanEligibilityDto | null;
    violations: PlanQuotaViolationDto[];
    error: string | null;
  } | null>(null);
  const [adoptPostViolations, setAdoptPostViolations] = useState<PlanQuotaViolationDto[] | null>(
    null,
  );

  const expectedEligibilityKey = adoptTarget
    ? `${adoptTarget.shareId}:${includeMediaMode}`
    : null;
  const checkingEligibility = Boolean(
    expectedEligibilityKey && eligibilityResult?.key !== expectedEligibilityKey,
  );
  const adoptEligibility =
    expectedEligibilityKey && eligibilityResult?.key === expectedEligibilityKey
      ? eligibilityResult.data
      : null;
  const adoptViolations =
    adoptPostViolations ??
    (expectedEligibilityKey && eligibilityResult?.key === expectedEligibilityKey
      ? eligibilityResult.violations
      : []);
  const effectiveAdoptError =
    adoptModalError ??
    (expectedEligibilityKey && eligibilityResult?.key === expectedEligibilityKey
      ? eligibilityResult.error
      : null);

  const loadFeed = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  // Pre-evalúa capacidades del plan del inquilino en tiempo real al abrir el modal o cambiar el modo de medios
  useEffect(() => {
    if (!adoptTarget || !expectedEligibilityKey) return;
    let active = true;
    const targetKey = expectedEligibilityKey;

    fetch(
      `/api/tenant/community/shares/${adoptTarget.shareId}/adopt?includeMediaMode=${encodeURIComponent(
        includeMediaMode,
      )}`,
      { credentials: "include" },
    )
      .then(async (res) => {
        if (!active) return;
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setEligibilityResult({
            key: targetKey,
            data: null,
            violations: Array.isArray(body?.issues) ? body.issues : [],
            error: typeof body?.detail === "string" ? body.detail : null,
          });
          return;
        }
        if (body?.ok && body?.data && typeof body.data.allowed === "boolean") {
          const data = body.data as AdoptionPlanEligibilityDto;
          setEligibilityResult({
            key: targetKey,
            data,
            violations: Array.isArray(data.violations) ? data.violations : [],
            error: null,
          });
        } else {
          setEligibilityResult({
            key: targetKey,
            data: null,
            violations: [],
            error: null,
          });
        }
      })
      .catch(() => {
        if (active) {
          setEligibilityResult({
            key: targetKey,
            data: null,
            violations: [],
            error: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [adoptTarget, includeMediaMode, expectedEligibilityKey]);

  useEffect(() => {
    let active = true;
    const qs = new URLSearchParams();
    if (selectedOrgId !== "all") qs.set("organizationId", selectedOrgId);
    if (searchQ.trim()) qs.set("q", searchQ.trim());
    if (categoryFilter !== "all") qs.set("category", categoryFilter);
    if (compFilter !== "all") qs.set("compositionType", compFilter);
    if (onlyNotAdopted) qs.set("onlyNotAdopted", "true");
    qs.set("sortBy", sortBy);
    qs.set("page", String(page));
    qs.set("limit", "12");

    fetch(`/api/tenant/community/feed?${qs.toString()}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          onErrorToast(await readApiError(res, "Error al cargar el catálogo compartido."));
          return;
        }
        const json = await res.json();
        if (active && json.ok) {
          setCatalog(json.data);
        }
      })
      .catch(() => {
        if (active) {
          onErrorToast("Error de conexión al cargar el catálogo compartido.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedOrgId,
    searchQ,
    categoryFilter,
    compFilter,
    onlyNotAdopted,
    sortBy,
    page,
    refreshTick,
    onErrorToast,
  ]);

  function openAdoptModal(item: CommunityFeedItemDto) {
    setAdoptModalError(null);
    setEligibilityResult(null);
    setAdoptPostViolations(null);
    setAdoptTarget(item);
    setSalePriceInput(String(Math.round(item.suggestedPriceCents / 100)));
    setCostPriceInput(String(Math.round((item.wholesaleCostCents ?? 0) / 100)));
    setInitialStockInput(item.kind === "physical" ? "10" : "0");
    setInitialStatus("active");
    setIncludeMediaMode("all_compatible");
    setRetainLink(true);
  }

  async function handleConfirmAdopt(e: React.FormEvent) {
    e.preventDefault();
    if (!adoptTarget) return;

    const saleCents = Math.max(0, Math.round((Number.parseFloat(salePriceInput) || 0) * 100));
    const costCents = Math.max(0, Math.round((Number.parseFloat(costPriceInput) || 0) * 100));
    const stockVal =
      adoptTarget.kind === "physical" && adoptTarget.compositionType === "simple"
        ? Math.max(0, Number.parseInt(initialStockInput || "0", 10) || 0)
        : null;

    if (
      adoptTarget.minResalePriceCents !== null &&
      saleCents < adoptTarget.minResalePriceCents
    ) {
      const msg = `${dict.minResaleLabel}: ${formatCommunityMoney(
        adoptTarget.minResalePriceCents,
        adoptTarget.currency,
        locale,
      )}`;
      setAdoptModalError(msg);
      onErrorToast(msg);
      return;
    }

    setAdoptModalError(null);
    setAdopting(true);
    try {
      const res = await fetch(`/api/tenant/community/shares/${adoptTarget.shareId}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customSalePriceCents: saleCents,
          customCostPriceCents: costCents,
          initialStock: stockVal,
          initialStatus,
          includeMediaMode,
          retainLink,
          autoSyncAttributes: [],
        }),
      });

      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => null);
        if (Array.isArray(errBody?.issues)) {
          setAdoptPostViolations(errBody.issues as PlanQuotaViolationDto[]);
        }
        const errMsg =
          typeof errBody?.detail === "string" && errBody.detail.trim()
            ? errBody.detail
            : await readApiError(res, "No se pudo clonar el producto.");
        setAdoptModalError(errMsg);
        onErrorToast(errMsg);
        return;
      }

      const json = await res.json();
      const skipped = json.data?.skippedMedia?.length ?? 0;
      const clonedName = adoptTarget.name;

      // Cierre inmediato del modal antes de refrescar listados en segundo plano
      setAdoptTarget(null);
      setAdoptModalError(null);
      setEligibilityResult(null);
      setAdoptPostViolations(null);

      loadFeed();
      void onDataMutated().catch(() => {});

      onSuccessToast(
        skipped > 0
          ? locale === "en"
            ? `"${clonedName}" cloned into your catalog (${skipped} media file(s) skipped due to plan quota).`
            : `"${clonedName}" clonado a tu catálogo (${skipped} archivo(s) omitidos por límite de tu plan).`
          : locale === "en"
            ? `"${clonedName}" cloned into your catalog successfully.`
            : `"${clonedName}" clonado a tu catálogo correctamente.`,
      );
    } catch {
      const netErr = dict.networkErrorClone;
      setAdoptModalError(netErr);
      onErrorToast(netErr);
    } finally {
      setAdopting(false);
    }
  }

  async function handleModerateShare(shareId: string, decision: "approve" | "reject") {
    try {
      const res = await fetch(`/api/tenant/community/shares/${shareId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo moderar la propuesta."));
        return;
      }
      await loadFeed();
      await onDataMutated();
      onSuccessToast(
        decision === "approve"
          ? locale === "en"
            ? "Shared product approved."
            : "Producto compartido aprobado."
          : locale === "en"
            ? "Proposal rejected."
            : "Propuesta rechazada.",
      );
    } catch {
      onErrorToast(dict.networkErrorModerate);
    }
  }

  return (
    <div className="space-y-5">
      {/* Selector de comunidad */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedOrgId("all");
            setPage(1);
          }}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            selectedOrgId === "all"
              ? "bg-[var(--dsn-accent)] text-white"
              : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          {dict.allCommunitiesOption}
        </button>

        {communities.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => {
              setSelectedOrgId(org.id);
              setPage(1);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
              selectedOrgId === org.id
                ? "bg-[var(--dsn-accent)] text-white"
                : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
            }`}
          >
            <span>{org.name}</span>
            <span className="opacity-75">({org.sharesCount})</span>
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5 md:grid-cols-12">
        <div className="relative md:col-span-4">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <Input
            type="text"
            value={searchQ}
            onChange={(e) => {
              setSearchQ(e.target.value);
              setPage(1);
            }}
            placeholder={dict.searchCatalogPlaceholder}
            className="h-9 py-2 pr-3 pl-9 text-xs"
          />
        </div>

        <div className="md:col-span-2">
          <Select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 text-xs"
          >
            <option value="all">{dict.allCategoriesOption}</option>
            {(catalog?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        <div className="md:col-span-2">
          <Select
            value={compFilter}
            onChange={(e) => {
              setCompFilter(e.target.value as "all" | "simple" | "combo");
              setPage(1);
            }}
            className="h-9 text-xs"
          >
            <option value="all">{dict.allCompositionsOption}</option>
            <option value="simple">{dict.simpleTypeLabel}</option>
            <option value="combo">{dict.comboTypeLabel}</option>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-9 text-xs"
          >
            <option value="recent">{dict.sortRecent}</option>
            <option value="popular">{dict.sortPopular}</option>
            <option value="name">{dict.sortName}</option>
            <option value="suggestedPrice">{dict.sortPrice}</option>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2 md:col-span-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--dsn-text)]">
            <Checkbox
              checked={onlyNotAdopted}
              onCheckedChange={(checked) => {
                setOnlyNotAdopted(checked === true);
                setPage(1);
              }}
            />
            <span>{dict.onlyNewToggle}</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadFeed()}
            aria-label="Actualizar"
            className="h-8 w-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[var(--dsn-accent)] ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Propuestas pendientes de moderación (visibles para líderes/co-líderes y autores) */}
      {catalog && catalog.pendingModerationItems.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span>
              {dict.pendingApprovalBadge} ({catalog.pendingModerationItems.length})
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.pendingModerationItems.map((p) => {
              const myOrg = communities.find((o) => o.id === p.organizationId);
              const canModerate =
                isOwner &&
                (myOrg?.myRole === "originator" || myOrg?.myRole === "co_leader");
              return (
                <div
                  key={p.shareId}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--dsn-text)] truncate">{p.name}</p>
                    <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                      {p.sharerDisplayName} · {p.organizationName}
                    </p>
                  </div>
                  {canModerate && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleModerateShare(p.shareId, "approve")}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white"
                      >
                        <Check className="h-3 w-3" />
                        <span>{dict.approveShareAction}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleModerateShare(p.shareId, "reject")}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                      >
                        <XCircle className="h-3 w-3" />
                        <span>{dict.rejectShareAction}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Grid de productos compartidos */}
      {!catalog || catalog.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center space-y-2">
          <Package className="mx-auto h-8 w-8 text-[var(--dsn-text-secondary)]" />
          <p className="text-sm font-semibold text-[var(--dsn-text)]">
            {communities.length === 0
              ? locale === "en"
                ? "You haven't joined any community yet"
                : "Aún no te has unido a ninguna comunidad"
              : locale === "en"
                ? "No shared products match these filters"
                : "No hay productos compartidos con estos filtros"}
          </p>
          <p className="text-xs text-[var(--dsn-text-secondary)]">
            {locale === "en"
              ? "Explore open communities or enter an invite code under the Network tab."
              : "Explora comunidades abiertas o ingresa con un código en la pestaña Mis Comunidades y Red."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {catalog.items.map((item) => (
            <article
              key={item.shareId}
              className="flex flex-col justify-between rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] overflow-hidden transition-shadow hover:shadow-md"
            >
              <div>
                {/* Imagen / Portada */}
                <div className="relative aspect-[16/9] w-full bg-[var(--dsn-surface-secondary)] flex items-center justify-center overflow-hidden">
                  {item.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverImageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-[var(--dsn-text-secondary)]/50" />
                  )}

                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--dsn-surface)]/95 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--dsn-text)] shadow-xs border border-[var(--dsn-border)]">
                      {item.organizationName}
                    </span>
                    {item.compositionType === "combo" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--dsn-accent)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        <Layers className="h-3 w-3" />
                        {dict.comboTypeLabel} ({item.comboComponents.length})
                      </span>
                    )}
                  </div>

                  <div className="absolute top-2.5 right-2.5">
                    <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
                      v{item.currentVersion}
                    </span>
                  </div>
                </div>

                {/* Cuerpo de tarjeta */}
                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-[var(--dsn-text)] line-clamp-1">
                        {item.name}
                      </h3>
                      {item.suggestedMarginPercent !== null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                          <TrendingUp className="h-3 w-3" />
                          {item.suggestedMarginPercent}%
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--dsn-text-secondary)]">
                      {item.sharerDisplayName}
                      {item.category ? ` · ${item.category}` : ""}
                      {item.sku ? ` · SKU ${item.sku}` : ""}
                    </p>
                  </div>

                  <p className="text-xs text-[var(--dsn-text-secondary)] line-clamp-2">
                    {item.description}
                  </p>

                  {item.comboComponents.length > 0 && (
                    <div className="rounded-lg bg-[var(--dsn-surface-secondary)]/60 p-2 text-[11px] text-[var(--dsn-text-secondary)]">
                      {item.comboComponents.map((c) => `${c.quantity}× ${c.name}`).join(" · ")}
                    </div>
                  )}

                  {/* Bloques de economía */}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-2.5 text-xs">
                    <div>
                      <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.wholesaleCostLabel}
                      </span>
                      <span className="font-semibold text-[var(--dsn-text)]">
                        {item.wholesaleCostCents !== null
                          ? formatCommunityMoney(item.wholesaleCostCents, item.currency, locale)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[var(--dsn-text-secondary)]">
                        {dict.suggestedPriceLabel}
                      </span>
                      <span className="font-bold text-[var(--dsn-accent)]">
                        {formatCommunityMoney(item.suggestedPriceCents, item.currency, locale)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--dsn-text-secondary)]">
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {item.adoptionsCount} {dict.clonesCountSuffix}
                    </span>
                    {item.referenceStock !== null && (
                      <span>
                        {dict.referenceStockLabel}: <strong>{item.referenceStock}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Pie / Acciones */}
              <div className="flex items-center justify-between gap-2 border-t border-[var(--dsn-border)] p-3.5">
                {item.isOwnShare ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--dsn-text-secondary)]">
                    <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)]" />
                    {dict.ownShareBadge}
                  </span>
                ) : item.alreadyAdopted ? (
                  <Button
                    type="button"
                    variant={item.hasUpdateAvailable ? "warning" : "secondary"}
                    size="sm"
                    onClick={onAdoptedRedirectToClones}
                    className="w-full"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {item.hasUpdateAvailable ? dict.updateAvailableBadge : dict.adoptedBadge}
                    </span>
                  </Button>
                ) : isOwner ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openAdoptModal(item)}
                    className="w-full"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{dict.cloneAction}</span>
                  </Button>
                ) : (
                  <span className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {locale === "en" ? "Owner action required" : "Solo propietario"}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Paginación */}
      {catalog && catalog.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[var(--dsn-text-secondary)]">
            {page} / {catalog.totalPages} ({catalog.total})
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {locale === "en" ? "Previous" : "Anterior"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= catalog.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {locale === "en" ? "Next" : "Siguiente"}
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Clonación (se cierra automáticamente al completar) */}
      <Dialog
        open={Boolean(adoptTarget)}
        onOpenChange={(open) => {
          if (!open && !adopting) setAdoptTarget(null);
        }}
      >
        <DialogContent
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
          closeAriaLabel={locale === "en" ? "Cancel" : "Cancelar"}
          disableEscapeKeyDown={adopting}
          disableInteractOutside={adopting}
        >
          {adoptTarget && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-base font-bold text-[var(--dsn-text)]">
                  {dict.adoptModalTitle}
                </DialogTitle>
                <DialogDescription className="text-xs text-[var(--dsn-text-secondary)]">
                  {dict.adoptModalSubtitle}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs">
                <div className="font-semibold text-[var(--dsn-text)]">
                  {adoptTarget.name} (v{adoptTarget.currentVersion})
                </div>
                <div className="text-[var(--dsn-text-secondary)]">
                  {adoptTarget.sharerDisplayName} · {adoptTarget.organizationName}
                </div>
                {adoptTarget.minResalePriceCents !== null && (
                  <div className="text-[11px] font-medium text-[var(--dsn-accent)]">
                    {dict.minResaleLabel}:{" "}
                    {formatCommunityMoney(adoptTarget.minResalePriceCents, adoptTarget.currency, locale)}
                  </div>
                )}
              </div>

              {/* Evaluación de capacidades del plan vigente (RN-SPEC-15-04) */}
              {checkingEligibility ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-3 py-2 text-[11px] text-[var(--dsn-text-secondary)]">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--dsn-accent)]" />
                  <span>{dict.adoptCheckingPlan}</span>
                </div>
              ) : (
                adoptEligibility && (
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 px-3 py-2 text-[11px] sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--dsn-text-secondary)]">
                        {dict.adoptProductsQuotaLabel}:
                      </span>
                      <span
                        className={`font-semibold ${
                          adoptEligibility.violations.some((v) => v.dimension === "products")
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-[var(--dsn-text)]"
                        }`}
                      >
                        {adoptEligibility.summary.productsUsed} (+{adoptEligibility.summary.productsNeeded}) /{" "}
                        {adoptEligibility.summary.productsLimit !== null
                          ? adoptEligibility.summary.productsLimit
                          : dict.adoptUnlimitedLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--dsn-text-secondary)]">
                        {dict.adoptStorageQuotaLabel}:
                      </span>
                      <span
                        className={`font-semibold ${
                          adoptEligibility.violations.some((v) => v.dimension === "storage_bytes")
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-[var(--dsn-text)]"
                        }`}
                      >
                        {formatBytesUi(adoptEligibility.summary.storageUsedBytes)} (+
                        {formatBytesUi(adoptEligibility.summary.storageNeededBytes)}) /{" "}
                        {adoptEligibility.summary.storageLimitBytes !== null
                          ? formatBytesUi(adoptEligibility.summary.storageLimitBytes)
                          : dict.adoptUnlimitedLabel}
                      </span>
                    </div>
                  </div>
                )
              )}

              {(adoptViolations.length > 0 || effectiveAdoptError) && (
                <Alert variant="destructive" className="text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-2 text-xs">
                    {adoptViolations.length > 0 ? (
                      <>
                        <p className="font-semibold">{dict.adoptPlanBlockedTitle}</p>
                        <ul className="list-disc space-y-1 pl-4">
                          {adoptViolations.map((v) => (
                            <li key={v.dimension}>{describePlanViolation(v, locale)}</li>
                          ))}
                        </ul>
                        {!adoptViolations.some((v) => v.dimension === "products") && (
                          <p className="text-[11px] opacity-90">{dict.adoptMediaOnlyHint}</p>
                        )}
                        <div className="pt-1">
                          <Link
                            href="/workspace/billing"
                            className="inline-flex items-center rounded-md border border-current px-2.5 py-1 text-[11px] font-semibold hover:opacity-80"
                          >
                            {dict.adoptUpgradePlanCta}
                          </Link>
                        </div>
                      </>
                    ) : (
                      <p>{effectiveAdoptError}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleConfirmAdopt} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="block text-xs font-medium">
                      {dict.adoptSalePriceLabel} ({adoptTarget.currency})
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={salePriceInput}
                      onChange={(e) => setSalePriceInput(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="block text-xs font-medium">
                      {dict.adoptCostPriceLabel} ({adoptTarget.currency})
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      required
                      value={costPriceInput}
                      onChange={(e) => setCostPriceInput(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {adoptTarget.kind === "physical" && adoptTarget.compositionType === "simple" && (
                    <div className="space-y-1">
                      <Label className="block text-xs font-medium">
                        {dict.adoptInitialStockLabel}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={initialStockInput}
                        onChange={(e) => setInitialStockInput(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="block text-xs font-medium">
                      {dict.adoptStatusLabel}
                    </Label>
                    <Select
                      value={initialStatus}
                      onChange={(e) => setInitialStatus(e.target.value as "active" | "draft")}
                      className="text-xs"
                    >
                      <option value="active">{dict.adoptStatusActive}</option>
                      <option value="draft">{dict.adoptStatusDraft}</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="block text-xs font-medium">
                    {dict.adoptMediaModeLabel}
                  </Label>
                  <Select
                    value={includeMediaMode}
                    onChange={(e) => {
                      setAdoptModalError(null);
                      setAdoptPostViolations(null);
                      setIncludeMediaMode(e.target.value as typeof includeMediaMode);
                    }}
                    className="text-xs"
                  >
                    <option value="all_compatible">{dict.adoptMediaAll}</option>
                    <option value="cover_only">{dict.adoptMediaCover}</option>
                    <option value="none">{dict.adoptMediaNone}</option>
                  </Select>
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3 text-xs text-[var(--dsn-text)]">
                  <Checkbox
                    checked={retainLink}
                    onCheckedChange={(checked) => setRetainLink(checked === true)}
                    className="mt-0.5"
                  />
                  <span>{dict.adoptRetainLinkLabel}</span>
                </label>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={adopting}
                    onClick={() => {
                      setAdoptTarget(null);
                      setAdoptModalError(null);
                    }}
                  >
                    {locale === "en" ? "Cancel" : "Cancelar"}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      adopting ||
                      checkingEligibility ||
                      (adoptEligibility !== null && !adoptEligibility.allowed)
                    }
                    loading={adopting}
                    loadingText={dict.adoptCloningCta}
                  >
                    {dict.adoptConfirmCta}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

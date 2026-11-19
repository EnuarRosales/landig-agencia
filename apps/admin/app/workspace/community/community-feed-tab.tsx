"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
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
  X,
  XCircle,
} from "lucide-react";
import type {
  CommunityFeedCatalogPage,
  CommunityFeedItemDto,
  TenantCommunityDetailDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatCommunityMoney, readApiError } from "./_types";

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

  const loadFeed = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

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
      onErrorToast(
        `${dict.minResaleLabel}: ${formatCommunityMoney(
          adoptTarget.minResalePriceCents,
          adoptTarget.currency,
          locale,
        )}`,
      );
      return;
    }

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
        onErrorToast(await readApiError(res, "No se pudo clonar el producto."));
        return;
      }

      const json = await res.json();
      const skipped = json.data?.skippedMedia?.length ?? 0;
      const clonedName = adoptTarget.name;
      setAdoptTarget(null);
      await loadFeed();
      await onDataMutated();

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
      onErrorToast(dict.networkErrorClone);
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
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5">
        <div className="md:col-span-4 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--dsn-text-secondary)]" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => {
              setSearchQ(e.target.value);
              setPage(1);
            }}
            placeholder={dict.searchCatalogPlaceholder}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] pl-9 pr-3 py-2 text-xs text-[var(--dsn-text)]"
          />
        </div>

        <div className="md:col-span-2">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
          >
            <option value="all">{dict.allCategoriesOption}</option>
            {(catalog?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={compFilter}
            onChange={(e) => {
              setCompFilter(e.target.value as "all" | "simple" | "combo");
              setPage(1);
            }}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
          >
            <option value="all">{dict.allCompositionsOption}</option>
            <option value="simple">{dict.simpleTypeLabel}</option>
            <option value="combo">{dict.comboTypeLabel}</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
          >
            <option value="recent">{dict.sortRecent}</option>
            <option value="popular">{dict.sortPopular}</option>
            <option value="name">{dict.sortName}</option>
            <option value="suggestedPrice">{dict.sortPrice}</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyNotAdopted}
              onChange={(e) => {
                setOnlyNotAdopted(e.target.checked);
                setPage(1);
              }}
              className="accent-[var(--dsn-accent)]"
            />
            <span>{dict.onlyNewToggle}</span>
          </label>
          <button
            type="button"
            onClick={() => void loadFeed()}
            aria-label="Actualizar"
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-2 text-[var(--dsn-accent)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
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
              <div className="border-t border-[var(--dsn-border)] p-3.5 flex items-center justify-between gap-2">
                {item.isOwnShare ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--dsn-text-secondary)]">
                    <CheckCircle2 className="h-4 w-4 text-[var(--dsn-accent)]" />
                    {dict.ownShareBadge}
                  </span>
                ) : item.alreadyAdopted ? (
                  <button
                    type="button"
                    onClick={onAdoptedRedirectToClones}
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                      item.hasUpdateAvailable
                        ? "bg-amber-500 text-white"
                        : "border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] text-[var(--dsn-text)]"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {item.hasUpdateAvailable ? dict.updateAvailableBadge : dict.adoptedBadge}
                    </span>
                  </button>
                ) : isOwner ? (
                  <button
                    type="button"
                    onClick={() => openAdoptModal(item)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{dict.cloneAction}</span>
                  </button>
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
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] disabled:opacity-40"
            >
              {locale === "en" ? "Previous" : "Anterior"}
            </button>
            <button
              type="button"
              disabled={page >= catalog.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--dsn-text)] disabled:opacity-40"
            >
              {locale === "en" ? "Next" : "Siguiente"}
            </button>
          </div>
        </div>
      )}

      {/* Modal de Clonación (se cierra automáticamente al completar) */}
      {adoptTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {dict.adoptModalTitle}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {dict.adoptModalSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !adopting && setAdoptTarget(null)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)] hover:bg-[var(--dsn-surface-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/50 p-3 text-xs space-y-1">
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

            <form onSubmit={handleConfirmAdopt} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--dsn-text)]">
                    {dict.adoptSalePriceLabel} ({adoptTarget.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--dsn-text)]">
                    {dict.adoptCostPriceLabel} ({adoptTarget.currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={costPriceInput}
                    onChange={(e) => setCostPriceInput(e.target.value)}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adoptTarget.kind === "physical" && adoptTarget.compositionType === "simple" && (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--dsn-text)]">
                      {dict.adoptInitialStockLabel}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={initialStockInput}
                      onChange={(e) => setInitialStockInput(e.target.value)}
                      className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--dsn-text)]">
                    {dict.adoptStatusLabel}
                  </label>
                  <select
                    value={initialStatus}
                    onChange={(e) => setInitialStatus(e.target.value as "active" | "draft")}
                    className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                  >
                    <option value="active">{dict.adoptStatusActive}</option>
                    <option value="draft">{dict.adoptStatusDraft}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--dsn-text)]">
                  {dict.adoptMediaModeLabel}
                </label>
                <select
                  value={includeMediaMode}
                  onChange={(e) => setIncludeMediaMode(e.target.value as typeof includeMediaMode)}
                  className="w-full rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-2 text-xs text-[var(--dsn-text)]"
                >
                  <option value="all_compatible">{dict.adoptMediaAll}</option>
                  <option value="cover_only">{dict.adoptMediaCover}</option>
                  <option value="none">{dict.adoptMediaNone}</option>
                </select>
              </div>

              <label className="flex items-start gap-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3 text-xs text-[var(--dsn-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={retainLink}
                  onChange={(e) => setRetainLink(e.target.checked)}
                  className="mt-0.5 accent-[var(--dsn-accent)]"
                />
                <span>{dict.adoptRetainLinkLabel}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={adopting}
                  onClick={() => setAdoptTarget(null)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={adopting}
                  className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {adopting ? dict.adoptCloningCta : dict.adoptConfirmCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

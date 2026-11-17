"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  GitCompare,
  Lock,
  Package,
  RefreshCw,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import type {
  AdoptionDiffResultDto,
  MyAdoptionItemDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { ConfirmationModal } from "@/components/confirmation-modal";
import {
  formatCommunityMoney,
  readApiError,
  SAFE_AUTO_SYNC_ATTRIBUTES,
} from "./_types";

interface CommunityClonesTabProps {
  locale: AdminLocale;
  isOwner: boolean;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

/**
 * Pestaña 2 · Gestión de Clones Adoptados, Políticas de Auto-Sync Seguras y Comparador Visual de Versiones (`SPEC-15-D08`).
 */
export function CommunityClonesTab({
  locale,
  isOwner,
  onSuccessToast,
  onErrorToast,
}: CommunityClonesTabProps) {
  const dict = getAdminDictionary(locale).community;

  const [adoptions, setAdoptions] = useState<MyAdoptionItemDto[]>([]);
  const [onlyOutdated, setOnlyOutdated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Modal Diff
  const [diffData, setDiffData] = useState<AdoptionDiffResultDto | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [selectedSyncAttrs, setSelectedSyncAttrs] = useState<string[]>([]);
  const [applySuggestedPrice, setApplySuggestedPrice] = useState(false);
  const [applyWholesaleCost, setApplyWholesaleCost] = useState(false);
  const [syncingDiff, setSyncingDiff] = useState(false);

  // Modal Desvincular
  const [unlinkTarget, setUnlinkTarget] = useState<MyAdoptionItemDto | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const loadAdoptions = useCallback(() => {
    setLoading(true);
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const qs = onlyOutdated ? "?onlyOutdated=true" : "";
    fetch(`/api/tenant/community/adoptions${qs}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          onErrorToast(await readApiError(res, "Error al cargar tus clones."));
          return;
        }
        const json = await res.json();
        if (active && json.ok) {
          setAdoptions(json.data);
        }
      })
      .catch(() => {
        if (active) {
          onErrorToast("Error de red al cargar clones adoptados.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onlyOutdated, refreshTick, onErrorToast]);

  async function openDiffModal(adoption: MyAdoptionItemDto) {
    setLoadingDiff(true);
    setDiffData(null);
    try {
      const res = await fetch(`/api/tenant/community/adoptions/${adoption.adoptionId}/diff`, {
        credentials: "include",
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo cargar el comparador."));
        return;
      }
      const json = await res.json();
      if (json.ok) {
        const diff = json.data as AdoptionDiffResultDto;
        setDiffData(diff);
        setSelectedSyncAttrs(
          diff.fields
            .filter((f) => f.kind === "safe" && f.differsFromCurrentClone)
            .map((f) => f.attribute),
        );
        setApplySuggestedPrice(false);
        setApplyWholesaleCost(false);
      }
    } catch {
      onErrorToast("Error de red al consultar cambios.");
    } finally {
      setLoadingDiff(false);
    }
  }

  async function handleConfirmSelectiveSync(e: React.FormEvent) {
    e.preventDefault();
    if (!diffData) return;

    setSyncingDiff(true);
    try {
      const res = await fetch(`/api/tenant/community/adoptions/${diffData.adoptionId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          attributes: selectedSyncAttrs,
          applySuggestedPrice,
          applyWholesaleCost,
          syncMedia: selectedSyncAttrs.includes("media"),
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo sincronizar el clon."));
        return;
      }
      setDiffData(null);
      await loadAdoptions();
      onSuccessToast(
        locale === "en"
          ? "Selected fields synced successfully."
          : "Campos seleccionados sincronizados correctamente.",
      );
    } catch {
      onErrorToast("Error de red durante la sincronización.");
    } finally {
      setSyncingDiff(false);
    }
  }

  async function handleToggleAutoSync(adoption: MyAdoptionItemDto, attrKey: string) {
    if (!isOwner || !adoption.linkActive) return;
    const current = new Set(adoption.autoSyncAttributes);
    if (current.has(attrKey)) current.delete(attrKey);
    else current.add(attrKey);

    try {
      const res = await fetch(`/api/tenant/community/adoptions/${adoption.adoptionId}/policies`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ autoSyncAttributes: Array.from(current) }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo actualizar la política."));
        return;
      }
      await loadAdoptions();
    } catch {
      onErrorToast("Error de red al guardar política.");
    }
  }

  async function handleConfirmUnlink() {
    if (!unlinkTarget) return;
    setUnlinking(true);
    setUnlinkError(null);
    try {
      const res = await fetch(`/api/tenant/community/adoptions/${unlinkTarget.adoptionId}/link`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "No se pudo desvincular."));
      }
      setUnlinkTarget(null);
      await loadAdoptions();
      onSuccessToast(
        locale === "en"
          ? "Clone unlinked. Your product stays active independently."
          : "Clon desvinculado. El producto sigue activo en tu catálogo.",
      );
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setUnlinking(false);
    }
  }

  function renderAttrLabel(attr: string): string {
    const labels = dict.attrLabels as Record<string, string>;
    return labels[attr] ?? attr;
  }

  function renderDiffPreview(val: unknown): string {
    if (val === null || val === undefined || val === "") return "—";
    if (Array.isArray(val)) return `${val.length} elemento(s)`;
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-3.5">
        <div className="flex items-center gap-2 text-xs text-[var(--dsn-text-secondary)]">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{dict.clonesProtectedNote}</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--dsn-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyOutdated}
              onChange={(e) => setOnlyOutdated(e.target.checked)}
              className="accent-[var(--dsn-accent)]"
            />
            <span>{dict.updateAvailableBadge}</span>
          </label>
          <button
            type="button"
            onClick={() => void loadAdoptions()}
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-2 text-[var(--dsn-accent)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {adoptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center space-y-2">
          <Package className="mx-auto h-8 w-8 text-[var(--dsn-text-secondary)]" />
          <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.clonesEmptyTitle}</p>
          <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.clonesEmptyDesc}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {adoptions.map((adoption) => (
            <div
              key={adoption.adoptionId}
              className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-14 w-14 rounded-xl bg-[var(--dsn-surface-secondary)] overflow-hidden flex items-center justify-center shrink-0">
                    {adoption.cloneCoverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={adoption.cloneCoverImageUrl}
                        alt={adoption.cloneName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-[var(--dsn-text-secondary)]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--dsn-text)] truncate">
                        {adoption.cloneName}
                      </h3>
                      {adoption.hasUpdateAvailable && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {dict.updateAvailableBadge} (v{adoption.adoptedVersion} → v
                          {adoption.latestVersion})
                        </span>
                      )}
                      {!adoption.linkActive && (
                        <span className="inline-flex items-center rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          {locale === "en" ? "Unlinked" : "Desvinculado"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--dsn-text-secondary)]">
                      {adoption.organizationName} · {adoption.sharerDisplayName} ·{" "}
                      {formatCommunityMoney(adoption.clonePriceCents, adoption.currency, locale)} ·{" "}
                      {dict.clonesVersionLabel}: v{adoption.adoptedVersion} /{" "}
                      {dict.clonesLatestVersionLabel}: v{adoption.latestVersion}
                    </p>
                  </div>
                </div>

                {isOwner && adoption.linkActive && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={loadingDiff}
                      onClick={() => void openDiffModal(adoption)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dsn-accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      <span>{dict.reviewUpdateAction}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUnlinkError(null);
                        setUnlinkTarget(adoption);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-3 py-2 text-xs font-semibold text-[var(--dsn-text-secondary)] hover:text-rose-600"
                    >
                      <Unlink className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                      <span>{dict.clonesUnlinkAction}</span>
                    </button>
                  </div>
                )}
              </div>

              {adoption.latestChangelog && (
                <div className="rounded-lg bg-[var(--dsn-surface-secondary)]/60 px-3 py-2 text-xs text-[var(--dsn-text-secondary)]">
                  <strong>v{adoption.latestVersion}:</strong> {adoption.latestChangelog}
                </div>
              )}

              {/* Políticas de auto-sync seguras por atributo */}
              {adoption.linkActive && (
                <div className="border-t border-[var(--dsn-border)] pt-3 space-y-2">
                  <span className="text-[11px] font-semibold text-[var(--dsn-text-secondary)] block">
                    {dict.clonesAutoSyncTitle}:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SAFE_AUTO_SYNC_ATTRIBUTES.map((attr) => {
                      const active = adoption.autoSyncAttributes.includes(attr);
                      return (
                        <button
                          key={attr}
                          type="button"
                          disabled={!isOwner}
                          onClick={() => void handleToggleAutoSync(adoption, attr)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            active
                              ? "bg-[var(--dsn-accent)]/15 text-[var(--dsn-accent)] border border-[var(--dsn-accent)]/30"
                              : "border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 text-[var(--dsn-text-secondary)]"
                          }`}
                        >
                          {active && <CheckCircle2 className="h-3 w-3" />}
                          <span>{renderAttrLabel(attr)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Comparador de Diff y Sincronización */}
      {diffData && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[var(--dsn-text)]">
                  {dict.diffModalTitle}
                </h3>
                <p className="text-xs text-[var(--dsn-text-secondary)]">
                  {diffData.cloneName} (v{diffData.adoptedVersion} → v{diffData.latestVersion})
                </p>
              </div>
              <button
                type="button"
                onClick={() => !syncingDiff && setDiffData(null)}
                className="rounded-lg p-1 text-[var(--dsn-text-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel de Valores Protegidos */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-200">
                <Lock className="h-4 w-4" />
                <span>
                  {dict.diffProtectedBadge}:{" "}
                  {formatCommunityMoney(diffData.protectedSnapshot.memberPriceCents, "COP", locale)} ·
                  Stock: {diffData.protectedSnapshot.memberStockQuantity ?? "∞"}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSelectiveSync} className="space-y-3">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {diffData.fields
                  .filter((f) => f.kind === "safe")
                  .map((field) => {
                    const checked = selectedSyncAttrs.includes(field.attribute);
                    return (
                      <label
                        key={field.attribute}
                        className={`block rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                          field.differsFromCurrentClone
                            ? "border-[var(--dsn-accent)]/40 bg-[var(--dsn-accent)]/5"
                            : "border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="inline-flex items-center gap-2 font-semibold text-[var(--dsn-text)]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedSyncAttrs((prev) =>
                                  e.target.checked
                                    ? [...prev, field.attribute]
                                    : prev.filter((k) => k !== field.attribute),
                                )
                              }
                              className="accent-[var(--dsn-accent)]"
                            />
                            <span>{renderAttrLabel(field.attribute)}</span>
                          </span>
                          {field.differsFromCurrentClone && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--dsn-accent)]">
                              <ArrowRightLeft className="h-3 w-3" />
                              {locale === "en" ? "Changed" : "Modificado"}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--dsn-text-secondary)]">
                          <div className="rounded-lg bg-[var(--dsn-surface)] p-2 border border-[var(--dsn-border)]">
                            <span className="font-medium block mb-0.5">
                              {dict.diffCurrentColumn}
                            </span>
                            <span className="line-clamp-2">{renderDiffPreview(field.currentValue)}</span>
                          </div>
                          <div className="rounded-lg bg-[var(--dsn-surface)] p-2 border border-[var(--dsn-border)]">
                            <span className="font-medium block mb-0.5">
                              {dict.diffIncomingColumn}
                            </span>
                            <span className="line-clamp-2">{renderDiffPreview(field.incomingValue)}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>

              <div className="space-y-2 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 p-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applySuggestedPrice}
                    onChange={(e) => setApplySuggestedPrice(e.target.checked)}
                    className="accent-[var(--dsn-accent)]"
                  />
                  <span>
                    {dict.diffApplySuggestedPrice} (
                    {formatCommunityMoney(
                      diffData.protectedSnapshot.incomingSuggestedPriceCents,
                      "COP",
                      locale,
                    )}
                    )
                  </span>
                </label>

                {diffData.protectedSnapshot.incomingWholesaleCostCents !== null && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyWholesaleCost}
                      onChange={(e) => setApplyWholesaleCost(e.target.checked)}
                      className="accent-[var(--dsn-accent)]"
                    />
                    <span>
                      {dict.diffApplyWholesaleCost} (
                      {formatCommunityMoney(
                        diffData.protectedSnapshot.incomingWholesaleCostCents,
                        "COP",
                        locale,
                      )}
                      )
                    </span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={syncingDiff}
                  onClick={() => setDiffData(null)}
                  className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)]"
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </button>
                <button
                  type="submit"
                  disabled={syncingDiff}
                  className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {dict.diffApplyCta}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación Desvincular */}
      <ConfirmationModal
        isOpen={Boolean(unlinkTarget)}
        onClose={() => !unlinking && setUnlinkTarget(null)}
        onConfirm={() => void handleConfirmUnlink()}
        title={dict.confirmUnlinkTitle}
        subtitle={unlinkTarget?.cloneName || ""}
        variant="warning"
        details={
          unlinkTarget
            ? [
                { label: dict.communityLabel, value: unlinkTarget.organizationName },
                {
                  label: dict.clonesVersionLabel,
                  value: `v${unlinkTarget.adoptedVersion}`,
                },
              ]
            : []
        }
        warningTitle={dict.confirmUnlinkTitle}
        warningMessage={dict.confirmUnlinkDesc}
        confirmText={dict.clonesUnlinkAction}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={unlinking}
        error={unlinkError}
      />
    </div>
  );
}

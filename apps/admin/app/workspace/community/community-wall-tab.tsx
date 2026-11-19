"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  EyeOff,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import type {
  ClientSharingProfileDto,
  TenantCommunityDetailDto,
} from "@mocter/domain";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatCommunityDate, readApiError } from "./_types";

interface SerializedFeedPost {
  id: string;
  organizationId: string;
  organizationName?: string;
  body: string;
  status: string;
  publishedAt: string | null;
  createdAt?: string;
  authorRole?: string;
  author: {
    clientId: string;
    displayName: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    socialLinks?: Record<string, string>;
  };
}

interface CommunityWallTabProps {
  communities: TenantCommunityDetailDto[];
  locale: AdminLocale;
  isOwner: boolean;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

/**
 * Pestaña 3 · Muro Social y Novedades B2B con Moderación (pre/post/none) y Perfil de Privacidad (`SPEC-15`).
 */
export function CommunityWallTab({
  communities,
  locale,
  isOwner,
  onSuccessToast,
  onErrorToast,
}: CommunityWallTabProps) {
  const dict = getAdminDictionary(locale).community;

  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [composeOrgIdInput, setComposeOrgIdInput] = useState<string>(communities[0]?.id ?? "");
  const composeOrgId = communities.some((c) => c.id === composeOrgIdInput)
    ? composeOrgIdInput
    : (communities[0]?.id ?? "");
  const [postBody, setPostBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [posts, setPosts] = useState<SerializedFeedPost[]>([]);

  const [profile, setProfile] = useState<ClientSharingProfileDto | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadPosts = useCallback(() => {
    setLoadingPosts(true);
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const qs =
      selectedOrgId !== "all" ? `?organizationId=${encodeURIComponent(selectedOrgId)}` : "";
    fetch(`/api/tenant/community/posts${qs}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          onErrorToast(await readApiError(res, dict.networkErrorLoadPosts));
          return;
        }
        const json = await res.json();
        if (active && json.ok) {
          setPosts(json.data);
        }
      })
      .catch(() => {
        if (active) onErrorToast(dict.networkErrorLoadPosts);
      })
      .finally(() => {
        if (active) setLoadingPosts(false);
      });

    return () => {
      active = false;
    };
  }, [selectedOrgId, refreshTick, onErrorToast, dict.networkErrorLoadPosts]);

  useEffect(() => {
    let active = true;
    fetch("/api/tenant/community/sharing-profile", {
      credentials: "include",
    })
      .then(async (res) => {
        if (!active || !res.ok) return;
        const json = await res.json();
        if (active && json.ok) setProfile(json.data);
      })
      .catch(() => {
        // Silencioso en carga inicial de privacidad
      });

    return () => {
      active = false;
    };
  }, []);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!composeOrgId || !postBody.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/tenant/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: composeOrgId,
          body: postBody.trim(),
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo publicar en el muro."));
        return;
      }
      const json = await res.json();
      setPostBody("");
      await loadPosts();
      onSuccessToast(
        json.data?.status === "pending_review"
          ? locale === "en"
            ? "Post sent for moderator approval."
            : "Publicación enviada a revisión de moderación."
          : locale === "en"
            ? "Post published to the community wall."
            : "Mensaje publicado en el muro.",
      );
    } catch {
      onErrorToast(dict.networkErrorPublishPost);
    } finally {
      setPublishing(false);
    }
  }

  async function handleModeratePost(postId: string, action: "approve" | "reject" | "hide") {
    try {
      const res = await fetch(`/api/tenant/community/posts/${postId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "No se pudo moderar la publicación."));
        return;
      }
      await loadPosts();
      onSuccessToast(
        locale === "en" ? "Moderation updated." : "Estado de publicación actualizado.",
      );
    } catch {
      onErrorToast(dict.networkErrorModeratePost);
    }
  }

  async function handleSavePrivacy(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/tenant/community/sharing-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shareEmail: profile.shareEmail,
          sharePhone: profile.sharePhone,
          shareAddress: profile.shareAddress,
          shareSocialLinks: profile.shareSocialLinks,
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, "Error al guardar privacidad."));
        return;
      }
      await loadPosts();
      onSuccessToast(
        locale === "en" ? "Privacy profile updated." : "Privacidad comunitaria actualizada.",
      );
    } catch {
      onErrorToast(dict.networkErrorSavePrivacy);
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Columna principal: Filtros, Compositor y Muro */}
      <div className="lg:col-span-8 space-y-4">
        {/* Filtro de comunidad */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedOrgId("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedOrgId === "all"
                  ? "bg-[var(--dsn-accent)] text-white"
                  : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
              }`}
            >
              {dict.allCommunitiesOption}
            </button>
            {communities.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => setSelectedOrgId(org.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  selectedOrgId === org.id
                    ? "bg-[var(--dsn-accent)] text-white"
                    : "border border-[var(--dsn-border)] bg-[var(--dsn-surface)] text-[var(--dsn-text-secondary)]"
                }`}
              >
                {org.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadPosts()}
            className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2 text-[var(--dsn-accent)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingPosts ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Compositor */}
        {isOwner && communities.length > 0 && (
          <form
            onSubmit={handlePublish}
            className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--dsn-text)] flex items-center gap-1.5">
                <MessageSquarePlus className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.wallPublishCta}</span>
              </span>
              <select
                value={composeOrgId}
                onChange={(e) => setComposeOrgIdInput(e.target.value)}
                className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-3 py-1.5 text-xs text-[var(--dsn-text)]"
              >
                {communities.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.moderationMode})
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={3}
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              placeholder={dict.wallPostPlaceholder}
              className="w-full rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] p-3 text-xs text-[var(--dsn-text)] focus:border-[var(--dsn-accent)] focus:outline-none"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={publishing || !postBody.trim()}
                className="rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {dict.wallPublishCta}
              </button>
            </div>
          </form>
        )}

        {/* Listado del Muro */}
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-10 text-center space-y-1">
            <p className="text-sm font-semibold text-[var(--dsn-text)]">{dict.wallEmptyTitle}</p>
            <p className="text-xs text-[var(--dsn-text-secondary)]">{dict.wallEmptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const orgInfo = communities.find((o) => o.id === post.organizationId);
              const isModerator =
                isOwner &&
                (orgInfo?.myRole === "originator" || orgInfo?.myRole === "co_leader");

              return (
                <article
                  key={post.id}
                  className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[var(--dsn-text)]">
                          {post.author.displayName}
                        </span>
                        {post.authorRole && (
                          <span className="rounded-full bg-[var(--dsn-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--dsn-accent)]">
                            {post.authorRole === "originator"
                              ? dict.roleOriginator
                              : post.authorRole === "co_leader"
                                ? dict.roleCoLeader
                                : dict.roleMember}
                          </span>
                        )}
                        {post.status === "pending_review" && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            {dict.pendingApprovalBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                        {post.organizationName || orgInfo?.name || "Comunidad"} ·{" "}
                        {formatCommunityDate(post.publishedAt || post.createdAt || new Date(), locale)}
                      </p>
                    </div>

                    {isModerator && (
                      <div className="flex items-center gap-1.5">
                        {post.status === "pending_review" && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleModeratePost(post.id, "approve")}
                              className="inline-flex items-center gap-1 rounded-lg bg-[var(--dsn-accent)] px-2.5 py-1 text-[11px] font-semibold text-white"
                            >
                              <Check className="h-3 w-3" />
                              <span>{dict.acceptCta}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleModeratePost(post.id, "reject")}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                            >
                              <XCircle className="h-3 w-3" />
                              <span>{dict.rejectCta}</span>
                            </button>
                          </>
                        )}
                        {post.status === "published" && (
                          <button
                            type="button"
                            onClick={() => void handleModeratePost(post.id, "hide")}
                            title="Ocultar"
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)] px-2 py-1 text-[11px] text-[var(--dsn-text-secondary)] hover:text-rose-600"
                          >
                            <EyeOff className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--dsn-text)] whitespace-pre-wrap">
                    {post.body}
                  </p>

                  {/* Datos de contacto respetando client_sharing_profiles */}
                  {(post.author.contactEmail || post.author.phone || post.author.address) && (
                    <div className="flex flex-wrap gap-3 border-t border-[var(--dsn-border)] pt-2.5 text-[11px] text-[var(--dsn-text-secondary)]">
                      {post.author.contactEmail && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3 text-[var(--dsn-accent)]" />
                          {post.author.contactEmail}
                        </span>
                      )}
                      {post.author.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 text-[var(--dsn-accent)]" />
                          {post.author.phone}
                        </span>
                      )}
                      {post.author.address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-[var(--dsn-accent)]" />
                          {post.author.address}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Columna derecha: Perfil de Privacidad */}
      <aside className="lg:col-span-4 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4 md:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--dsn-text)] flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--dsn-accent)]" />
            <span>{dict.privacyTitle}</span>
          </h3>
          <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.privacySubtitle}</p>
        </div>

        {profile && (
          <form onSubmit={handleSavePrivacy} className="space-y-3 text-xs">
            <label className="flex items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 cursor-pointer">
              <span className="text-[var(--dsn-text)]">{dict.privacyEmailLabel}</span>
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={profile.shareEmail}
                onChange={(e) =>
                  setProfile((p) => (p ? { ...p, shareEmail: e.target.checked } : null))
                }
                className="accent-[var(--dsn-accent)]"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 cursor-pointer">
              <span className="text-[var(--dsn-text)]">{dict.privacyPhoneLabel}</span>
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={profile.sharePhone}
                onChange={(e) =>
                  setProfile((p) => (p ? { ...p, sharePhone: e.target.checked } : null))
                }
                className="accent-[var(--dsn-accent)]"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 cursor-pointer">
              <span className="text-[var(--dsn-text)]">{dict.privacyAddressLabel}</span>
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={profile.shareAddress}
                onChange={(e) =>
                  setProfile((p) => (p ? { ...p, shareAddress: e.target.checked } : null))
                }
                className="accent-[var(--dsn-accent)]"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5 cursor-pointer">
              <span className="text-[var(--dsn-text)]">{dict.privacySocialLabel}</span>
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={profile.shareSocialLinks}
                onChange={(e) =>
                  setProfile((p) => (p ? { ...p, shareSocialLinks: e.target.checked } : null))
                }
                className="accent-[var(--dsn-accent)]"
              />
            </label>

            {isOwner && (
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {dict.privacySaveCta}
              </button>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}

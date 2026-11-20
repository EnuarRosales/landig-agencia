"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  EyeOff,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Phone,
  Pin,
  PinOff,
  RefreshCw,
  Send,
  Shield,
  Smile,
  Trash2,
  XCircle,
} from "lucide-react";
import type {
  ClientSharingProfileDto,
  TenantCommunityDetailDto,
} from "@mocter/domain";
import {
  extractPlainTextFromCommunityHtml,
  formatPlainPostHtmlWithLinks,
  sanitizeCommunityPostHtml,
} from "@mocter/domain/community-html";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmationModal,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from "@mocter/ui";
import { CommunityPostEditor } from "@/components/community-post-editor";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { formatCommunityDate, readApiError } from "./_types";

const QUICK_REPLY_EMOJIS = [
  "😀",
  "🎉",
  "🔥",
  "🚀",
  "👏",
  "💡",
  "❤️",
  "✅",
  "🙌",
  "⭐",
  "💬",
  "📦",
  "🏷️",
  "🛒",
  "✨",
];

interface SerializedFeedReply {
  id: string;
  postId: string;
  authorClientId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

interface SerializedFeedPost {
  id: string;
  organizationId: string;
  organizationName?: string;
  body: string;
  bodyFormat?: "plain" | "html";
  mediaId?: string | null;
  imageUrl?: string | null;
  videoEmbedUrl?: string | null;
  isPinned?: boolean;
  pinnedAt?: string | null;
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
  replies?: SerializedFeedReply[];
}

interface CommunityWallTabProps {
  communities: TenantCommunityDetailDto[];
  locale: AdminLocale;
  isOwner: boolean;
  currentClientId?: string;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

/**
 * Pestaña 3 · Muro Social Enriquecido, Video Incrustado, Imagen con Cuota, Fijación,
 * Respuestas con Emojis y Perfil de Privacidad (`SPEC-15-D11`..`D14`).
 */
export function CommunityWallTab({
  communities,
  locale,
  isOwner,
  currentClientId,
  onSuccessToast,
  onErrorToast,
}: CommunityWallTabProps) {
  const dict = getAdminDictionary(locale).community;

  const [selectedOrgId, setSelectedOrgId] = useState<string>("all");
  const [composeOrgIdInput, setComposeOrgIdInput] = useState<string>(communities[0]?.id ?? "");
  const composeOrgId = communities.some((c) => c.id === composeOrgIdInput)
    ? composeOrgIdInput
    : (communities[0]?.id ?? "");
  const composeOrg = communities.find((c) => c.id === composeOrgId);

  const [postBodyHtml, setPostBodyHtml] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [publishing, setPublishing] = useState(false);

  const [loadingPosts, setLoadingPosts] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [posts, setPosts] = useState<SerializedFeedPost[]>([]);

  const [profile, setProfile] = useState<ClientSharingProfileDto | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [lightboxImage, setLightboxImage] = useState<{ url: string; author: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SerializedFeedPost | null>(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<{
    id: string;
    organizationName: string;
    bodyHtml: string;
    existingMediaId: string | null;
    existingImageUrl: string | null;
    newImageFile: File | null;
    videoUrl: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySendingId, setReplySendingId] = useState<string | null>(null);
  const [openEmojiPostId, setOpenEmojiPostId] = useState<string | null>(null);

  const effectiveClientId = currentClientId || profile?.clientId || "";

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

  const editorLabels = {
    addImageCta: dict.wallAddImageCta,
    changeImageCta: dict.wallChangeImageCta,
    removeImageCta: dict.wallRemoveImageCta,
    imageHint: dict.wallImageHint,
    addVideoCta: dict.wallAddVideoCta,
    videoPlaceholder: dict.wallVideoPlaceholder,
    applyVideoCta: dict.wallApplyVideoCta,
    removeVideoCta: dict.wallRemoveVideoCta,
    linkTextLabel: dict.linkTextLabel,
    linkTextPlaceholder: dict.linkTextPlaceholder,
    linkUrlLabel: dict.linkUrlLabel,
  };

  async function uploadWallImageFile(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    const mediaRes = await fetch("/api/tenant/community/posts/media", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!mediaRes.ok) {
      onErrorToast(
        await readApiError(
          mediaRes,
          locale === "en" ? "Could not upload post image." : "No se pudo subir la imagen.",
        ),
      );
      return null;
    }
    const mediaJson = await mediaRes.json();
    return (mediaJson.data?.mediaId as string | undefined) ?? null;
  }

  async function rollbackUploadedWallImage(mediaId: string | null) {
    if (!mediaId) return;
    await fetch(`/api/tenant/community/posts/media/${mediaId}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {});
  }

  const hasContentToPublish =
    extractPlainTextFromCommunityHtml(postBodyHtml).length >= 2 ||
    Boolean(selectedImageFile) ||
    Boolean(videoUrl.trim());

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!composeOrgId || !hasContentToPublish) return;
    setPublishing(true);
    let uploadedMediaId: string | null = null;

    try {
      if (selectedImageFile) {
        uploadedMediaId = await uploadWallImageFile(selectedImageFile);
        if (!uploadedMediaId) {
          return;
        }
      }

      const res = await fetch("/api/tenant/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationId: composeOrgId,
          body: postBodyHtml,
          bodyFormat: "html",
          mediaId: uploadedMediaId,
          videoUrl: videoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        await rollbackUploadedWallImage(uploadedMediaId);
        onErrorToast(await readApiError(res, dict.networkErrorPublishPost));
        return;
      }

      const json = await res.json();
      setPostBodyHtml("");
      setSelectedImageFile(null);
      setVideoUrl("");
      loadPosts();
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
      await rollbackUploadedWallImage(uploadedMediaId);
      onErrorToast(dict.networkErrorPublishPost);
    } finally {
      setPublishing(false);
    }
  }

  function openEditModal(post: SerializedFeedPost, orgName: string) {
    const initialHtml =
      post.bodyFormat === "html"
        ? sanitizeCommunityPostHtml(post.body)
        : formatPlainPostHtmlWithLinks(post.body);
    setEditingPost({
      id: post.id,
      organizationName: orgName,
      bodyHtml: initialHtml,
      existingMediaId: post.mediaId ?? null,
      existingImageUrl: post.imageUrl ?? null,
      newImageFile: null,
      videoUrl: post.videoEmbedUrl ?? "",
    });
  }

  const hasContentToSaveEdit = Boolean(
    editingPost &&
      (extractPlainTextFromCommunityHtml(editingPost.bodyHtml).length >= 2 ||
        Boolean(editingPost.newImageFile) ||
        Boolean(editingPost.existingMediaId) ||
        Boolean(editingPost.videoUrl.trim())),
  );

  async function handleSaveEditPost(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPost || !hasContentToSaveEdit) return;
    setSavingEdit(true);
    let newlyUploadedMediaId: string | null = null;

    try {
      let nextMediaId = editingPost.existingMediaId;
      if (editingPost.newImageFile) {
        newlyUploadedMediaId = await uploadWallImageFile(editingPost.newImageFile);
        if (!newlyUploadedMediaId) {
          return;
        }
        nextMediaId = newlyUploadedMediaId;
      }

      const res = await fetch(`/api/tenant/community/posts/${editingPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          body: editingPost.bodyHtml,
          bodyFormat: "html",
          mediaId: nextMediaId,
          videoUrl: editingPost.videoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        await rollbackUploadedWallImage(newlyUploadedMediaId);
        onErrorToast(await readApiError(res, dict.networkErrorGeneric));
        return;
      }

      const json = await res.json();
      setEditingPost(null);
      loadPosts();
      onSuccessToast(
        json.data?.status === "pending_review"
          ? locale === "en"
            ? "Post updated and sent for moderator approval."
            : "Publicación actualizada y enviada a revisión de moderación."
          : dict.wallPostUpdatedToast,
      );
    } catch {
      await rollbackUploadedWallImage(newlyUploadedMediaId);
      onErrorToast(dict.networkErrorGeneric);
    } finally {
      setSavingEdit(false);
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
        onErrorToast(await readApiError(res, dict.networkErrorModeratePost));
        return;
      }
      loadPosts();
      onSuccessToast(
        locale === "en" ? "Wall moderation updated." : "Estado de publicación actualizado.",
      );
    } catch {
      onErrorToast(dict.networkErrorModeratePost);
    }
  }

  async function handleTogglePin(post: SerializedFeedPost) {
    try {
      const method = post.isPinned ? "DELETE" : "POST";
      const res = await fetch(`/api/tenant/community/posts/${post.id}/pin`, {
        method,
        credentials: "include",
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, dict.networkErrorModeratePost));
        return;
      }
      loadPosts();
      onSuccessToast(
        post.isPinned
          ? locale === "en"
            ? "Post unpinned."
            : "Fijación retirada de la publicación."
          : locale === "en"
            ? "Post pinned to the top."
            : "Publicación fijada en primer lugar.",
      );
    } catch {
      onErrorToast(dict.networkErrorModeratePost);
    }
  }

  async function handleConfirmDeletePost() {
    if (!deleteTarget) return;
    setDeletingPost(true);
    try {
      const res = await fetch(`/api/tenant/community/posts/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, dict.networkErrorGeneric));
        return;
      }
      setDeleteTarget(null);
      loadPosts();
      onSuccessToast(
        locale === "en"
          ? "Post deleted and media storage released."
          : "Publicación eliminada y almacenamiento liberado.",
      );
    } catch {
      onErrorToast(dict.networkErrorGeneric);
    } finally {
      setDeletingPost(false);
    }
  }

  async function handleSendReply(e: React.FormEvent, postId: string) {
    e.preventDefault();
    const draft = (replyDrafts[postId] ?? "").trim();
    if (!draft) return;

    setReplySendingId(postId);
    try {
      const res = await fetch(`/api/tenant/community/posts/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, dict.networkErrorGeneric));
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [postId]: "" }));
      setOpenEmojiPostId(null);
      loadPosts();
    } catch {
      onErrorToast(dict.networkErrorGeneric);
    } finally {
      setReplySendingId(null);
    }
  }

  async function handleSavePrivacy(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/tenant/community/sharing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sharePhone: profile.sharePhone,
          shareEmail: profile.shareEmail,
          shareAddress: profile.shareAddress,
          shareSocialLinks: profile.shareSocialLinks,
        }),
      });
      if (!res.ok) {
        onErrorToast(await readApiError(res, dict.networkErrorSavePrivacy));
        return;
      }
      loadPosts();
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
      {/* Columna principal: Filtros, Compositor Social y Muro */}
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

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadPosts()}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[var(--dsn-accent)] ${loadingPosts ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Compositor Social Enriquecido (solo tenant_owner) */}
        {isOwner && communities.length > 0 && (
          <form
            onSubmit={handlePublish}
            className="space-y-3 rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dsn-text)]">
                <MessageSquarePlus className="h-4 w-4 text-[var(--dsn-accent)]" />
                <span>{dict.wallPublishCta}</span>
              </span>
              <Select
                value={composeOrgId}
                onChange={(e) => setComposeOrgIdInput(e.target.value)}
                className="h-8 w-auto text-xs"
              >
                {communities.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.moderationMode})
                  </option>
                ))}
              </Select>
            </div>

            <CommunityPostEditor
              valueHtml={postBodyHtml}
              onChangeHtml={setPostBodyHtml}
              selectedImageFile={selectedImageFile}
              onImageFileChange={setSelectedImageFile}
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              locale={locale}
              organizationName={composeOrg?.name}
              placeholder={dict.wallPostPlaceholder}
              disabled={publishing}
              labels={editorLabels}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={publishing || !hasContentToPublish}
                loading={publishing}
              >
                {dict.wallPublishCta}
              </Button>
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
              const isAuthorOwner =
                isOwner && Boolean(effectiveClientId) && post.author.clientId === effectiveClientId;
              const replies = post.replies ?? [];

              return (
                <article
                  key={post.id}
                  className={`rounded-2xl border bg-[var(--dsn-surface)] p-4 space-y-3 ${
                    post.isPinned
                      ? "border-[var(--dsn-accent)]/60 ring-1 ring-[var(--dsn-accent)]/20"
                      : "border-[var(--dsn-border)]"
                  }`}
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
                        {post.isPinned && (
                          <Badge variant="accent" className="gap-1 text-[10px]">
                            <Pin className="h-3 w-3" />
                            <span>{dict.wallPinnedBadge}</span>
                          </Badge>
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

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isModerator && post.status === "pending_review" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleModeratePost(post.id, "approve")}
                            className="h-7 min-h-0 px-2.5 text-[11px]"
                          >
                            <Check className="h-3 w-3" />
                            <span>{dict.acceptCta}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleModeratePost(post.id, "reject")}
                            className="h-7 min-h-0 px-2.5 text-[11px]"
                          >
                            <XCircle className="h-3 w-3" />
                            <span>{dict.rejectCta}</span>
                          </Button>
                        </>
                      )}

                      {isModerator && post.status === "published" && (
                        <>
                          <Button
                            type="button"
                            variant={post.isPinned ? "default" : "outline"}
                            size="sm"
                            onClick={() => void handleTogglePin(post)}
                            title={post.isPinned ? dict.wallUnpinCta : dict.wallPinCta}
                            aria-label={post.isPinned ? dict.wallUnpinCta : dict.wallPinCta}
                            className="h-7 min-h-0 px-2 text-[11px]"
                          >
                            {post.isPinned ? (
                              <PinOff className="h-3 w-3" />
                            ) : (
                              <Pin className="h-3 w-3 text-[var(--dsn-accent)]" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleModeratePost(post.id, "hide")}
                            title={locale === "en" ? "Hide Post" : "Ocultar Publicación"}
                            className="h-7 min-h-0 px-2 text-[11px]"
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </>
                      )}

                      {isAuthorOwner && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openEditModal(
                                post,
                                post.organizationName || orgInfo?.name || "Comunidad",
                              )
                            }
                            title={dict.wallEditCta}
                            aria-label={dict.wallEditCta}
                            className="h-7 min-h-0 px-2 text-[11px]"
                          >
                            <Pencil className="h-3 w-3 text-[var(--dsn-accent)]" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteTarget(post)}
                            title={dict.wallDeleteCta}
                            aria-label={dict.wallDeleteCta}
                            className="h-7 min-h-0 px-2 text-[11px] text-rose-500 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Contenido textual enriquecido o plano con enlaces seguros */}
                  {post.body && (
                    post.bodyFormat === "html" ? (
                      <div
                        className="text-xs leading-relaxed text-[var(--dsn-text)] space-y-1.5 break-words [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-[var(--dsn-accent)] [&_a]:underline [&_a]:break-all"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeCommunityPostHtml(post.body),
                        }}
                      />
                    ) : (
                      <div
                        className="text-xs leading-relaxed text-[var(--dsn-text)] whitespace-pre-wrap break-words [&_a]:text-[var(--dsn-accent)] [&_a]:underline [&_a]:break-all"
                        dangerouslySetInnerHTML={{
                          __html: formatPlainPostHtmlWithLinks(post.body),
                        }}
                      />
                    )
                  )}

                  {/* Imagen destacada tipo red social con proporción acotada y visor lightbox */}
                  {post.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({
                          url: post.imageUrl!,
                          author: post.author.displayName,
                        })
                      }
                      className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-2 focus:outline-none focus:ring-2 focus:ring-[var(--dsn-accent)]/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.imageUrl}
                        alt={post.author.displayName}
                        className="mx-auto max-h-[340px] w-auto max-w-full rounded-lg object-contain transition-transform hover:scale-[1.01] cursor-zoom-in"
                      />
                    </button>
                  )}

                  {/* Video incrustado (YouTube / Vimeo) */}
                  {post.videoEmbedUrl && (
                    <div className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-black/5">
                      <div className="aspect-video w-full">
                        <iframe
                          src={post.videoEmbedUrl}
                          title={`Video de ${post.author.displayName}`}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      </div>
                    </div>
                  )}

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

                  {/* Hilo de respuestas con texto y emojis (solo publicaciones aprobadas) */}
                  {post.status === "published" && (
                    <div className="space-y-2.5 border-t border-[var(--dsn-border)] pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--dsn-text-secondary)]">
                        <MessageCircle className="h-3.5 w-3.5 text-[var(--dsn-accent)]" />
                        <span>
                          {dict.wallRepliesTitle} ({replies.length})
                        </span>
                      </div>

                      {replies.length > 0 && (
                        <div className="space-y-2">
                          {replies.map((reply) => (
                            <div
                              key={reply.id}
                              className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[var(--dsn-text)]">
                                  {reply.authorDisplayName}
                                </span>
                                <span className="text-[10px] text-[var(--dsn-text-secondary)]">
                                  {formatCommunityDate(reply.createdAt, locale)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[var(--dsn-text)]">
                                {reply.body}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <form
                        onSubmit={(e) => void handleSendReply(e, post.id)}
                        className="relative flex flex-wrap items-center gap-2"
                      >
                        <div className="relative flex flex-1 items-center gap-1.5 min-w-[200px]">
                          <Input
                            type="text"
                            value={replyDrafts[post.id] ?? ""}
                            onChange={(e) =>
                              setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                            }
                            placeholder={dict.wallReplyPlaceholder}
                            maxLength={1500}
                            className="h-9 text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title={dict.wallEmojiPickerLabel}
                            aria-label={dict.wallEmojiPickerLabel}
                            onClick={() =>
                              setOpenEmojiPostId((cur) => (cur === post.id ? null : post.id))
                            }
                            className="h-9 w-9 shrink-0"
                          >
                            <Smile className="h-4 w-4 text-[var(--dsn-accent)]" />
                          </Button>
                        </div>

                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            replySendingId === post.id || !(replyDrafts[post.id] ?? "").trim()
                          }
                          loading={replySendingId === post.id}
                          className="h-9 min-h-0 px-3 text-xs"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{dict.wallReplySubmitCta}</span>
                        </Button>

                        {openEmojiPostId === post.id && (
                          <div className="flex w-full flex-wrap gap-1 rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-2 shadow-sm">
                            {QUICK_REPLY_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() =>
                                  setReplyDrafts((prev) => ({
                                    ...prev,
                                    [post.id]: `${prev[post.id] ?? ""}${emoji}`,
                                  }))
                                }
                                className="rounded-md px-2 py-1 text-base hover:bg-[var(--dsn-surface-secondary)] transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </form>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Columna derecha: Perfil de Privacidad */}
      <Card asChild className="space-y-4 rounded-2xl p-4 md:p-5 lg:col-span-4">
        <aside>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--dsn-text)]">
              <Shield className="h-4 w-4 text-[var(--dsn-accent)]" />
              <span>{dict.privacyTitle}</span>
            </h3>
            <p className="mt-1 text-xs text-[var(--dsn-text-secondary)]">{dict.privacySubtitle}</p>
          </div>

          {profile && (
            <form onSubmit={handleSavePrivacy} className="space-y-3 text-xs">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5">
                <span className="text-[var(--dsn-text)]">{dict.privacyEmailLabel}</span>
                <Checkbox
                  disabled={!isOwner}
                  checked={profile.shareEmail}
                  onCheckedChange={(checked) =>
                    setProfile((p) => (p ? { ...p, shareEmail: checked === true } : null))
                  }
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5">
                <span className="text-[var(--dsn-text)]">{dict.privacyPhoneLabel}</span>
                <Checkbox
                  disabled={!isOwner}
                  checked={profile.sharePhone}
                  onCheckedChange={(checked) =>
                    setProfile((p) => (p ? { ...p, sharePhone: checked === true } : null))
                  }
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5">
                <span className="text-[var(--dsn-text)]">{dict.privacyAddressLabel}</span>
                <Checkbox
                  disabled={!isOwner}
                  checked={profile.shareAddress}
                  onCheckedChange={(checked) =>
                    setProfile((p) => (p ? { ...p, shareAddress: checked === true } : null))
                  }
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2.5">
                <span className="text-[var(--dsn-text)]">{dict.privacySocialLabel}</span>
                <Checkbox
                  disabled={!isOwner}
                  checked={profile.shareSocialLinks}
                  onCheckedChange={(checked) =>
                    setProfile((p) => (p ? { ...p, shareSocialLinks: checked === true } : null))
                  }
                />
              </label>

              {isOwner && (
                <Button type="submit" disabled={savingProfile} loading={savingProfile} className="w-full">
                  {dict.privacySaveCta}
                </Button>
              )}
            </form>
          )}
        </aside>
      </Card>

      {/* Modal de edición de publicación (solo autor, SPEC-15-D11 / D14) */}
      <Dialog
        open={Boolean(editingPost)}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditingPost(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dict.wallEditTitle}</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <form onSubmit={handleSaveEditPost} className="space-y-4">
              <CommunityPostEditor
                valueHtml={editingPost.bodyHtml}
                onChangeHtml={(nextHtml) =>
                  setEditingPost((prev) => (prev ? { ...prev, bodyHtml: nextHtml } : null))
                }
                selectedImageFile={editingPost.newImageFile}
                onImageFileChange={(file) =>
                  setEditingPost((prev) => (prev ? { ...prev, newImageFile: file } : null))
                }
                existingImageUrl={editingPost.existingImageUrl}
                onRemoveExistingImage={() =>
                  setEditingPost((prev) =>
                    prev ? { ...prev, existingMediaId: null, existingImageUrl: null } : null,
                  )
                }
                videoUrl={editingPost.videoUrl}
                onVideoUrlChange={(nextVideoUrl) =>
                  setEditingPost((prev) => (prev ? { ...prev, videoUrl: nextVideoUrl } : null))
                }
                locale={locale}
                organizationName={editingPost.organizationName}
                placeholder={dict.wallPostPlaceholder}
                disabled={savingEdit}
                labels={editorLabels}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savingEdit}
                  onClick={() => setEditingPost(null)}
                >
                  {locale === "en" ? "Cancel" : "Cancelar"}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingEdit || !hasContentToSaveEdit}
                  loading={savingEdit}
                >
                  {dict.wallSaveEditCta}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox de imagen */}
      <Dialog open={Boolean(lightboxImage)} onOpenChange={(open) => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {dict.wallLightboxTitle} · {lightboxImage?.author}
            </DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            <div className="overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.author}
                className="max-h-[75vh] w-full object-contain mx-auto"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación de borrado de publicación (Zero Native Dialogs, AGENTS.md §4.17) */}
      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deletingPost && setDeleteTarget(null)}
        title={dict.confirmDeletePostTitle}
        subtitle={deleteTarget?.organizationName || dict.communityLabel}
        variant="danger"
        details={
          deleteTarget
            ? [
                {
                  label: dict.communityLabel,
                  value: deleteTarget.organizationName || "Comunidad",
                },
              ]
            : []
        }
        warningTitle={dict.confirmDeletePostTitle}
        warningMessage={dict.confirmDeletePostDesc}
        confirmText={dict.wallDeleteCta}
        cancelText={locale === "en" ? "Cancel" : "Cancelar"}
        loading={deletingPost}
        onConfirm={() => void handleConfirmDeletePost()}
      />
    </div>
  );
}

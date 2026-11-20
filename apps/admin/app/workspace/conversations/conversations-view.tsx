"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkspaceConversationsPageState } from "@mocter/domain";
import {
  AlertTriangle,
  Clock,
  Lock,
  MessageSquare,
  PauseCircle,
  RotateCw,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription, Badge, Button, Card } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

const IFRAME_LOAD_TIMEOUT_MS = 12_000;

/**
 * Propiedades del wrapper interactivo de la bandeja de conversaciones del comercio (`SPEC-13`).
 */
export interface WorkspaceConversationsViewProps {
  initialState: WorkspaceConversationsPageState;
  locale?: AdminLocale;
  requestId?: string;
}

/**
 * Vista cliente de `/workspace/conversations` que gestiona el ciclo de carga, timeout y recarga
 * del iframe same-site hacia la bandeja de conversaciones del comercio, así como las tarjetas
 * de degradación controlada para estados no operativos (`SPEC-13`).
 */
export function WorkspaceConversationsView({
  initialState,
  locale = "es",
  requestId,
}: WorkspaceConversationsViewProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale).workspace;

  const [overrideState, setOverrideState] = useState<WorkspaceConversationsPageState | null>(null);
  const state =
    initialState.status === "ready" ? initialState : (overrideState ?? initialState);
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retryingProvision, setRetryingProvision] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (state.status !== "ready" || iframeLoaded) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, IFRAME_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [state.status, iframeLoaded, reloadKey]);

  function handleReloadIframe() {
    setIframeLoaded(false);
    setLoadTimedOut(false);
    setReloadKey((prev) => prev + 1);
  }

  function handleRefreshPageState() {
    setOverrideState(null);
    setRetryFeedback(null);
    router.refresh();
  }

  async function handleRetryProvisioning() {
    if (retryingProvision) {
      return;
    }

    setRetryingProvision(true);
    setRetryFeedback(null);

    try {
      const response = await fetch("/api/tenant/conversations/retry", {
        method: "POST",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        data?: { state?: string; chatwootAccountId?: number | null };
      } | null;

      if (!response.ok || !payload?.ok) {
        setRetryFeedback({
          kind: "error",
          message: dict.conversationsRetryError,
        });
        return;
      }

      if (payload.data?.state === "active" && payload.data.chatwootAccountId !== null) {
        setRetryFeedback({
          kind: "success",
          message: dict.conversationsRetrySuccess,
        });
        setIframeLoaded(false);
        setLoadTimedOut(false);
        setReloadKey((prev) => prev + 1);
        setOverrideState({
          status: "ready",
          accountId: payload.data.chatwootAccountId ?? null,
          isOwner: state.isOwner,
        });
        router.refresh();
        return;
      }

      if (payload.data?.state === "provisioning" || payload.data?.state === "pending") {
        setOverrideState({
          status: "provisioning",
          accountId: payload.data.chatwootAccountId ?? null,
          isOwner: state.isOwner,
        });
        router.refresh();
        return;
      }

      setRetryFeedback({
        kind: "error",
        message: dict.conversationsRetryError,
      });
    } catch {
      setRetryFeedback({
        kind: "error",
        message: dict.conversationsRetryError,
      });
    } finally {
      setRetryingProvision(false);
    }
  }

  if (state.status === "no_capability") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-8 md:p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {dict.conversationsNoCapabilityTitle}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dsn-text-secondary)]">
            {dict.conversationsNoCapabilityDesc}
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/billing"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
            >
              <span>{dict.conversationsViewPlansCta}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "access_denied") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-8 md:p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {dict.conversationsAccessDeniedTitle}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dsn-text-secondary)]">
            {dict.conversationsAccessDeniedDesc}
          </p>
          <div className="mt-6">
            <Link
              href="/workspace"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface)] px-4 py-2 text-xs font-semibold text-[var(--dsn-text)] transition-colors hover:border-[var(--dsn-accent)]"
            >
              <span>{dict.conversationsBackDashboardCta}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "suspended") {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-8 md:p-12 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <PauseCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {dict.conversationsSuspendedTitle}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dsn-text-secondary)]">
            {dict.conversationsSuspendedDesc}
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/billing"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
            >
              <span>{dict.conversationsBillingCta}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (
    state.status === "provisioning" ||
    state.status === "not_provisioned" ||
    state.status === "failed"
  ) {
    const isProvisioning = state.status === "provisioning";
    const isNotProvisioned = state.status === "not_provisioned";
    const canOwnerRetry = state.isOwner && (isNotProvisioned || state.status === "failed");

    const title = isProvisioning
      ? dict.conversationsProvisioningTitle
      : isNotProvisioned
        ? dict.conversationsNotProvisionedTitle
        : dict.conversationsFailedTitle;

    const description = isProvisioning
      ? dict.conversationsProvisioningDesc
      : isNotProvisioned
        ? dict.conversationsNotProvisionedDesc
        : state.isOwner
          ? dict.conversationsFailedDesc
          : dict.conversationsFailedAgentDesc;

    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-8 md:p-12 text-center shadow-xs">
          <div
            className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${
              isProvisioning || isNotProvisioned
                ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
                : "border-rose-500/20 bg-rose-500/10 text-rose-400"
            }`}
          >
            {isProvisioning || isNotProvisioned ? (
              <Clock className={`h-6 w-6 ${isProvisioning ? "animate-pulse" : ""}`} />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>

          <h1 className="text-lg font-bold text-[var(--dsn-text)]">{title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-[var(--dsn-text-secondary)]">
            {description}
          </p>

          {retryFeedback && (
            <Alert
              role="status"
              variant={retryFeedback.kind === "success" ? "success" : "error"}
              className="mt-4 text-left"
            >
              <AlertDescription>{retryFeedback.message}</AlertDescription>
            </Alert>
          )}

          {requestId && state.status === "failed" && (
            <p className="mt-3 text-[11px] font-mono text-[var(--dsn-text-secondary)]">
              {dict.conversationsReferenceLabel}: {requestId}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {canOwnerRetry && (
              <Button
                type="button"
                onClick={handleRetryProvisioning}
                disabled={retryingProvision}
              >
                <RotateCw className={`h-4 w-4 ${retryingProvision ? "animate-spin" : ""}`} />
                <span>
                  {retryingProvision
                    ? dict.conversationsRetryingProvisionCta
                    : dict.conversationsRetryProvisionCta}
                </span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={handleRefreshPageState}
              disabled={retryingProvision}
            >
              <RotateCw className="h-4 w-4 text-[var(--dsn-accent)]" />
              <span>{dict.conversationsRefreshStatusCta}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const iframeSrc =
    reloadKey === 0
      ? "/api/auth/chatwoot/embed?scope=workspace"
      : `/api/auth/chatwoot/embed?scope=workspace&r=${reloadKey}`;

  return (
    <div className="flex h-[calc(100dvh-65px)] w-full flex-col p-3 md:p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dsn-border)] pb-3">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-5 w-5 text-[var(--dsn-accent)]" />
          <h1 className="text-base font-bold text-[var(--dsn-text)]">
            {dict.conversationsTitle}
          </h1>
          <Badge variant="success" className="gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{dict.conversationsConnectedStatus}</span>
          </Badge>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={handleReloadIframe}>
          <RotateCw
            className={`h-3.5 w-3.5 text-[var(--dsn-accent)] ${!iframeLoaded && !loadTimedOut ? "animate-spin" : ""}`}
          />
          <span>{dict.conversationsReloadCta}</span>
        </Button>
      </header>

      <div className="relative flex-1 w-full overflow-hidden rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)]">
        {!iframeLoaded && !loadTimedOut && (
          <div
            data-testid="conversations-loading-overlay"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--dsn-surface)]/90 px-4 text-center backdrop-blur-xs"
          >
            <RotateCw className="h-6 w-6 animate-spin text-[var(--dsn-accent)]" />
            <p className="text-xs font-medium text-[var(--dsn-text-secondary)]">
              {dict.conversationsLoadingText}
            </p>
          </div>
        )}

        {!iframeLoaded && loadTimedOut && (
          <div
            data-testid="conversations-timeout-overlay"
            className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--dsn-surface)]/95 p-4 backdrop-blur-xs"
          >
            <Card className="max-w-md p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-[var(--dsn-text)]">
                {dict.conversationsTimeoutTitle}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--dsn-text-secondary)]">
                {dict.conversationsTimeoutDesc}
              </p>
              {requestId && (
                <p className="mt-2.5 text-[11px] font-mono text-[var(--dsn-text-secondary)]">
                  {dict.conversationsReferenceLabel}: {requestId}
                </p>
              )}
              <div className="mt-5">
                <Button type="button" onClick={handleReloadIframe}>
                  <RotateCw className="h-4 w-4" />
                  <span>{dict.conversationsRetryConnectionCta}</span>
                </Button>
              </div>
            </Card>
          </div>
        )}

        <iframe
          key={reloadKey}
          src={iframeSrc}
          title={dict.conversationsIframeTitle}
          className="h-full w-full border-0"
          allow="camera; microphone; clipboard-read; clipboard-write; autoplay; keyboard-map"
          onLoad={() => {
            setIframeLoaded(true);
            setLoadTimedOut(false);
          }}
        />
      </div>
    </div>
  );
}

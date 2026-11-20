"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Crown,
  GitCompare,
  Globe,
  Lock,
  MessageSquare,
  Package,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { TenantCommunitiesOverviewDto } from "@mocter/domain";
import { Alert, AlertDescription, Badge, Button, Card } from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";
import { CommunityFeedTab } from "./community-feed-tab";
import { CommunityClonesTab } from "./community-clones-tab";
import { CommunityWallTab } from "./community-wall-tab";
import { CommunityNetworkTab } from "./community-network-tab";
import { CommunityLeaderTab } from "./community-leader-tab";
import { readApiError } from "./_types";

interface CommunityViewProps {
  initialOverview: TenantCommunitiesOverviewDto | null;
  capabilityEnabled: boolean;
  isOwner: boolean;
  locale: AdminLocale;
  initialTab?: string;
  currentClientId?: string;
}

type CommunityTabKey = "feed" | "clones" | "wall" | "network" | "leader";

/**
 * Vista integral de Comunidad de Comercios, Clonación y Redes de Liderazgo (`SPEC-15`).
 */
export function CommunityView({
  initialOverview,
  capabilityEnabled,
  isOwner,
  locale,
  initialTab,
  currentClientId,
}: CommunityViewProps) {
  const dict = getAdminDictionary(locale).community;

  const [overview, setOverview] = useState<TenantCommunitiesOverviewDto | null>(initialOverview);
  const [activeTab, setActiveTab] = useState<CommunityTabKey>(
    initialTab === "clones" ||
      initialTab === "wall" ||
      initialTab === "network" ||
      initialTab === "leader"
      ? initialTab
      : "feed",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; message: string } | null>(null);

  const showSuccess = useCallback((message: string) => {
    setToast({ type: "ok", message });
  }, []);

  const showError = useCallback((message: string) => {
    setToast({ type: "err", message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const reloadOverview = useCallback(async () => {
    if (!capabilityEnabled) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/tenant/community/overview", { credentials: "include" });
      if (!res.ok) {
        showError(await readApiError(res, "Error al actualizar comunidades."));
        return;
      }
      const json = await res.json();
      if (json.ok) {
        setOverview(json.data);
      }
    } catch {
      showError("Error de conexión al recargar comunidades.");
    } finally {
      setRefreshing(false);
    }
  }, [capabilityEnabled, showError]);

  if (!capabilityEnabled) {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <Card className="mx-auto max-w-2xl space-y-4 rounded-2xl p-8 text-center md:p-12">
          <div className="mx-auto w-fit rounded-2xl bg-[var(--dsn-accent)]/10 p-4 text-[var(--dsn-accent)]">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-[var(--dsn-text)]">{dict.upgradeTitle}</h1>
          <p className="text-sm text-[var(--dsn-text-secondary)]">{dict.upgradeDesc}</p>
          <div className="pt-2">
            <Button asChild>
              <Link href="/workspace/billing">
                <span>{dict.upgradeCta}</span>
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const safeOverview: TenantCommunitiesOverviewDto = overview ?? {
    leaderAuthorization: {
      status: "none",
      maxOwnedCommunities: null,
      ownedCommunitiesCount: 0,
      canCreateMoreCommunities: false,
      proposedCommunityName: null,
      businessModel: null,
      reviewNotes: null,
      requestedAt: null,
      reviewedAt: null,
    },
    myCommunities: [],
    directoryCommunities: [],
    pendingInvitations: [],
    pendingPromotions: [],
  };

  const pendingActionCount =
    safeOverview.pendingInvitations.length +
    safeOverview.pendingPromotions.length +
    safeOverview.myCommunities.reduce((acc, o) => acc + o.pendingRequestsCount, 0);

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dsn-border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--dsn-text)] flex items-center gap-2">
              <Globe className="h-6 w-6 text-[var(--dsn-accent)]" />
              <span>{dict.pageTitle}</span>
            </h1>
            {safeOverview.leaderAuthorization.status === "approved" && (
              <Badge variant="accent">
                <Crown className="h-3.5 w-3.5" />
                <span>{locale === "en" ? "Verified Leader" : "Líder Verificado"}</span>
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs md:text-sm text-[var(--dsn-text-secondary)]">
            {dict.pageSubtitle}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void reloadOverview()}
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-4 w-4 text-[var(--dsn-accent)] ${refreshing ? "animate-spin" : ""}`}
          />
          <span>{locale === "en" ? "Refresh" : "Actualizar"}</span>
        </Button>
      </header>

      {!isOwner && (
        <Alert variant="warning">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{dict.agentNotice}</AlertDescription>
        </Alert>
      )}

      {toast && (
        <Alert role="status" variant={toast.type === "ok" ? "success" : "error"}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <AlertDescription className="font-medium">{toast.message}</AlertDescription>
        </Alert>
      )}

      {/* Navegación por pestañas Mobile First */}
      <nav
        aria-label={dict.pageTitle}
        className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--dsn-border)]"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActiveTab("feed")}
          className={`min-h-0 rounded-none rounded-t-lg border-b-2 px-3.5 py-2.5 whitespace-nowrap ${
            activeTab === "feed"
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/5 text-[var(--dsn-accent)]"
              : "border-transparent text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Package className="h-3.5 w-3.5" />
          <span>{dict.tabFeed}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActiveTab("clones")}
          className={`min-h-0 rounded-none rounded-t-lg border-b-2 px-3.5 py-2.5 whitespace-nowrap ${
            activeTab === "clones"
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/5 text-[var(--dsn-accent)]"
              : "border-transparent text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>{dict.tabClones}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActiveTab("wall")}
          className={`min-h-0 rounded-none rounded-t-lg border-b-2 px-3.5 py-2.5 whitespace-nowrap ${
            activeTab === "wall"
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/5 text-[var(--dsn-accent)]"
              : "border-transparent text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{dict.tabWall}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActiveTab("network")}
          className={`min-h-0 rounded-none rounded-t-lg border-b-2 px-3.5 py-2.5 whitespace-nowrap ${
            activeTab === "network"
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/5 text-[var(--dsn-accent)]"
              : "border-transparent text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>{dict.tabNetwork}</span>
          {pendingActionCount > 0 && (
            <Badge className="px-1.5 py-0.2 text-[10px] font-bold">
              {pendingActionCount}
            </Badge>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setActiveTab("leader")}
          className={`min-h-0 rounded-none rounded-t-lg border-b-2 px-3.5 py-2.5 whitespace-nowrap ${
            activeTab === "leader"
              ? "border-[var(--dsn-accent)] bg-[var(--dsn-accent)]/5 text-[var(--dsn-accent)]"
              : "border-transparent text-[var(--dsn-text-secondary)] hover:text-[var(--dsn-text)]"
          }`}
        >
          <Crown className="h-3.5 w-3.5" />
          <span>{dict.tabLeader}</span>
        </Button>
      </nav>

      {/* Contenido de pestaña activa */}
      {activeTab === "feed" && (
        <CommunityFeedTab
          communities={safeOverview.myCommunities}
          locale={locale}
          isOwner={isOwner}
          onSuccessToast={showSuccess}
          onErrorToast={showError}
          onAdoptedRedirectToClones={() => setActiveTab("clones")}
          onDataMutated={reloadOverview}
        />
      )}

      {activeTab === "clones" && (
        <CommunityClonesTab
          locale={locale}
          isOwner={isOwner}
          onSuccessToast={showSuccess}
          onErrorToast={showError}
        />
      )}

      {activeTab === "wall" && (
        <CommunityWallTab
          communities={safeOverview.myCommunities}
          locale={locale}
          isOwner={isOwner}
          currentClientId={currentClientId}
          onSuccessToast={showSuccess}
          onErrorToast={showError}
        />
      )}

      {activeTab === "network" && (
        <CommunityNetworkTab
          overview={safeOverview}
          locale={locale}
          isOwner={isOwner}
          onSuccessToast={showSuccess}
          onErrorToast={showError}
          onDataMutated={reloadOverview}
        />
      )}

      {activeTab === "leader" && (
        <CommunityLeaderTab
          overview={safeOverview}
          locale={locale}
          isOwner={isOwner}
          onSuccessToast={showSuccess}
          onErrorToast={showError}
          onDataMutated={reloadOverview}
        />
      )}
    </div>
  );
}

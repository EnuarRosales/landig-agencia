"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { TeamInvitationPublicPreviewDto } from "@mocter/domain";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  Input,
  Label,
} from "@mocter/ui";
import { getAdminDictionary, type AdminLocale } from "@/lib/i18n";

interface InviteAcceptViewProps {
  token: string;
  preview: TeamInvitationPublicPreviewDto;
  locale?: AdminLocale;
}

/**
 * Vista pública Mobile First para aceptar una invitación al equipo de un comercio (`SPEC-12`).
 * Soporta creación de cuenta nueva o vinculación segura de una cuenta existente sin sobrescribir su contraseña.
 */
export function InviteAcceptView({
  token,
  preview,
  locale = "es",
}: InviteAcceptViewProps) {
  const router = useRouter();
  const dict = getAdminDictionary(locale);
  const w = dict.workspace;

  const [displayName, setDisplayName] = useState(preview.displayName ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!preview.existingAccount) {
      if (password !== confirmPassword) {
        setError(w.invitePasswordMismatch);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = preview.existingAccount
        ? {
            token,
            displayName: displayName.trim() || undefined,
            currentPassword,
          }
        : {
            token,
            displayName: displayName.trim(),
            password,
          };

      const res = await fetch("/api/tenant/team/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(
          json?.detail ||
            json?.error ||
            "No fue posible aceptar la invitación. Verifica tus datos.",
        );
        return;
      }

      setAccepted(true);
      router.push(json.data?.redirectTo || "/workspace");
      router.refresh();
    } catch {
      setError("Error de conexión al procesar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!preview.valid) {
    const isExpired = preview.reason === "expired";
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-[var(--dsn-background)]">
        <Card className="w-full max-w-md rounded-2xl p-6 shadow-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
            {isExpired ? (
              <Clock className="h-6 w-6 text-amber-500" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-rose-500" />
            )}
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {isExpired ? w.inviteExpiredTitle : w.inviteInvalidTitle}
          </h1>
          <p className="text-sm text-[var(--dsn-text-secondary)] leading-relaxed">
            {isExpired ? w.inviteExpiredDesc : w.inviteInvalidDesc}
          </p>
          {preview.tenantName && (
            <div className="rounded-lg border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/40 px-3 py-2 text-xs text-[var(--dsn-text-secondary)]">
              <span className="font-semibold text-[var(--dsn-text)]">
                {preview.tenantName}
              </span>
              {preview.emailHint ? ` · ${preview.emailHint}` : ""}
            </div>
          )}
        </Card>
      </div>
    );
  }

  if (preview.hasActiveMembershipConflict) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4 bg-[var(--dsn-background)]">
        <Card className="w-full max-w-md rounded-2xl p-6 shadow-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {w.inviteConflictTitle}
          </h1>
          <p className="text-sm text-[var(--dsn-text-secondary)] leading-relaxed">
            {w.inviteConflictDesc}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-[var(--dsn-background)]">
      <Card className="w-full max-w-md rounded-2xl p-6 md:p-7 shadow-xl space-y-5">
        <div className="space-y-2">
          <Badge variant="accent" className="gap-1.5 px-2.5 py-1">
            <UserPlus className="h-3.5 w-3.5" />
            <span>{w.inviteBadge}</span>
          </Badge>
          <h1 className="text-xl font-bold tracking-tight text-[var(--dsn-text)]">
            {w.inviteTitle} {preview.tenantName}
          </h1>
          <p className="text-xs md:text-sm text-[var(--dsn-text-secondary)]">
            {w.inviteSubtitle}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--dsn-border)] bg-[var(--dsn-surface-secondary)]/30 p-3.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--dsn-text-secondary)]">{w.inviteEmailLabel}</span>
            <span className="font-mono font-medium text-[var(--dsn-text)]">
              {preview.emailHint}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--dsn-text-secondary)]">{w.inviteRoleLabel}</span>
            <span className="font-medium text-[var(--dsn-text)]">{w.teamRoleAgent}</span>
          </div>
        </div>

        {preview.existingAccount && (
          <Alert variant="info">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed">
              {w.inviteExistingNotice}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {accepted ? (
          <Alert variant="success">
            <CheckCircle2 className="h-5 w-5" />
            <AlertDescription className="text-sm">{w.inviteAcceptingCta}</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-display-name"
                className="block text-xs font-medium text-[var(--dsn-text)]"
              >
                {w.inviteFieldDisplayName}
              </Label>
              <Input
                id="invite-display-name"
                type="text"
                required={!preview.existingAccount}
                minLength={2}
                maxLength={160}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="min-h-[44px] bg-[var(--dsn-background)] text-sm"
              />
            </div>

            {preview.existingAccount ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="invite-current-password"
                  className="block text-xs font-medium text-[var(--dsn-text)]"
                >
                  {w.inviteFieldCurrentPassword}
                </Label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-[var(--dsn-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="invite-current-password"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="min-h-[44px] bg-[var(--dsn-background)] pl-9 text-sm"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="invite-password"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {w.inviteFieldPassword}
                  </Label>
                  <Input
                    id="invite-password"
                    type="password"
                    required
                    minLength={7}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-[44px] bg-[var(--dsn-background)] text-sm"
                  />
                  <p className="text-[11px] text-[var(--dsn-text-secondary)]">
                    {w.invitePasswordRules}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="invite-confirm-password"
                    className="block text-xs font-medium text-[var(--dsn-text)]"
                  >
                    {w.inviteFieldConfirmPassword}
                  </Label>
                  <Input
                    id="invite-confirm-password"
                    type="password"
                    required
                    minLength={7}
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="min-h-[44px] bg-[var(--dsn-background)] text-sm"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              loading={submitting}
              loadingText={w.inviteAcceptingCta}
              className="w-full min-h-[44px] text-sm"
            >
              <span>{w.inviteAcceptCta}</span>
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

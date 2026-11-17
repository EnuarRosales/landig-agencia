import { cookies, headers } from "next/headers";
import { getTenantContactsAndUsersService } from "@mocter/domain";
import { resolveActiveLocale } from "@/lib/i18n";
import { InviteAcceptView } from "./invite-accept-view";

export const dynamic = "force-dynamic";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

/**
 * Página pública de aceptación de invitación de colaborador de equipo (`/invite/[token]`, `SPEC-12`).
 */
export default async function InviteAcceptPage({ params }: InvitePageProps) {
  const [{ token }, cookieStore, headerStore] = await Promise.all([
    params,
    cookies(),
    headers(),
  ]);

  const service = getTenantContactsAndUsersService();
  const preview = await service.getInvitationPreview(token);

  const locale = resolveActiveLocale({
    userLocale: cookieStore.get("mocter_locale")?.value,
    tenantLocale: preview.locale ?? null,
    browserAcceptLanguage: headerStore.get("accept-language"),
  });

  return (
    <InviteAcceptView
      token={token}
      preview={preview}
      locale={locale}
    />
  );
}

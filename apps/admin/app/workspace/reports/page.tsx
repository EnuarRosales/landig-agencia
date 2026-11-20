import { cookies, headers } from "next/headers";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { BarChart3, Lock } from "lucide-react";
import Link from "next/link";
import { Button, Card } from "@mocter/ui";
import { getAdminDictionary } from "@/lib/i18n";
import { resolvePortalPageLocale } from "@/lib/resolve-page-locale";

export const dynamic = "force-dynamic";

export default async function WorkspaceReportsPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();
  const cookieLocale = cookieStore.get("mocter_locale")?.value ?? null;
  const acceptLanguage = headerStore.get("accept-language");

  let hasCapability = false;
  let context = null;
  if (sid) {
    context = await resolveAuthenticatedPortalContext(sid, {
      browserAcceptLanguage: acceptLanguage,
      cookieLocale,
    });
    hasCapability = !!context?.capabilities?.data_export;
  }

  const locale = resolvePortalPageLocale({
    context,
    cookieLocale,
    acceptLanguage,
  });
  const dict = getAdminDictionary(locale).workspace;

  if (!hasCapability) {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <Card className="rounded-2xl p-12 text-center max-w-lg mx-auto">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mx-auto mb-4 border border-amber-500/20">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            {dict.reportsUnavailableTitle}
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-2">
            {dict.reportsUnavailableDesc}
          </p>
          <div className="mt-6">
            <Button asChild variant="primary" className="text-xs">
              <Link href="/workspace/billing">
                <span>{dict.reportsViewPlansCta}</span>
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)]">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-[var(--dsn-text)]">
            {dict.reportsTitle}
          </h1>
        </div>
      </header>
      <Card className="rounded-2xl p-6">
        <p className="text-xs text-[var(--dsn-text-secondary)]">
          {dict.reportsReadyDesc}
        </p>
      </Card>
    </div>
  );
}


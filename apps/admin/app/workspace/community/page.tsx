import { cookies } from "next/headers";
import { resolveAuthenticatedPortalContext } from "@mocter/domain";
import { Globe, Lock } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkspaceCommunityPage() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const sidCookieName = isProduction ? "__Host-mocter_sid" : "mocter_sid";
  const sid = (cookieStore.get(sidCookieName)?.value || cookieStore.get("mocter_sid")?.value)?.trim();

  let hasCapability = false;
  if (sid) {
    const context = await resolveAuthenticatedPortalContext(sid);
    hasCapability = !!context?.capabilities?.community_feed;
  }

  if (!hasCapability) {
    return (
      <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
        <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-12 text-center max-w-lg mx-auto shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 mx-auto mb-4 border border-amber-500/20">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-[var(--dsn-text)]">
            Red Mayorista Y Comunidad No Disponible
          </h1>
          <p className="text-xs text-[var(--dsn-text-secondary)] mt-2">
            La participación en la red mayorista y feed de productos compartidos requiere habilitación de comunidad en tu suscripción.
          </p>
          <div className="mt-6">
            <Link
              href="/workspace/billing"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dsn-accent)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <span>Ver Planes Disponibles</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 md:px-8 md:py-6">
      <header className="flex items-center justify-between pb-4 border-b border-[var(--dsn-border)]">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-cyan-400" />
          <h1 className="text-xl font-bold text-[var(--dsn-text)]">
            Red Mayorista Y Comunidad
          </h1>
        </div>
      </header>
      <div className="rounded-2xl border border-[var(--dsn-border)] bg-[var(--dsn-surface)] p-6 shadow-xs">
        <p className="text-xs text-[var(--dsn-text-secondary)]">
          Catálogo mayorista y red colaborativa de comercios habilitada.
        </p>
      </div>
    </div>
  );
}


import type { Metadata } from "next";
import { FloatingBackground } from "@/components/sections/floating-background";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/sections/footer";
import { WhatsappFab } from "@/components/sections/whatsapp-fab";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CookiePreferences } from "@/components/cookie-preferences";
import { siteConfig } from "@/config/site";

import { locales } from "@/i18n/routing";

const SITE_URL = siteConfig.url;

type Props = PageProps<"/[locale]">;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === "es";

  return {
    title: isEs
      ? "Configuración de Privacidad y Política de Cookies"
      : "Privacy Settings and Cookie Policy",
    description: isEs
      ? "Administra tus preferencias de privacidad y cookies en Mocter. Conoce qué datos almacenamos y controla tu experiencia de navegación."
      : "Manage your privacy and cookie preferences on Mocter. Learn what data we store and control your browsing experience.",
    alternates: {
      canonical: `${SITE_URL}/${locale}/cookies`,
      languages: {
        es: `${SITE_URL}/es/cookies`,
        en: `${SITE_URL}/en/cookies`,
        "x-default": `${SITE_URL}/es/cookies`,
      },
    },
  };
}

export default async function CookiesPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === "es";

  const breadcrumbs = [
    { label: isEs ? "Inicio" : "Home", href: `/${locale}` },
    { label: isEs ? "Configuración de Privacidad" : "Privacy Settings" },
  ];

  return (
    <>
      <FloatingBackground />
      <Nav />

      <main className="relative z-10 mx-auto min-h-screen max-w-5xl px-[clamp(18px,5vw,40px)] pb-24 pt-32">
        <Breadcrumbs items={breadcrumbs} className="mb-8" />

        <header className="mb-10 border-b border-stroke pb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-stroke bg-surface px-3 py-1 text-xs font-semibold text-a2">
            <span>🍪</span>
            <span>{isEs ? "Control de Privacidad y Preferencias" : "Privacy Control & Preferences"}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-txt sm:text-4xl">
            {isEs
              ? "Configuración de Privacidad y Política de Cookies"
              : "Privacy Settings & Cookie Policy"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
            {isEs
              ? "En Mocter creemos en la transparencia absoluta. En este panel puedes consultar qué tecnologías de almacenamiento utilizamos y configurar en cualquier momento qué cookies deseas habilitar o deshabilitar."
              : "At Mocter, we believe in total transparency. In this panel, you can inspect which storage technologies we employ and customize which cookies you wish to enable or disable at any time."}
          </p>
        </header>

        {/* Panel Interactivo de Preferencias */}
        <section className="mb-14">
          <CookiePreferences />
        </section>

        {/* Explicación Detallada */}
        <div className="space-y-10 text-sm leading-relaxed text-muted sm:text-[15px]">
          <section className="rounded-2xl border border-stroke bg-surface/70 p-6">
            <h2 className="mb-3 text-lg font-bold text-txt">
              {isEs ? "¿Qué son las cookies y para qué se utilizan?" : "What are cookies and why are they used?"}
            </h2>
            <p>
              {isEs
                ? "Las cookies y las tecnologías de almacenamiento local (como localStorage y sessionStorage) son pequeños archivos de datos que los sitios web guardan en el navegador de tu dispositivo. Permiten recordar tus preferencias de navegación (como el idioma o el modo visual oscuro/claro), asegurar el funcionamiento del chat de atención en vivo y optimizar la velocidad y estabilidad del portal."
                : "Cookies and local storage technologies are small files that websites store in your browser. They allow us to remember your navigation preferences (such as language or dark/light mode), keep customer support chat active, and optimize portal performance."}
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold text-txt">
              {isEs ? "Inventario de Tecnologías Utilizadas en Mocter" : "Inventory of Technologies Used on Mocter"}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-stroke bg-surface">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-stroke bg-bg2/60 text-xs font-semibold uppercase text-txt">
                  <tr>
                    <th className="p-3.5">Nombre</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Finalidad</th>
                    <th className="p-3.5">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke/60 text-muted">
                  <tr>
                    <td className="p-3.5 font-mono text-a2">NEXT_LOCALE</td>
                    <td className="p-3.5">Cookie esencial</td>
                    <td className="p-3.5">Conserva el idioma seleccionado por el usuario (español o inglés).</td>
                    <td className="p-3.5">1 año</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-mono text-a2">mocter-theme</td>
                    <td className="p-3.5">Almacenamiento local</td>
                    <td className="p-3.5">Guarda la preferencia de tema visual (oscuro o claro).</td>
                    <td className="p-3.5">Persistente</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-mono text-a2">mocter_cookie_preferences</td>
                    <td className="p-3.5">Almacenamiento local</td>
                    <td className="p-3.5">Almacena el estado de consentimiento otorgado por el usuario.</td>
                    <td className="p-3.5">Persistente</td>
                  </tr>
                  <tr>
                    <td className="p-3.5 font-mono text-a2">chatwoot_session</td>
                    <td className="p-3.5">Soporte en vivo</td>
                    <td className="p-3.5">Mantiene activa la sesión de chat con el equipo de soporte.</td>
                    <td className="p-3.5">Sesión / 30 días</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-stroke bg-surface/70 p-6">
            <h2 className="mb-3 text-lg font-bold text-txt">
              {isEs ? "¿Cómo desactivar cookies desde tu navegador?" : "How to disable cookies from your browser?"}
            </h2>
            <p className="mb-3">
              {isEs
                ? "Además de utilizar nuestro panel interactivo anterior, puedes configurar o revocar el uso de cookies directamente en las opciones de configuración de tu navegador web:"
                : "In addition to our management panel above, you can configure or revoke cookies directly in your browser settings:"}
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-xs">
              <li><strong>Google Chrome:</strong> Configuración &gt; Privacidad y seguridad &gt; Cookies y otros datos de sitios.</li>
              <li><strong>Mozilla Firefox:</strong> Ajustes &gt; Privacidad y seguridad &gt; Cookies y datos del sitio.</li>
              <li><strong>Microsoft Edge:</strong> Configuración &gt; Cookies y permisos del sitio.</li>
              <li><strong>Apple Safari:</strong> Preferencias &gt; Privacidad &gt; Bloquear todas las cookies.</li>
            </ul>
          </section>
        </div>
      </main>

      <Footer />
      <WhatsappFab />
      <ServiceWorkerRegistrar />
    </>
  );
}

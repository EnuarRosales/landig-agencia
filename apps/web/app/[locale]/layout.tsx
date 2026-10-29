import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { ChatwootWidget } from "@/components/chatwoot-widget";
import { siteConfig } from "@/config/site";
import "../globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = siteConfig.url;

type Props = LayoutProps<"/[locale]">;

export const instant = false;

export async function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("title"),
      template: "%s · Mocter",
    },
    description: t("description"),
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.ico", sizes: "any" },
      ],
      apple: "/icon.svg",
    },
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        es: `${SITE_URL}/es`,
        en: `${SITE_URL}/en`,
        "x-default": `${SITE_URL}/es`,
      },
    },
    openGraph: {
      type: "website",
      siteName: "Mocter",
      url: `${SITE_URL}/${locale}`,
      title: t("ogTitle"),
      description: t("ogDescription"),
      locale: locale === "es" ? "es_CO" : "en_US",
    },
    twitter: {
      card: "summary",
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: siteConfig.theme.color,
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: "jsonld" }),
    getMessages({ locale }),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: siteConfig.name,
        legalName: siteConfig.legalName,
        url: SITE_URL,
        email: siteConfig.supportEmail,
        description: t("description"),
        knowAbout: "Automatización de atención al cliente, agendamiento y ventas con IA por WhatsApp",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/${locale}`,
        name: siteConfig.name,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: siteConfig.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: t("softwareDescription"),
        areaServed: siteConfig.areaServed,
        inLanguage: locale,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "COP",
          description: locale === "es" ? "Demo gratuita" : "Free demo",
        },
      },
    ],
  };

  return (
    <html
      lang={locale}
      className={`${sora.variable} ${inter.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="font-sans" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme={siteConfig.theme.defaultTheme}
          enableSystem={false}
          storageKey={siteConfig.theme.storageKey}
          disableTransitionOnChange
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
        <ChatwootWidget />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Sanitized per Next.js JSON-LD guidance: strip inline `<` to avoid XSS.
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
